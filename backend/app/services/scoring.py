"""
Scoring Agent — calls gemini_model (BQML) to apply ICE scoring and
compute category/platform scores with business-model multipliers.

A pure-Python fallback is always computed in parallel.  If the BQML call
or JSON parse fails, the fallback result is used so the pipeline never stalls.

Business-model multipliers mirror auditCriteria.ts exactly:
  B2B  : conversion_kpi ×1.5, lead ×1.5, audience_targeting ×1.3,
         attribution ×1.3, bid_budget ×1.2
  B2C/D2C: feeds_catalogue ×1.5, creative_content ×1.3,
            conversion_kpi ×1.2, audience_targeting ×1.2
"""
from __future__ import annotations

import logging
from typing import Literal

from app.models.audit import (
    CategoryScore,
    PrioritizedWin,
    ScoringOutput,
    SpecialistResult,
)
logger = logging.getLogger(__name__)

# Base category weights (mirror auditData.ts category weight fields)
_BASE_WEIGHTS: dict[str, float] = {
    "campaign_setup": 1.0,
    "audience_targeting": 1.0,
    "conversion_kpi": 1.0,
    "feeds_catalogue": 1.0,
    "creative_content": 1.0,
    "keyword_strategy": 1.0,
    "ai_readiness": 1.0,
    "pmax_performance": 1.0,  # legacy alias
    "attribution": 1.0,
    "bid_budget": 1.0,
    "lead": 1.0,
}

_B2B_MULTIPLIERS: dict[str, float] = {
    "conversion_kpi": 1.5,
    "lead": 1.5,
    "audience_targeting": 1.3,
    "attribution": 1.3,
    "bid_budget": 1.2,
}

_B2C_D2C_MULTIPLIERS: dict[str, float] = {
    "feeds_catalogue": 1.5,
    "creative_content": 1.3,
    "conversion_kpi": 1.2,
    "audience_targeting": 1.2,
}

# ICE ease heuristics per maturity level (impact now comes from _TOPIC_IMPACT)
_LEVEL_ICE: dict[str, tuple[float, float]] = {
    "basic":    (8.0, 3.0),
    "advanced": (6.0, 5.0),
    "expert":   (4.0, 7.0),
    "champion": (3.0, 9.0),
}

# Per-topic impact scores (1–5) defined by the DMA criteria sheet.
# Priority = topic_impact * 2.0  →  range 2–10 (scale 1-5 to 2-10).
# Keyed as "category::topic_lower" — normalised on lookup.
_TOPIC_IMPACT: dict[str, float] = {
    # campaign_setup
    "campaign_setup::campaign naming convention": 2.0,
    "campaign_setup::campaign status hygiene":   2.0,
    "campaign_setup::bidding strategy":          5.0,
    "campaign_setup::budget allocation":         5.0,
    "campaign_setup::campaign type mix":         3.0,
    "campaign_setup::scheduling & dayparting":   3.0,
    "campaign_setup::data density":              4.0,
    # audience_targeting
    "audience_targeting::audience segmentation":        4.0,
    "audience_targeting::remarketing lists":            2.0,
    "audience_targeting::similar audiences / lookalikes": 3.0,
    "audience_targeting::demographic targeting":        2.0,
    "audience_targeting::geo targeting precision":      4.0,
    "audience_targeting::exclusion lists":              4.0,
    # conversion_kpi
    "conversion_kpi::conversion tracking setup":        5.0,
    "conversion_kpi::conversion categories":            5.0,
    "conversion_kpi::primary vs secondary conversions": 5.0,
    "conversion_kpi::roas / cpa targets":               5.0,
    "conversion_kpi::target stability":                 4.0,
    "conversion_kpi::attribution model":                5.0,
    "conversion_kpi::cross-device conversions":         3.0,
    # feeds_catalogue
    "feeds_catalogue::product feed completeness":   5.0,
    "feeds_catalogue::product title optimisation":  3.0,
    "feeds_catalogue::feed segmentation":           4.0,
    "feeds_catalogue::shopping campaign structure": 5.0,
    "feeds_catalogue::dynamic remarketing feed":    3.0,
    "feeds_catalogue::conversational attributes":   2.0,
    # creative_content
    "creative_content::responsive search ad coverage":   5.0,
    "creative_content::asset group ad strength":         4.0,
    "creative_content::headline / description variety":  3.0,
    "creative_content::image & video assets":            4.0,
    "creative_content::ad policy compliance":            5.0,
    "creative_content::ad copy relevance":               4.0,
    # keyword_strategy
    "keyword_strategy::keyword match type distribution": 5.0,
    "keyword_strategy::negative keyword coverage":       5.0,
    "keyword_strategy::keyword quality scores":          3.0,
    "keyword_strategy::keyword status hygiene":          4.0,
    "keyword_strategy::ad group keyword structure":      4.0,
    "keyword_strategy::dsa / dynamic ad groups":         3.0,
    # ai_readiness (formerly pmax_performance)
    "ai_readiness::pmax campaign adoption":                        5.0,
    "ai_readiness::asset group strength":                          4.0,
    "ai_readiness::audience signal quality":                       3.0,
    "ai_readiness::smart bidding configuration":                   3.0,
    "ai_readiness::pmax vs. standard campaign balance":            4.0,
    "ai_readiness::pmax vs standard campaign balance":             4.0,
    "ai_readiness::ai max":                                        4.0,
    "ai_readiness::native ai-driven generative tools in ai max":   3.0,
    "ai_readiness::native ai-driven generative tools in pmax":     1.0,
    # fallback aliases for old category key during transition
    "pmax_performance::pmax campaign adoption":              5.0,
    "pmax_performance::asset group strength":                4.0,
    "pmax_performance::audience signal quality":             3.0,
    "pmax_performance::smart bidding configuration":         3.0,
    "pmax_performance::pmax vs standard campaign balance":   4.0,
}


