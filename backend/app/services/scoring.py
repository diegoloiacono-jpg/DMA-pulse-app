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
from app.services.criteria_ice import get_ice

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

# Sources that mean the specialist had no data to judge the topic.
_LOW_EVIDENCE_SOURCES = {"no_data_source", "missing", "parse_error"}

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
    results = [r for r in results if not r.not_applicable]
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

    # Impact / Confidence / Ease (1-5) come from the criteria sheet.
    # Priority = ICE average scaled to 0-10. Confidence is capped when the
    # specialist had no real evidence for the topic.
    wins: list[PrioritizedWin] = []
    for r in results:
        if r.status == "pass":
            continue
        impact, confidence, ease = get_ice(r.category, r.topic)
        if r.source in _LOW_EVIDENCE_SOURCES:
            confidence = min(confidence, 2.0)
        priority = min((impact + confidence + ease) / 3.0 * 2.0, 10.0)
        wins.append(PrioritizedWin(
            topic=r.topic,
            category=r.category,
            impact=float(impact),
            confidence=float(confidence),
            ease=float(ease),
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
