"""
Platform Specialist Agent — calls Gemini via Vertex AI for each audit category.

For each of the five audit categories it:
  1. Serialises the extracted DataFrame into a compact JSON summary
  2. (For campaign_setup) pre-computes naming-convention compliance in Python
  3. Calls Gemini with a structured prompt via Vertex AI SDK
  4. Parses the model response into a list[SpecialistResult]
  5. Falls back to warn-level stubs on any parse error
"""
from __future__ import annotations

import json
import logging
import re
import textwrap
from typing import TYPE_CHECKING

logger = logging.getLogger(__name__)

import pandas as pd
from google import genai
from google.genai import types

from app.config import GCP_PROJECT
from app.models.audit import SpecialistResult

if TYPE_CHECKING:
    from app.models.brand import BrandContext

_GEMINI_MODEL = "gemini-2.5-flash"
_VERTEX_LOCATION = "us-central1"

_client: genai.Client | None = None

def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(vertexai=True, project=GCP_PROJECT, location=_VERTEX_LOCATION)
    return _client

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
You will receive a JSON summary of raw Google Ads data for one audit category,
followed by optional client brand context.

Analyse the data and return ONLY a valid JSON array where each element has exactly
these fields:
  - topic        (string): the audit topic name
  - category     (string): the category name passed in the prompt
  - status       ("pass" | "fail" | "warn")
  - level        ("basic" | "advanced" | "expert" | "champion")
  - source       (string): the BigQuery column(s) that most informed this result
  - action       (string): recommended action if status is fail or warn, else "None"
  - explanation  (string): one or two sentences explaining the score

Level definitions:
  basic     = feature is present but minimally configured
  advanced  = feature is well configured with some best practices
  expert    = feature follows most best practices at scale
  champion  = feature is fully optimised and industry-leading

=== PER-TOPIC EVALUATION CRITERIA ===

CAMPAIGN SETUP CATEGORY:
- Campaign naming convention:
    Look for a row where _summary is true; read _naming_convention_compliance_pct.
    >= 85% -> pass / expert;  60-84% -> warn / advanced;  <60% -> fail / basic.
    If that field is absent, evaluate qualitatively from campaign_name patterns.
- Campaign status hygiene:
    Count rows where status = "ENABLED" vs total active campaigns.
    >= 90% ENABLED -> pass;  70-89% -> warn;  <70% -> fail.
    Note paused campaigns with no recent activity.
- Bidding strategy:
    MAXIMIZE_CONVERSIONS, TARGET_CPA, TARGET_ROAS, MAXIMIZE_CONVERSION_VALUE = smart bidding.
    MANUAL_CPC, MANUAL_CPM = basic.
    >= 80% campaigns using smart bidding -> expert/champion;  50-79% -> advanced;  <50% -> basic.
- Budget allocation:
    Check has_recommended_budget. >= 30% of campaigns constrained -> warn;  >= 60% -> fail.
    Wide disparity (top campaign > 10x median budget) -> warn about concentration risk.
- Campaign type mix:
    Healthy mix includes Search, Shopping (if applicable), PMax or Display for retargeting.
    Single type only -> basic;  2 types -> advanced;  3+ types including PMax or Display -> expert/champion.
- Scheduling & dayparting:
    Absence of dayparting data = basic.
    Presence of bid adjustments by day/hour = advanced or above.

AUDIENCE TARGETING CATEGORY:
- Audience segmentation:
    Count distinct audience_id values from campaign_audience rows.
    0 audiences -> fail;  1-3 -> warn/basic;  4-10 -> pass/advanced;  >10 -> expert.
- Remarketing lists:
    Non-default bid modifiers (not 0 or 1) on audience rows indicate active remarketing.
    No remarketing rows -> fail;  present but no bid differentiation -> warn;  segmented with
    different bid modifiers per audience -> pass.
- Similar audiences / lookalikes:
    Presence of user_list_id entries typed as lookalike/similar -> pass.
    Absence -> fail for B2C/D2C;  warn for B2B.
- Demographic targeting:
    Gender and age_range_type rows from demographics source.
    All equal impressions/cost share -> basic.  Differentiated bids or exclusions -> advanced/expert.
- Geo targeting precision:
    criterion_type = "LOCATION" entries.  Single country only -> basic;  multiple cities/regions -> advanced;
    radius or store-proximity targeting -> expert.
- Exclusion lists:
    negative = true rows in campaign_criterion.  Zero negative exclusions -> fail.
    <5 exclusions -> warn;  >= 5 exclusions across multiple criterion_type values -> pass.

CONVERSION KPI CATEGORY:
- Conversion tracking setup:
    Any rows from campaign_conversion_stats with conversions > 0 -> tracking active.
    Zero conversions across all campaigns and dates -> fail (tracking likely broken or absent).
- Conversion categories:
    Count distinct conversion_category values.  Single category (e.g. PURCHASE only) -> warn.
    Multiple meaningful categories (PURCHASE + LEAD + SIGNUP) -> pass.
