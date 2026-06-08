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
campaign rows (_source="campaign") have: campaign_id, campaign_name, status,
campaign_advertising_channel_type, campaign_bidding_strategy_type, has_recommended_budget, budget_amount_micros.
campaign_perf_30d rows (_source="campaign_perf_30d") have: campaign_id, campaign_bidding_strategy_type,
impressions_30d, impressions_7d, conversions_30d, cost_micros_30d (raw micros — divide by 1e6 for USD).
adschedule_summary row (_source="adschedule_summary") has: campaigns_with_adschedule, total_adschedule_entries.
Smart bidding types: MAXIMIZE_CONVERSIONS, TARGET_CPA, TARGET_ROAS, MAXIMIZE_CONVERSION_VALUE.
Manual/basic bidding types: MANUAL_CPC, ENHANCED_CPC, MAXIMIZE_CLICKS, TARGET_SPEND.

- Campaign naming convention:
    Read _naming_convention_compliance_pct from the row where _summary=true.
    100% -> pass / champion.
    Any value < 100% -> fail / basic.
    Also fail if any campaign_name in _source="campaign" rows contains default strings
    such as "Campaign #", "Ad set #", or is blank.
    If the _summary row is absent, evaluate qualitatively from raw campaign_name values.

- Campaign status hygiene:
    Cross-reference _source="campaign" (status) with _source="campaign_perf_30d" (impressions_7d, impressions_30d)
    by campaign_id.
    Pass: every campaign where status="ENABLED" has impressions_7d > 0.
    Fail: any campaign with status="ENABLED" AND impressions_30d = 0 (zero impressions in 30 days).
    Warn: any campaign with status="ENABLED" AND impressions_7d = 0 but impressions_30d > 0
          (was active in the period but stalled in the last 7 days).
    Do not penalise PAUSED or REMOVED campaigns.

- Bidding strategy:
    For each row in _source="campaign_perf_30d", read campaign_bidding_strategy_type and conversions_30d.
    Pass: all campaigns use smart bidding types, OR any manual/basic campaign has conversions_30d < 30
          (insufficient conversion volume to justify switching — acceptable for niche/B2B).
    Fail: any campaign uses MANUAL_CPC or ENHANCED_CPC AND conversions_30d >= 30.
    Warn: any campaign uses MAXIMIZE_CLICKS with conversions_30d >= 30.

- Budget allocation:
    Cross-reference _source="campaign" (has_recommended_budget, budget_amount_micros) with
    _source="campaign_perf_30d" (cost_micros_30d, conversions_30d) by campaign_id.
    Pass: no campaigns show has_recommended_budget=true, OR any constrained campaign has among the
          lowest conversions_30d in the account (intentional fixed test budget cap).
    Fail: one or more campaigns have has_recommended_budget=true AND high conversions_30d (among
          the top performers), while other campaigns with low conversions_30d have
          budget_amount_micros >> cost_micros_30d (significant idle budget sitting unused elsewhere).
    Warn: has_recommended_budget=true on any campaign, without the full cross-condition above.

- Campaign type mix:
    Read campaign_advertising_channel_type from _source="campaign" rows where status="ENABLED".
    Pass: 2 or more distinct campaign types are active simultaneously, appropriate to the business
          objective (e.g. SEARCH + PERFORMANCE_MAX, SEARCH + DISPLAY, or SHOPPING + PERFORMANCE_MAX).
    Fail: only a single campaign type is active (e.g. SEARCH only) despite the account having
          multi-channel or e-commerce objectives. Note: single-type is acceptable for pure B2B
          lead-gen — apply brand context business model before scoring.
    Warn: multiple types present but one type accounts for >90% of active campaigns.

- Scheduling & dayparting:
    Read _source="adschedule_summary": campaigns_with_adschedule, total_adschedule_entries.
    Read majority bidding strategy type from _source="campaign_perf_30d".
    Pass: smart-bidding campaigns run on default 24/7 schedules (campaigns_with_adschedule = 0),
          OR any schedule entries are strict time exclusions (B2B overnight/weekend blocks) rather
          than bid modifier adjustments.
    Fail: manual bid modifier percentages (positive or negative %) are applied on top of
          smart-bidding campaigns — infer when campaigns_with_adschedule > 0 AND the majority of
          campaigns use smart bidding types. This throttles the algorithm's real-time auction signals.
    Warn: ad schedules are configured but the bidding strategy mix is unclear or partially manual.

