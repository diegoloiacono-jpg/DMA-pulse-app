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

import json
import textwrap
from typing import Literal

from app.config import SCORING_MODEL
from app.models.audit import (
    CategoryScore,
    PrioritizedWin,
    ScoringOutput,
    SpecialistResult,
)
from app.services.bigquery import run_query

# Base category weights (mirror auditData.ts category weight fields)
_BASE_WEIGHTS: dict[str, float] = {
    "campaign_setup": 1.0,
    "audience_targeting": 1.0,
    "conversion_kpi": 1.0,
    "feeds_catalogue": 1.0,
    "creative_content": 1.0,
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

# ICE impact/ease heuristics per maturity level (mirror roadmapLogic.ts)
_LEVEL_ICE: dict[str, tuple[float, float]] = {
    "basic":    (8.0, 3.0),
    "advanced": (6.0, 5.0),
    "expert":   (4.0, 7.0),
    "champion": (3.0, 9.0),
}

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

    # ICE prioritisation — only surface fail/warn topics
    wins: list[PrioritizedWin] = []
    for r in results:
        if r.status == "pass":
            continue
        impact, ease = _LEVEL_ICE.get(r.level, (5.0, 5.0))
        confidence = 8.0 if r.source != "parse_error" else 4.0
        priority = min(impact * confidence * ease / 10, 10.0)
        wins.append(PrioritizedWin(
            topic=r.topic,
            category=r.category,
            impact=impact,
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


# ---------------------------------------------------------------------------
# BQML scoring agent call
# ---------------------------------------------------------------------------

_SCORING_SYSTEM_PROMPT = textwrap.dedent("""
You are a Digital Maturity scoring engine.
You receive a JSON array of specialist audit results and must return a scoring
summary as a single JSON object with exactly these fields:

{
  "category_scores": [
    {"name": "<category>", "score": <0-100>, "pass_rate": <0-100>, "weight": <float>}
  ],
  "platform_score": <0-100>,
  "maturity_label": "Basic" | "Advanced" | "Expert" | "Champion",
  "quick_wins": [
    {
      "topic": "<topic>",
      "category": "<category>",
      "impact": <1-10>,
      "confidence": <1-10>,
      "ease": <1-10>,
      "priority_score": <0-10>,
      "action": "<action>",
      "explanation": "<explanation>"
    }
  ]
}

Scoring rules:
- category score = (topics with level advanced/expert/champion) / total_topics * 100
- platform_score = weighted average of category scores (weights already provided)
- ICE priority = (impact * confidence * ease) / 10, capped at 10
- Only include fail or warn topics in quick_wins, sorted by priority descending
- Return the top 10 quick wins maximum
- Return ONLY the JSON object — no markdown, no preamble
""").strip()


def _call_bqml_scoring(
    results: list[SpecialistResult],
    model: str,
) -> dict:
    results_json = json.dumps([r.model_dump() for r in results])
    user_prompt = f"Business model: {model}\n\nSpecialist results:\n{results_json}"
    full_prompt = _SCORING_SYSTEM_PROMPT + "\n\n" + user_prompt
    escaped = full_prompt.replace("'", "\\'")

    sql = f"""
    SELECT ml_generate_text_result AS result
    FROM ML.GENERATE_TEXT(
        MODEL `{SCORING_MODEL}`,
        (SELECT '{escaped}' AS prompt),
        STRUCT(
            0.1  AS temperature,
            4096 AS max_output_tokens,
            TRUE AS flatten_json_output
        )
    )
    """

    df = run_query(sql)
    raw = df["result"].iloc[0] if not df.empty else "{}"
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    return json.loads(raw)


def run_scoring_agent(
    results: list[SpecialistResult],
    brand_model: Literal["B2B", "B2C", "D2C"],
    platform_id: str = "sea-google",
) -> ScoringOutput:
    """
    Compute the final ScoringOutput.  Tries BQML first; falls back to the
    pure-Python implementation if the model call or parse fails.
    """
    # Always compute the Python fallback — it's cheap and guarantees a result
    fallback = _compute_python(results, brand_model, platform_id)

    try:
        bqml_data = _call_bqml_scoring(results, brand_model)

        category_scores = [
            CategoryScore(**cs) for cs in bqml_data.get("category_scores", [])
        ]
        quick_wins = [
            PrioritizedWin(**w) for w in bqml_data.get("quick_wins", [])
        ]
        platform_score = float(bqml_data.get("platform_score", fallback.platform_score))

        return ScoringOutput(
            platform_id=platform_id,
            category_scores=category_scores or fallback.category_scores,
            platform_score=round(platform_score, 1),
            maturity_label=_maturity_label(platform_score),
            quick_wins=quick_wins or fallback.quick_wins,
        )
    except Exception:
        return fallback