- Primary vs secondary conversions:
    If conversion_name contains micro/engagement terms alongside hard conversions -> expert.
    Only one conversion action present -> basic.
- ROAS / CPA targets:
    Campaigns with target_cpa_micros > 0 or target_roas > 0 -> targets are set.
    No targets across any campaign -> fail;  partial coverage -> warn;  all smart-bidding
    campaigns have targets -> pass.
- Attribution model:
    If structural_audit rows include attribution data, check for data-driven.
    Last-click only -> basic;  linear/time-decay -> advanced;  data-driven -> expert/champion.
- Cross-device conversions:
    Presence of cross-device conversion data -> advanced/expert.

FEEDS & CATALOGUE CATEGORY:
- Product feed completeness:
    % rows where product_title is null or empty.  >20% missing -> fail;  5-20% -> warn;  <5% -> pass.
- Product title optimisation:
    Average length of product_title strings.  <20 chars avg -> basic;  20-50 chars -> advanced;
    >50 chars with apparent brand/category terms -> expert.
- Feed segmentation:
    Distinct product_brand or product_channel values.  Single brand/channel only -> basic;
    multiple brands or channels -> advanced.
- Shopping campaign structure:
    Distinct campaign_id values in shopping data.  Single catch-all campaign -> basic;
    campaigns segmented by brand/category/margin -> expert.
- Dynamic remarketing feed:
    product_channel = "ONLINE" with active click data -> pass.  No shopping data at all -> fail.

CREATIVE CONTENT CATEGORY:
- Responsive search ad coverage:
    Rows with type = "RESPONSIVE_SEARCH_AD".  Zero RSAs -> fail;  some ad groups missing RSAs -> warn;
    all active ad groups have >= 1 RSA -> pass.
- Asset group ad strength:
    If ad_group_type includes PERFORMANCE_MAX, assess asset coverage.
    PMax present without full asset coverage -> warn;  no PMax -> note absence as basic.
- Headline / description variety:
    Count ad rows per ad_group_id.  1 ad per group -> basic;  2 ads -> advanced;  3+ ads -> expert.
- Image & video assets:
    Non-RSA ad types (IMAGE, VIDEO, DISPLAY) present -> advanced/expert signal.
    RSA-only -> basic.
- Ad policy compliance:
    status = "DISAPPROVED" or "UNDER_REVIEW" ads.  >10% of ads affected -> fail;  1-10% -> warn;
    zero disapprovals -> pass.
- Ad copy relevance:
    Evaluate qualitatively from ad_group_name versus campaign_name patterns.

=== CALIBRATION BY BRAND CONTEXT ===

When brand context is provided:
- B2B clients: weight Conversion KPI and Audience topics more heavily.
  A single conversion type is less severe if the client has long sales cycles.
- B2C/D2C clients: weight Feed quality and Creative diversity more heavily.
  Missing product titles or single-ad ad groups are more serious failures.
- Use _naming_convention_compliance_pct directly — do not re-evaluate it qualitatively.
- Use the client's target markets to contextualise geo-targeting precision scores.