AUDIENCE TARGETING CATEGORY:
campaign_audience rows (_source="campaign_audience") have: campaign_id, audience_id, bid_modifier.
campaign_criterion rows (_source="campaign_criterion") are pre-aggregated: criterion_type, negative, count.
demographics rows (_source="demographics") have: campaign_id, demographic_type, bid_modifier, negative, demo_category (gender or age_range).
geo_target_summary rows (_source="geo_target_summary") have: geo_target_type, campaign_count.
  geo_target_type values: DONT_CARE (default, broad), AREA_OF_INTEREST, LOCATION_OF_PRESENCE (correct).
NOTE: audience membership sizes and targeting mode (Observation vs Targeting) are not available in
the exported data — flag these topics for manual verification where noted.

- Audience segmentation:
    The Observation vs Targeting mode flag is NOT available in the exported data; manual verification
    is required to confirm it.
    Use _source="campaign_audience" and _source="campaign_criterion" as proxies:
    B2C pass signal: USER_LIST entries exist in campaign_criterion (count > 0, negative=false) AND
      campaign_audience rows are present — suggests audiences are attached (mode requires manual check).
    B2C fail signal: Zero campaign_audience rows AND zero USER_LIST in campaign_criterion — no audiences
      attached at all; reach restriction or absence of data signals are both failures.
    B2B: evaluate whether attached audiences (audience_id values in campaign_audience) are consistent
      with the audience strategy described in brand context. If brand context has no audience strategy,
      score as warn and note manual verification is required.
    In the explanation, always flag that Observation vs Targeting mode requires manual verification
    in the Google Ads UI under Audiences > Targeting setting.

- Remarketing lists:
    From _source="campaign_criterion": find USER_LIST rows where negative=false.
    Pass: USER_LIST count > 0 (remarketing lists are attached) AND campaign_audience rows are present
      with differentiated bid_modifier values (not all = 1.0) — active remarketing.
    Fail: USER_LIST count = 0 AND zero campaign_audience rows — no remarketing lists attached at all.
    Warn: USER_LIST present in criteria but all campaign_audience bid_modifier = 1.0 — lists attached
      but not actively optimized.
    NOTE: member size validation (>1,000 active users threshold) requires manual verification in
    Audience Manager — flag this in the explanation.

- Similar audiences / lookalikes:
    From _source="campaign_criterion": look for USER_LIST entries with negative=false and count > 0.
    Pass: USER_LIST rows present — indicates first-party audience lists are attached and guiding
      algorithmic expansion.
    Fail: Zero USER_LIST entries with negative=false — no first-party lists supplied; platform
      targeting is completely unguided.
    NOTE: Customer Match list type and API upload freshness (30-day requirement) cannot be verified
    from exported data — flag for manual verification in Audience Manager.

- Demographic targeting:
    From _source="demographics": review bid_modifier and negative per demographic_type.
    Pass: at least one demographic segment has bid_modifier != 1.0 (positive adjustment) OR
      negative=true (explicit exclusion) — historical data is being acted on.
    Fail: all demographic bid_modifier values = 0 or 1.0 AND negative=false across all segments —
      all demographic variables left at default with no adjustments, despite available data.
    NOTE: cross-referencing demographics with conversion data to identify zero-conversion segments
    requires manual analysis — flag this in the explanation.

- Geo targeting precision:
    From _source="geo_target_summary": read geo_target_type and campaign_count.
    Pass: all enabled campaigns have geo_target_type = "LOCATION_OF_PRESENCE" (people physically
      present in targeted locations — correct setting).
    Fail: any campaigns have geo_target_type = "DONT_CARE" (default "Presence or Interest" —
      bleeds spend on users merely interested in a location, including international clicks).
    Warn: mix of LOCATION_OF_PRESENCE and AREA_OF_INTEREST across campaigns.
    If geo_target_summary is empty (data unavailable), check LOCATION count in campaign_criterion
    as a fallback: 0 LOCATION entries -> fail (no geo targeting configured at all).

- Exclusion lists:
    From _source="campaign_criterion": read rows where negative=true, grouped by criterion_type.
    Pass: negative=true rows present for USER_LIST criterion_type (audience exclusions active) AND
      at least one other negative criterion_type (KEYWORD, PLACEMENT, TOPIC, or LOCATION) — multi-layer
      exclusions in place.
    Fail: zero rows with negative=true across all criterion_types — no exclusion lists of any kind.
    Warn: only one criterion_type has negative entries (e.g. only keyword negatives, no audience
      exclusions).
    B2C/Demand Gen note: if the account runs Demand Gen or Display campaigns, check for USER_LIST
    negative=true entries specifically — absence means existing customers are being retargeted wastefully.

