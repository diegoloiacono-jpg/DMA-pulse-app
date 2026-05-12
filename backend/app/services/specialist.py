"""
Platform Specialist Agent — calls the gemini_3_auditor BQML remote model.

For each of the five audit categories it:
  1. Serialises the extracted DataFrame into a compact JSON summary
  2. Calls ML.GENERATE_TEXT with a structured prompt
  3. Parses the model response into a list[SpecialistResult]
  4. Falls back to warn-level stubs on any parse error
"""
from __future__ import annotations

import json
import textwrap

import pandas as pd

from app.config import GCP_PROJECT, BQ_DATASET, SPECIALIST_MODEL
from app.models.audit import SpecialistResult
from app.services.bigquery import run_query

# Topics expected per category — used to generate fallback stubs
_CATEGORY_TOPICS: dict[str, list[str]] = {
    "campaign_setup": [
        "Campaign naming convention",
        "Campaign status hygiene",
        "Bidding strategy",
        "Budget allocation",
        "Campaign type mix",
        "Scheduling & dayparting",
    ],
    "audience_targeting": [
        "Audience segmentation",
        "Remarketing lists",
        "Similar audiences / lookalikes",
        "Demographic targeting",
        "Geo targeting precision",
        "Exclusion lists",
    ],
    "conversion_kpi": [
        "Conversion tracking setup",
        "Conversion categories",
        "Primary vs secondary conversions",
        "ROAS / CPA targets",
        "Attribution model",
        "Cross-device conversions",
    ],
    "feeds_catalogue": [
        "Product feed completeness",
        "Product title optimisation",
        "Feed segmentation",
        "Shopping campaign structure",
        "Dynamic remarketing feed",
    ],
    "creative_content": [
        "Responsive search ad coverage",
        "Asset group ad strength",
        "Headline / description variety",
        "Image & video assets",
        "Ad policy compliance",
        "Ad copy relevance",
    ],
}

_SYSTEM_PROMPT = textwrap.dedent("""
You are a senior Google Ads specialist conducting a Digital Maturity Assessment.
You will receive a JSON summary of raw Google Ads data for one audit category.

Analyse the data and return ONLY a valid JSON array where each element has exactly
these fields:
  - topic        (string): the audit topic name
  - category     (string): the category name passed in the prompt
  - status       ("pass" | "fail" | "warn")
  - level        ("basic" | "advanced" | "expert" | "champion")
  - source       (string): the BigQuery table/column(s) used
  - action       (string): recommended action if status is fail or warn, else "None"
  - explanation  (string): one or two sentences explaining the score

Level definitions:
  basic     = feature is present but minimally configured
  advanced  = feature is well configured with some best practices
  expert    = feature follows most best practices at scale
  champion  = feature is fully optimised and industry-leading

Return ONLY the JSON array — no markdown, no preamble.
""").strip()


def _summarise_df(df: pd.DataFrame, max_rows: int = 50) -> str:
    """Convert a DataFrame to a compact JSON summary safe for prompt injection."""
    if df.empty:
        return json.dumps({"_empty": True})

    # Remove error frames
    if "_error" in df.columns:
        return json.dumps({"_error": df["_error"].iloc[0]})

    # Drop columns with all-null values to reduce tokens
    df = df.dropna(axis=1, how="all")

    # Cap rows and convert micros → dollars for readability
    sample = df.head(max_rows).copy()
    for col in sample.columns:
        if "micros" in col:
            sample[col] = (sample[col] / 1_000_000).round(2)
            sample.rename(columns={col: col.replace("_micros", "_usd")}, inplace=True)

    return sample.to_json(orient="records", default_handler=str)


def _call_bqml(category: str, data_json: str, topics: list[str]) -> list[SpecialistResult]:
    """Send one ML.GENERATE_TEXT call for a single category and parse the result."""
    topic_list = "\n".join(f"  - {t}" for t in topics)
    user_prompt = (
        f"Category: {category}\n\n"
        f"Topics to evaluate:\n{topic_list}\n\n"
        f"Data (JSON):\n{data_json}"
    )
    full_prompt = _SYSTEM_PROMPT + "\n\n" + user_prompt

    # Escape single quotes for BigQuery string literal
    escaped = full_prompt.replace("'", "\\'")

    sql = f"""
    SELECT ml_generate_text_result AS result
    FROM ML.GENERATE_TEXT(
        MODEL `{SPECIALIST_MODEL}`,
        (SELECT '{escaped}' AS prompt),
        STRUCT(
            0.1  AS temperature,
            4096 AS max_output_tokens,
            TRUE AS flatten_json_output
        )
    )
    """

    df = run_query(sql)
    raw = df["result"].iloc[0] if not df.empty else ""

    # The model may wrap the array in a markdown code fence — strip it
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    parsed = json.loads(raw)
    return [SpecialistResult(**item) for item in parsed]


def _fallback_stubs(category: str, reason: str) -> list[SpecialistResult]:
    """Return warn-level stubs when the BQML call or parse fails."""
    return [
        SpecialistResult(
            topic=topic,
            category=category,
            status="warn",
            level="basic",
            source="parse_error",
            action="Review manually — automated analysis unavailable",
            explanation=f"Could not analyse this topic automatically: {reason}",
        )
        for topic in _CATEGORY_TOPICS.get(category, ["Unknown topic"])
    ]


def run_specialist_agent(
    audit_data: dict[str, pd.DataFrame],
) -> list[SpecialistResult]:
    """
    Run the specialist agent over all five categories and return a combined
    list of SpecialistResult objects.
    """
    all_results: list[SpecialistResult] = []

    for category, df in audit_data.items():
        topics = _CATEGORY_TOPICS.get(category, [])
        data_json = _summarise_df(df)
        try:
            results = _call_bqml(category, data_json, topics)
            all_results.extend(results)
        except Exception as exc:
            all_results.extend(_fallback_stubs(category, str(exc)))

    return all_results