Return ONLY the JSON array — no markdown, no preamble.
""").strip()


def _format_brand_context(bc: "BrandContext") -> str:
    lines = [
        "--- Client Brand Context ---",
        f"Client name: {bc.brandName}",
        f"Business model: {bc.model}",
    ]
    if bc.namingConvention:
        lines.append(f"Naming convention: {bc.namingConvention}")
    if bc.demographics:
        lines.append(f"Target demographics: {bc.demographics}")
    if bc.markets:
        lines.append(f"Target markets: {', '.join(bc.markets)}")
    if bc.selectedPlatforms:
        lines.append(f"Active platforms: {', '.join(bc.selectedPlatforms)}")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def _enrich_campaign_setup(df: pd.DataFrame, naming_convention: str) -> pd.DataFrame:
    """
    Pre-compute naming-convention compliance and prepend a summary row so Gemini
    receives a concrete percentage rather than having to infer it from raw names.
    """
    if not naming_convention or not naming_convention.strip():
        return df
    if "campaign_name" not in df.columns or df.empty:
        return df

    cleaned = re.sub(r"[\[\]]", "", naming_convention.strip())
    if "_" in cleaned:
        segments = [s for s in cleaned.split("_") if s]
    else:
        segments = [s for s in cleaned.split() if s]

    if not segments:
        logger.warning("Naming convention '%s' produced no segments; skipping enrichment", naming_convention)
        return df

    n_expected = len(segments)

    def _matches(name: object) -> bool:
        if not isinstance(name, str) or not name.strip():
            return False
        parts = name.strip().split("_")
        return len(parts) == n_expected and all(parts)

    df = df.copy()
    df["_naming_convention_match"] = df["campaign_name"].apply(_matches)

    valid_rows = df[df["campaign_name"].notna() & (df["campaign_name"].astype(str).str.strip() != "")]
    total = len(valid_rows)
    matched = int(df["_naming_convention_match"].sum()) if total > 0 else 0
    compliance_pct = round(matched / total * 100, 1) if total > 0 else 0.0

    logger.info(
        "Naming convention compliance for '%s': %.1f%% (%d/%d campaigns match)",
        naming_convention, compliance_pct, matched, total,
    )

    summary_row = pd.DataFrame([{
        "_summary": True,
        "_naming_convention_compliance_pct": compliance_pct,
        "_naming_convention_pattern": naming_convention,
        "_naming_convention_n_segments": n_expected,
        "_naming_convention_total_campaigns": total,
        "_naming_convention_matched": matched,
    }])

    # Prepend so it's always within the 50-row summarise cap
    return pd.concat([summary_row, df], ignore_index=True)


def _summarise_df(df: pd.DataFrame, max_rows: int = 50) -> str:
    """Convert a DataFrame to a compact JSON summary safe for prompt injection."""
    if df.empty:
        return json.dumps({"_empty": True})

    if "_error" in df.columns:
        return json.dumps({"_error": df["_error"].iloc[0]})

    df = df.dropna(axis=1, how="all")

    sample = df.head(max_rows).copy()
    for col in sample.columns:
        if "micros" in col:
            sample[col] = (sample[col] / 1_000_000).round(2)
            sample.rename(columns={col: col.replace("_micros", "_usd")}, inplace=True)

    return sample.to_json(orient="records", default_handler=str)


_REQUIRED_FIELDS = {"topic", "category", "status", "level", "source", "action", "explanation"}


def _call_gemini(
    category: str,
    data_json: str,
    topics: list[str],
    brand_context: "BrandContext | None" = None,
) -> list[SpecialistResult]:
    """Send one Gemini request for a single category and parse the result."""
    topic_list = "\n".join(f"  - {t}" for t in topics)
    user_prompt = (
        f"Category: {category}\n\n"
        f"Topics to evaluate:\n{topic_list}\n\n"
        f"Data (JSON):\n{data_json}"
    )

    brand_block = _format_brand_context(brand_context) if brand_context else ""
    full_prompt = _SYSTEM_PROMPT + "\n\n" + brand_block + user_prompt

    response = _get_client().models.generate_content(
        model=_GEMINI_MODEL,
        contents=full_prompt,
        config=types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=4096,
            response_mime_type="application/json",
        ),
    )
    raw = response.text.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning(
            "Gemini returned non-JSON for category '%s' (first 500 chars): %s",
            category, raw[:500],
        )
        raise exc

    if not isinstance(parsed, list):
        logger.warning(
            "Gemini returned a non-array JSON for category '%s': %s",
            category, str(parsed)[:300],
        )
        raise ValueError(f"Expected JSON array, got {type(parsed).__name__}")

    results: list[SpecialistResult] = []
    for item in parsed:
        missing = _REQUIRED_FIELDS - set(item.keys() if isinstance(item, dict) else [])
        if missing:
            logger.warning("Gemini result item missing fields %s, skipping: %s", missing, item)
            continue
        try:
            results.append(SpecialistResult(**item))
        except Exception as validation_exc:
            logger.warning("SpecialistResult validation failed for item %s: %s", item, validation_exc)

    if not results:
        raise ValueError("All items in Gemini response failed validation")

    return results


def _fallback_stubs(category: str, reason: str) -> list[SpecialistResult]:
    """Return warn-level stubs when the Gemini call or parse fails."""
    safe_reason = str(reason)[:200]
    logger.warning("Returning fallback stubs for category '%s'. Reason: %s", category, safe_reason)
    return [
        SpecialistResult(
            topic=topic,
            category=category,
            status="warn",
            level="basic",
            source="parse_error",
            action="Review manually — automated analysis unavailable",
            explanation=f"Automated analysis failed: {safe_reason}",
        )
        for topic in _CATEGORY_TOPICS.get(category, ["Unknown topic"])
    ]


def run_specialist_agent(
    audit_data: dict[str, pd.DataFrame],
    brand_context: "BrandContext | None" = None,
) -> list[SpecialistResult]:
    """
    Run the specialist agent over all five categories and return a combined
    list of SpecialistResult objects.
    """
    all_results: list[SpecialistResult] = []

    for category, df in audit_data.items():
        topics = _CATEGORY_TOPICS.get(category, [])

        if category == "campaign_setup" and brand_context and brand_context.namingConvention:
            df = _enrich_campaign_setup(df, brand_context.namingConvention)

        data_json = _summarise_df(df)
        try:
            results = _call_gemini(category, data_json, topics, brand_context)
            all_results.extend(results)
        except Exception as exc:
            logger.error("Specialist agent failed for category %s: %s", category, exc, exc_info=True)
            all_results.extend(_fallback_stubs(category, str(exc)))

    return all_results