CONVERSION KPI CATEGORY:
conversion_actions rows (_source="conversion_actions") have: id, name, status (ENABLED/HIDDEN),
  type, category, primary_for_goal (bool), counting_type, attribution_model, include_in_conversions.
  attribution_model values: DATA_DRIVEN, LAST_CLICK, FIRST_CLICK, LINEAR, TIME_DECAY, POSITION_BASED.
  category values: PURCHASE, LEAD, SIGN_UP, PAGE_VIEW, DOWNLOAD, PHONE_CALL, IMPORTED, OTHER.
campaign_targets rows (_source="campaign_targets") have: campaign_id, bidding_strategy, target_roas,
  target_cpa_micros, actual_roas_30d, actual_cpa_30d, conversions_30d.
campaign_basic_stats rows (_source="campaign_basic_stats") have: campaign_id, date, impressions,
  clicks, cost_micros, conversions, conversions_value, roas, cpa.
campaign_conversion_stats rows (_source="campaign_conversion_stats") have: campaign_id,
  conversion_name, conversion_category, conversions, conversions_value.

- Conversion tracking setup:
    From _source="conversion_actions": check status and include_in_conversions for ENABLED actions.
    Pass: at least one conversion action has status="ENABLED" AND include_in_conversions=true AND
      _source="campaign_conversion_stats" has rows with conversions > 0 in the last 30 days.
    Fail: all ENABLED conversion actions show zero conversions across all dates in
      campaign_conversion_stats despite active spend in campaign_basic_stats (tracking broken),
      OR no ENABLED conversion actions exist at all.
    Warn: conversion actions exist but conversions = 0 for only a short recent window (< 7 days) —
      may be a temporary tag issue.
    NOTE: tag firing within the last 24 hours cannot be verified from daily BQ exports — flag for
    manual validation in Google Ads conversion tag diagnostics.

- Conversion categories:
    From _source="conversion_actions": read the category field for ENABLED actions.
    Pass: conversion actions are assigned to meaningful bottom-of-funnel categories (PURCHASE, LEAD,
      SIGN_UP, PHONE_CALL) appropriate to the brand's business model.
    Fail: all ENABLED conversion actions are set to PAGE_VIEW, DOWNLOAD, or OTHER, while the account
      clearly has transactional or lead-gen objectives — soft engagement events are being treated as
      primary KPIs.
    Warn: mix of high-value and low-value categories but the primary goal (primary_for_goal=true)
      is assigned to a soft category.

- Primary vs secondary conversions:
    From _source="conversion_actions": read primary_for_goal for each ENABLED action.
    Pass: only bottom-of-funnel actions (PURCHASE, LEAD, SIGN_UP, PHONE_CALL) have primary_for_goal=true;
      soft actions (PAGE_VIEW, DOWNLOAD, engagement) have primary_for_goal=false (Secondary).
    Fail: any action with category PAGE_VIEW, DOWNLOAD, or OTHER has primary_for_goal=true — algorithms
      are optimizing for low-value actions.
    Warn: multiple high-value action types all set as Primary (may dilute optimization signal).

- ROAS / CPA targets:
    From _source="campaign_targets": compare target_roas and target_cpa_micros against
    actual_roas_30d and actual_cpa_30d for smart-bidding campaigns.
    Pass: every smart-bidding campaign has a target set, AND the target is within ±20% of
      actual_roas_30d or actual_cpa_30d (realistic, achievable target).
    Fail: any smart-bidding campaign has a target set to an extreme value — target_roas more than
      2× actual_roas_30d, OR target_cpa_micros less than 50% of actual_cpa_30d — causing delivery
      to stall. Also fail if no targets are set at all on smart-bidding campaigns.
    Warn: targets are set but outside the ±20% variance band, suggesting they may need recalibration.

- Attribution model:
    From _source="conversion_actions": read attribution_model for actions where primary_for_goal=true.
    Pass: 100% of primary conversion actions use DATA_DRIVEN attribution (or for B2B accounts,
      compliant offline CRM import models).
    Fail: any primary conversion action uses LAST_CLICK attribution — fails to credit multi-touch
      journeys and under-weights upper-funnel activity.
    Warn: mix of attribution models across primary actions, or TIME_DECAY/LINEAR used instead of
      DATA_DRIVEN.

- Cross-device conversions:
    From _source="conversion_actions": check if any action has type indicating cross-device
    capability (STORE_VISIT, WEBPAGE with include_in_conversions=true across device types).
    From _source="campaign_conversion_stats": if conversion_category includes STORE_VISIT or
    cross-device action names, tracking is active.
    Pass: cross-device or store-visit conversion actions are ENABLED and recording conversions.
    Fail: no cross-device tracking configured — account is blind to cross-device user paths.
    Warn: cross-device actions exist but show zero conversions (configured but not firing).

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
