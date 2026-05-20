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

import difflib
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
    "keyword_strategy": [
        "Keyword match type distribution",
        "Negative keyword coverage",
        "Keyword quality scores",
        "Keyword status hygiene",
        "Ad group keyword structure",
        "DSA / dynamic ad groups",
    ],
    "pmax_performance": [
        "PMax campaign adoption",
        "Asset group strength",
        "Audience signal quality",
        "Smart bidding configuration",
        "PMax vs standard campaign balance",
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
    Check _source="adschedule_summary" first: read campaigns_with_adschedule and total_adschedule_entries.
    campaigns_with_adschedule = 0 -> no dayparting configured at all -> basic.
    campaigns_with_adschedule > 0 -> dayparting IS configured; use hourly_stats to assess quality.
    Then from _source="hourly_stats": analyse cost_micros and conversions by hour and day_of_week.
    If adschedule configured AND conversions concentrated in specific hours (top 3 hours > 60%)
    AND cost distribution varies by hour to match those peaks -> expert (active, well-tuned dayparting).
    If adschedule configured but cost is uniform across all hours -> warn (schedule exists but may not be optimised).
    If no hourly_stats rows present -> basic regardless of adschedule.

AUDIENCE TARGETING CATEGORY:
campaign_criterion data is pre-aggregated: each row in _source="campaign_criterion" has
(criterion_type, negative, count). Use the counts directly for all threshold checks.

- Audience segmentation:
    Count distinct audience_id values from _source="campaign_audience" rows.
    0 audiences -> fail;  1-3 -> warn/basic;  4-10 -> pass/advanced;  >10 -> expert.
- Remarketing lists:
    From _source="campaign_audience": non-default bid_modifier (not 0 or 1) indicates active remarketing.
    No audience rows -> fail;  present but all bid_modifier = 1 -> warn;
    differentiated bid_modifiers per audience -> pass.
    Also note presence of USER_LIST entries in campaign_criterion (count > 0 = remarketing active).
- Similar audiences / lookalikes:
    Check _source="campaign_criterion" for USER_LIST with negative=false and count > 0 -> pass.
    Absence -> fail for B2C/D2C;  warn for B2B.
- Demographic targeting:
    From _source="demographics": bid_modifier and negative flag per gender/age_range segment.
    All bid_modifier = 0 or 1 across all groups -> basic (no differentiation).
    Any group with bid_modifier != 1 -> advanced.
    Negative targeting on any group -> note it; expert if combined with bid adjustments.
- Geo targeting precision:
    From _source="campaign_criterion": find rows where criterion_type="LOCATION".
    negative=false count: total positive location targets.
    negative=true count: location exclusions.
    If only 1 or 2 positive LOCATION targets (broad country-level) -> basic.
    Multiple LOCATION targets (>10) suggesting city/region level -> advanced.
    Also check for AD_SCHEDULE (dayparting) and DEVICE entries — presence indicates advanced setup.
- Exclusion lists:
    From _source="campaign_criterion": sum count where negative=true across all criterion types
    (KEYWORD, LOCATION, USER_LIST, PLACEMENT, TOPIC, etc.).
    Zero total negative count -> fail.
    <100 -> warn;  >= 100 across multiple criterion_type values -> pass/advanced.

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
Ad data is pre-aggregated: each row in _source="ad" has (type, status, ad_strength,
policy_approval_status, ad_count). Use ad_count for all threshold checks.

- Responsive search ad coverage:
    From _source="ad": sum ad_count where type="RESPONSIVE_SEARCH_AD" and status="ENABLED".
    Zero -> fail;  some present but < 50% of ENABLED ads -> warn;  dominant ad type -> pass.
    Check ad_strength distribution for RSAs: all GOOD/EXCELLENT -> champion;
    mix with AVERAGE -> advanced;  any POOR -> warn.
- Asset group ad strength:
    From _source="ad": read ad_strength values across all ad types.
    All EXCELLENT or GOOD -> champion;  mix with AVERAGE -> advanced;
    any POOR or PENDING with status=ENABLED -> warn.
- Headline / description variety:
    Compare ENABLED ad count per ad type to total ad_groups count (from _source="ad_group").
    If total ENABLED ads << total ad_groups -> many groups have only 1 ad -> basic.
    Multiple ad types present per group suggests variety -> advanced/expert.
- Image & video assets:
    From _source="ad": check for types beyond RESPONSIVE_SEARCH_AD and EXPANDED_TEXT_AD.
    IMAGE_AD, RESPONSIVE_DISPLAY_AD, VIDEO_RESPONSIVE_AD, DEMAND_GEN_MULTI_ASSET_AD etc. present -> advanced/expert.
    RSA + ETA only -> basic.
- Ad policy compliance:
    From _source="ad": sum ad_count where policy_approval_status="DISAPPROVED" or "UNDER_REVIEW".
    Compare to total ENABLED ad_count.
    >10% affected -> fail;  1-10% -> warn;  zero -> pass.
- Ad copy relevance:
    Evaluate qualitatively from ad_group_name (from _source="ad_group") versus campaign_name patterns.

KEYWORD STRATEGY CATEGORY:
Data is pre-aggregated: each row in _source="keyword" represents a combination of
(is_negative, match_type, status, bidding_strategy_type) with keyword_count, avg_quality_score,
and disapproved_count. Use these aggregated counts for all evaluations.

- Keyword match type distribution:
    Sum keyword_count where is_negative=false across match_type values (BROAD, PHRASE, EXACT).
    EXACT only (no PHRASE or BROAD) -> basic.  EXACT + PHRASE -> advanced.
    BROAD present alongside smart bidding (bidding_strategy_type in MAXIMIZE_CONVERSIONS/
    TARGET_CPA/TARGET_ROAS/MAXIMIZE_CONVERSION_VALUE) -> expert/champion.
    BROAD with MANUAL_CPC only -> warn (risky without smart bidding signals).
- Negative keyword coverage:
    Ad-group level negatives: sum keyword_count where is_negative=true from _source="keyword".
    Campaign-level: from _source="campaign_negatives_summary"; read total_campaign_negative_keywords.
    Total zero -> fail/basic.  <1000 total -> warn/basic;  1000–10000 -> advanced;
    >10000 across both levels -> expert/champion.
- Keyword quality scores:
    From _source="keyword" where is_negative=false and status="ENABLED":
    read avg_quality_score (already averaged; ignore nulls).
    avg < 5 -> fail/basic;  5–6 -> warn/advanced;  7–8 -> pass/expert;  >= 9 -> champion.
    If all avg_quality_score values are null -> warn (QS unavailable, likely smart bidding).
- Keyword status hygiene:
    Sum keyword_count where is_negative=false by status (ENABLED vs PAUSED/REMOVED).
    > 50% PAUSED or REMOVED -> warn;  zero ENABLED keywords -> fail.
    Sum disapproved_count across all rows: any > 0 -> warn regardless of count.
- Ad group keyword structure:
    Use total keyword_count where is_negative=false and status="ENABLED" divided by number of
    ad groups (not available directly — estimate from dsa_ad_groups count and campaign scale).
    If the account has large keyword_count across few match types -> likely large ad groups -> basic.
    High EXACT count relative to ad group count suggests tightly themed groups -> expert/champion.
- DSA / dynamic ad groups:
    Rows where _source="dsa_ad_groups".
    Zero DSA groups -> basic.  1+ DSA groups -> advanced.
    Multiple DSA groups (segmented by category/page feed) -> expert/champion.

PMAX PERFORMANCE CATEGORY:
all_campaigns data is pre-aggregated: each row in _source="all_campaigns" has
(campaign_advertising_channel_type, status, campaign_count).
pmax_campaign rows are individual PMax campaigns (one row each).

- PMax campaign adoption:
    From _source="pmax_campaign": each row is a (status, bidding_strategy_type) group with campaign_count.
    Sum campaign_count where status="ENABLED" -> total enabled PMax campaigns.
    Sum campaign_count where status="PAUSED" -> paused PMax campaigns.
    Zero total -> basic (not adopted).
    1-10 enabled PMax -> advanced;  10+ enabled PMax -> expert.
    From _source="all_campaigns": sum campaign_count where status="ENABLED" for total active campaigns.
    Enabled PMax / total ENABLED >= 30% -> champion.
- Asset group strength:
    From _source="pmax_asset": each row has (type, ad_strength, status, asset_count).
    All EXCELLENT or GOOD -> champion;  mix with AVERAGE -> advanced;  any POOR -> warn.
    No pmax_asset rows -> note as not applicable if no PMax campaigns.
- Audience signal quality:
    From _source="pmax_audience_signals": rows show audience_signal_count (and optionally
    asset_groups_with_signals) per campaign_id.
    If pmax_audience_signals rows are present:
      Campaigns with audience_signal_count = 0 -> fail for those campaigns.
      All campaigns with audience_signal_count >= 1 -> advanced.
      Majority with audience_signal_count >= 3 -> expert/champion.
    If no pmax_audience_signals rows at all (data unavailable from this dataset):
      -> warn/basic, note that audience signal data could not be retrieved and manual
         verification is recommended. Do NOT hard-fail solely on missing data.
    If hasCrmData=false, do not penalise absence of customer match signals.
- Smart bidding configuration:
    From _source="pmax_campaign": check target_roas field.
    PMax campaigns with target_roas = 0 or null -> warn (VBB not configured).
    All PMax campaigns with target_roas set -> expert/champion.
- PMax vs standard campaign balance:
    From _source="all_campaigns": sum campaign_count by campaign_advertising_channel_type.
    From _source="pmax_campaign": count PMax.
    Account with Search campaigns present AND PMax present -> expert (healthy mix).
    PMax only, no Search -> warn (loss of keyword control).
    No PMax at all -> basic.

=== CALIBRATION BY BRAND CONTEXT ===

When brand context is provided:
- B2B clients: weight Conversion KPI and Audience topics more heavily.
  A single conversion type is less severe if the client has long sales cycles.
- B2C/D2C clients: weight Feed quality and Creative diversity more heavily.
  Missing product titles or single-ad ad groups are more serious failures.
- Use _naming_convention_compliance_pct directly — do not re-evaluate it qualitatively.
- Use the client's target markets to contextualise geo-targeting precision scores.
- industry: calibrate keyword quality score thresholds — competitive verticals (finance,
  insurance, legal, pharma) have inherently lower QS; do not penalise them as harshly.
- hasCrmData=false: do not penalise missing customer match audience signals in pmax_performance
  or audience_targeting — the client has no CRM data available to upload.
- hasProductFeed=false: do not penalise missing feed completeness or dynamic remarketing in
  feeds_catalogue, and do not expect Shopping PMax campaigns in pmax_performance.

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
    if getattr(bc, "industry", ""):
        lines.append(f"Industry: {bc.industry}")
    lines.append(f"CRM data available: {getattr(bc, 'hasCrmData', False)}")
    lines.append(f"Product feed available: {getattr(bc, 'hasProductFeed', False)}")
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
    """Convert a DataFrame to a compact JSON summary safe for prompt injection.

    When multiple _source groups are present each group is serialised with its own
    clean columns (no NaN cross-pollution from concat of differently-shaped tables).
    """
    if df.empty:
        return json.dumps({"_empty": True})

    if "_error" in df.columns:
        return json.dumps({"_error": df["_error"].iloc[0]})

    def _clean_and_serialise(frame: pd.DataFrame, rows: int) -> list:
        frame = frame.dropna(axis=1, how="all").head(rows).copy()
        for col in list(frame.columns):
            if "micros" in col:
                frame[col] = (frame[col] / 1_000_000).round(2)
                frame.rename(columns={col: col.replace("_micros", "_usd")}, inplace=True)
        return json.loads(frame.to_json(orient="records", default_handler=str))

    if "_source" in df.columns and df["_source"].nunique() > 1:
        parts: dict[str, list] = {}
        sources = df["_source"].unique()
        per_source = max(max_rows // len(sources), 10)
        for src, group in df.groupby("_source", sort=False):
            parts[str(src)] = _clean_and_serialise(group, per_source)
        return json.dumps(parts)

    return json.dumps(_clean_and_serialise(df, max_rows))


_REQUIRED_FIELDS = {"topic", "category", "status", "level", "source", "action", "explanation"}


def _normalise_topics(
    results: list[SpecialistResult],
    canonical: list[str],
    category: str,
) -> list[SpecialistResult]:
    """Map Gemini's topic names back to the canonical list and fill any gaps."""
    canonical_lower = {t.lower(): t for t in canonical}
    mapped: dict[str, SpecialistResult] = {}

    for r in results:
        matches = difflib.get_close_matches(r.topic.lower(), canonical_lower.keys(), n=1, cutoff=0.4)
        if matches:
            canon = canonical_lower[matches[0]]
            if canon not in mapped:
                mapped[canon] = SpecialistResult(**{**r.model_dump(), "topic": canon})

    output = []
    for topic in canonical:
        if topic in mapped:
            output.append(mapped[topic])
        else:
            output.append(SpecialistResult(
                topic=topic,
                category=category,
                status="warn",
                level="basic",
                source="missing",
                action="Review manually — topic not evaluated",
                explanation="Topic was not returned by the AI model.",
            ))
    return output


def _build_response_schema(topics: list[str]) -> types.Schema:
    """Build a JSON schema that constrains topic names, status, and level."""
    return types.Schema(
        type=types.Type.ARRAY,
        items=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "topic": types.Schema(type=types.Type.STRING, enum=topics),
                "category": types.Schema(type=types.Type.STRING),
                "status": types.Schema(type=types.Type.STRING, enum=["pass", "fail", "warn"]),
                "level": types.Schema(type=types.Type.STRING, enum=["basic", "advanced", "expert", "champion"]),
                "source": types.Schema(type=types.Type.STRING),
                "action": types.Schema(type=types.Type.STRING),
                "explanation": types.Schema(type=types.Type.STRING),
            },
            required=["topic", "category", "status", "level", "source", "action", "explanation"],
        ),
    )


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
            max_output_tokens=8192,
            response_mime_type="application/json",
            response_schema=_build_response_schema(topics),
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    usage = getattr(response, "usage_metadata", None)
    if usage:
        logger.warning(
            "Gemini tokens [%s]: prompt=%d output=%d total=%d",
            category,
            getattr(usage, "prompt_token_count", 0),
            getattr(usage, "candidates_token_count", 0),
            getattr(usage, "total_token_count", 0),
        )
    raw = response.text
    if not raw:
        raise ValueError("Gemini returned an empty response")
    raw = raw.strip()

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

    # response_schema constrains topic names, but keep normalise as a safety net
    return _normalise_topics(results, topics, category)


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

    summary_lines = [f"  {r.category}/{r.topic}: {r.status}/{r.level} — {r.action[:80]}" for r in all_results]
    logger.warning("AUDIT SPECIALIST RESULTS:\n%s", "\n".join(summary_lines))

    return all_results