def _get_topic_impact(category: str, topic: str) -> float:
    key = f"{category.lower()}::{topic.lower()}"
    return _TOPIC_IMPACT.get(key, 3.0)  # default mid-range for unlisted topics

_MATURITY_LABELS: list[tuple[float, str]] = [
    (80.0, "Champion"),
    (60.0, "Expert"),
    (40.0, "Advanced"),
    (0.0,  "Basic"),
]


def _multiplier(category: str, model: str) -> float:
    if model == "B2B":
        return _B2B_MULTIPLIERS.get(category, 1.0)
    return _B2C_D2C_MULTIPLIERS.get(category, 1.0)


def _maturity_label(score: float) -> str:
    for threshold, label in _MATURITY_LABELS:
        if score >= threshold:
            return label
    return "Basic"


# ---------------------------------------------------------------------------
# Pure-Python fallback scoring
# ---------------------------------------------------------------------------

def _compute_python(
    results: list[SpecialistResult],
    model: str,
    platform_id: str,
) -> ScoringOutput:
    # Group results by category
    by_cat: dict[str, list[SpecialistResult]] = {}
    for r in results:
        by_cat.setdefault(r.category, []).append(r)

    category_scores: list[CategoryScore] = []
    weighted_sum = 0.0
    weight_total = 0.0

    for cat_name, items in by_cat.items():
        total = len(items)
        passed = sum(1 for i in items if i.level in ("advanced", "expert", "champion"))
        pass_rate = (passed / total * 100) if total else 0.0
        base_w = _BASE_WEIGHTS.get(cat_name, 1.0)
        adj_w = base_w * _multiplier(cat_name, model)

        category_scores.append(CategoryScore(
            name=cat_name,
            score=pass_rate,
            pass_rate=pass_rate,
            weight=adj_w,
        ))
        weighted_sum += pass_rate * adj_w
        weight_total += adj_w

    platform_score = (weighted_sum / weight_total) if weight_total else 0.0

    # Priority = topic_impact × 2  (scale 1–5 → 2–10).
    # High-impact topics always rank above low-impact ones regardless of maturity level.
    wins: list[PrioritizedWin] = []
    for r in results:
        if r.status == "pass":
            continue
        topic_impact = _get_topic_impact(r.category, r.topic)
        _, ease = _LEVEL_ICE.get(r.level, (5.0, 5.0))
        confidence = 8.0 if r.source != "parse_error" else 4.0
        priority = min(topic_impact * 2.0, 10.0)
        wins.append(PrioritizedWin(
            topic=r.topic,
            category=r.category,
            impact=topic_impact,
            confidence=confidence,
            ease=ease,
            priority_score=round(priority, 2),
            action=r.action,
            explanation=r.explanation,
        ))

    wins.sort(key=lambda w: w.priority_score, reverse=True)

    return ScoringOutput(
        platform_id=platform_id,
        category_scores=category_scores,
        platform_score=round(platform_score, 1),
        maturity_label=_maturity_label(platform_score),
        quick_wins=wins[:10],
    )


def run_scoring_agent(
    results: list[SpecialistResult],
    brand_model: Literal["B2B", "B2C", "D2C"],
    platform_id: str = "sea-google",
) -> ScoringOutput:
    return _compute_python(results, brand_model, platform_id)
