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
        "Data density",
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
        "Target stability",
        "Attribution model",
        "Cross-device conversions",
    ],
    "feeds_catalogue": [
        "Product feed completeness",
        "Product title optimisation",
        "Feed segmentation",
        "Shopping campaign structure",
        "Dynamic remarketing feed",
        "Conversational attributes",
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
    "ai_readiness": [
        "PMax campaign adoption",
        "Asset group strength",
        "Audience signal quality",
        "Smart bidding configuration",
        "PMax vs. standard campaign balance",
        "AI Max",
        "Native AI-driven generative tools in AI Max",
        "Native AI-driven generative tools in PMax",
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
    Read _source="campaign_type_summary": each row has campaign_advertising_channel_type and
    campaign_count. This is a complete aggregation of all ENABLED campaigns — use it instead
    of raw campaign rows (which are capped at 50 and may not represent all types).
    Pass: 2 or more distinct rows in campaign_type_summary, appropriate to the business
          objective (e.g. SEARCH + PERFORMANCE_MAX, SEARCH + DISPLAY, SHOPPING + PERFORMANCE_MAX).
    Fail: only a single campaign_advertising_channel_type row exists despite the account having
          multi-channel or e-commerce objectives. Note: single-type is acceptable for pure B2B
          lead-gen — apply brand context business model before scoring.
    Warn: multiple types present but one type's campaign_count accounts for >90% of the total.

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

- Data density:
    From _source="campaign_perf_30d": for each smart-bidding campaign, read conversions_30d.
    Smart bidding requires sufficient conversion volume to learn effectively (Google recommends
    ≥30 conversions per campaign per 30-day window for most smart bidding strategies).
    Pass: the majority (>60%) of ENABLED smart-bidding campaigns have conversions_30d >= 30 —
      the account provides sufficient data for the bidding algorithm to optimise.
    Fail: the majority of smart-bidding campaigns have conversions_30d < 15 — the account is
      running smart bidding without enough conversion signal, leading to suboptimal learning.
    Warn: borderline — most campaigns have 15–29 conversions/30d (partial data density; algorithm
      can learn but performance may be constrained).
    If no smart-bidding campaigns exist, score as warn: data density is not applicable but
    note the account relies on manual bidding without conversion learning.

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
DATA AVAILABILITY NOTE: p_ads_ConversionAction does not exist in this BQ export. The
  conversion_actions source is derived from CampaignConversionStats (30-day window). Available
  columns: name, category, conversions_30d, value_30d, campaigns_tracking. NOT available from BQ:
  status, primary_for_goal, attribution_model, include_in_conversions, counting_type — these
  require manual verification in the Google Ads UI.
conversion_actions rows (_source="conversion_actions") have: name, category, conversions_30d,
  value_30d, campaigns_tracking. category values seen: PURCHASE, LEAD, SIGN_UP, PAGE_VIEW, OTHER.
campaign_targets rows (_source="campaign_targets") have: campaign_id, bidding_strategy,
  target_roas (FLOAT — 0 means no target set), actual_roas_30d, actual_cpa_30d, conversions_30d.
  NOTE: CPA targets are not available in this export — only target_roas.
campaign_basic_stats rows (_source="campaign_basic_stats") have: campaign_id, date, impressions,
  clicks, cost_micros, conversions, conversions_value, roas, cpa.
campaign_conversion_stats rows (_source="campaign_conversion_stats") have: campaign_id,
  conversion_name, conversion_category, conversions, conversions_value.
cross_device_conversions rows (_source="cross_device_conversions") have: name, category,
  cross_device_conversions_30d, campaigns_with_xdevice, _summary=true.

- Conversion tracking setup:
    From _source="conversion_actions": check conversions_30d > 0 for any action.
    From _source="campaign_basic_stats": verify active spend exists.
    Pass: conversion_actions has at least one row with conversions_30d > 0 AND campaign_basic_stats
      shows active spend — tracking is firing and recording conversions.
    Fail: campaign_basic_stats shows spend but conversion_actions has zero conversions across all
      actions — tracking is broken or no conversion actions are configured.
    Warn: very few conversions relative to spend (possible partial tag breakage).
    NOTE: tag firing recency (within 24h), include_in_conversions, and action status cannot be
    verified from BQ daily batches — flag for manual validation in Google Ads tag diagnostics.

- Conversion categories:
    From _source="conversion_actions": read category for each tracked action.
    Pass: at least one action has category = PURCHASE, LEAD, SIGN_UP, or PHONE_CALL with
      conversions_30d > 0 — bottom-of-funnel events are being tracked and firing.
    Fail: all actions recording conversions have category = PAGE_VIEW, DOWNLOAD, or OTHER —
      account is optimizing for soft micro-events instead of revenue or lead objectives.
    Warn: mix of high-value and low-value categories both recording conversions.
    NOTE: which category is set as Primary (primary_for_goal) is not available from BQ —
    flag for manual verification: confirm that the PURCHASE/LEAD action is set as Primary Goal.

- Primary vs secondary conversions:
    primary_for_goal is NOT available in this BQ export. This topic cannot be evaluated
    automatically. Score as warn and flag for manual verification:
    "Verify in Google Ads > Tools > Conversions that only bottom-of-funnel actions
    (PURCHASE/LEAD) are set as Primary Goal — soft events (PAGE_VIEW, engagement) should
    be Secondary only."

- ROAS / CPA targets:
    From _source="campaign_targets": for smart-bidding ENABLED campaigns, check target_roas.
    NOTE: CPA targets are not available in this BQ export — only ROAS targets.
    Pass: all campaigns with conversions_30d >= 30 have target_roas > 0, AND actual_roas_30d
      is within ±20% of target_roas (targets are realistic and being achieved).
    Fail: any campaign with conversions_30d >= 30 has target_roas = 0 (unconstrained smart
      bidding), OR target_roas is more than 2× actual_roas_30d (unachievable target causing
      delivery throttle).
    Warn: targets set but actual_roas_30d is outside ±20% of target_roas on majority of
      campaigns — targets need recalibration.

- Target stability:
    From _source="campaign_targets": compare target_roas against actual_roas_30d for each
    smart-bidding campaign.
    Pass: majority of campaigns with target_roas > 0 have actual_roas_30d within ±30% of
      target_roas — targets are calibrated and achievable, indicating stable bidding.
    Fail: majority of campaigns have actual_roas_30d deviating more than ±50% from
      target_roas — targets are unrealistic, causing budget throttle or overspend cycles.
    Warn: targets are set but actual_roas_30d is outside ±30% on most campaigns — targets
      need recalibration to stabilise bidding.
    If campaign_targets is empty or no target_roas > 0 exists: score as warn — no target
    constraints means bidding stability cannot be assessed. Recommend setting tROAS.
    NOTE: Historical target change history is not available in the 30-day BQ window — flag
    that target revision frequency requires manual review in Google Ads change history.

- Attribution model:
    attribution_model is NOT available in this BQ export (p_ads_ConversionAction missing).
    Score as warn and flag for manual verification:
    "Verify in Google Ads > Tools > Conversions that all primary conversion actions use
    Data-Driven attribution. Last-Click attribution under-credits upper-funnel activity
    and distorts smart bidding signals."

- Cross-device conversions:
    From _source="cross_device_conversions": check cross_device_conversions_30d.
    Pass: at least one row exists with cross_device_conversions_30d > 0 — cross-device
      paths are being tracked and contributing to conversion counts.
    Fail: source is empty or all cross_device_conversions_30d = 0 — account is blind to
      users who switch devices between click and conversion.
    Warn: cross-device conversions present but very low relative to total conversions
      (possible under-attribution).

FEEDS & CATALOGUE CATEGORY:
DATA AVAILABILITY NOTE: segments_product_title does not exist in this BQ export. The
  product_title_sample source uses product_type_l1 + brand + custom_label as a structural proxy.
  Actual product title text quality requires manual verification in Merchant Center.
shopping_product_stats rows (_source="shopping_product_stats") have: campaign_id, product_brand,
  product_channel, rows_with_label_0 through rows_with_label_4 (count of rows where that custom
  label is non-empty), impressions, clicks, cost_micros, conversions.
product_title_sample rows (_source="product_title_sample") have: product_type, product_brand,
  custom_label_0, custom_label_1, custom_label_2, impressions, conversions.
  NOTE: product_title is NOT available in this export — use product_type + brand as feed structure proxy.
product_group_stats rows (_source="product_group_stats") have: campaign_id, ad_group_id,
  product_group_count (distinct product groups per ad group), impressions, clicks, cost_micros.
NOTE: Merchant Center diagnostic health data (approval rates, disapproval counts) is NOT available
in the Google Ads BQ export — these criteria require manual verification in Merchant Center.

- Product feed completeness:
    From _source="shopping_product_stats": if rows exist with impressions > 0, the feed is live.
    From _source="product_title_sample": check product_type and product_brand for null values.
    Pass: shopping_product_stats rows present with impressions > 0 AND product_title_sample shows
      non-null product_type and product_brand on most rows — feed is active and categorised.
    Fail: zero shopping_product_stats rows (no active feed or no Shopping campaigns).
    Warn: shopping stats present but product_type_l1 is mostly null — incomplete categorization.
    NOTE: product title text quality and Merchant Center approval rate (>95% threshold) cannot be
    verified from BQ — flag for manual review in Merchant Center Diagnostics.

- Product title optimisation:
    product_title text is NOT available in this BQ export. Score as warn and flag for manual
    verification: "Verify in Merchant Center that product titles follow [Brand] + [Product Type]
    + [Key Attributes] format (e.g. material, color, size, compatibility). Titles under 70
    characters or missing brand/attribute terms reduce Shopping ad relevance scores."
    Use product_type and custom_label_0 from product_title_sample as structural proxies —
    if product_type_l1 rows are present and descriptive (not null or generic codes), note
    the feed appears structurally organised but title quality needs manual confirmation.

- Feed segmentation:
    From _source="shopping_product_stats": sum rows_with_label_0 through rows_with_label_4 across
    all rows. Total > 0 for any label = custom labels in use.
    Pass: at least one custom label column (rows_with_label_0 through rows_with_label_4) has a
      non-zero sum — inventory is segmented by strategic business value.
    Fail: all five rows_with_label_X sums equal zero — custom labels are entirely blank, preventing
      any product cluster separation in campaigns.
    Warn: only one label used (single-dimension segmentation); advanced practice is 2+ labels
      (e.g., margin tier + performance tier).

- Shopping campaign structure:
    From _source="product_group_stats": read product_group_count per (campaign_id, ad_group_id).
    Pass: the majority of ad groups have product_group_count > 1 — inventory is partitioned into
      granular groups by brand, category, or custom label.
    Fail: all ad groups have product_group_count = 1 — the entire catalog is in a single
      "All Products" catch-all bucket with no structural partitioning.
    Warn: some ad groups are partitioned but others remain as catch-all.

- Dynamic remarketing feed:
    This criterion checks whether the dynamic remarketing tag passes matching unique identifiers
    (e.g., item_id, page_id) back to the feed — this is a tag implementation check that requires
    manual verification and is NOT visible in the Google Ads BQ export.
    Score as warn and instruct: "Verify in Google Ads Tag Manager / Google Tag diagnostics that
    the ecomm_prodid or dynx_itemid parameter matches the feed's item_id column exactly. A mismatch
    prevents product-level remarketing from serving."
    If product_channel = "ONLINE" exists in shopping_product_stats with active clicks, note that
    Shopping is active but tag alignment still requires manual verification.

- Conversational attributes:
    Conversational feed attributes ([question_and_answer], [document_link], [related_product],
    [item_group_title], [variant_option], [popularity_rank]) are NOT available in the Google Ads
    BQ export — Merchant Center does not surface these fields in the standard BQ data transfer.
    Pass: at least 80% of approved products have all conversational attribute fields filled.
    Fail: no product has any conversational attribute fields filled.
    Warn: less than 80% of products have the fields fully filled.
    Since this data is unavailable from BQ, score as warn and instruct:
    "Verify in Merchant Center > Products > Attributes that conversational attributes
    ([question_and_answer], [document_link], [related_product], [item_group_title],
    [variant_option], [popularity_rank]) are populated for at least 80% of your approved product
    catalogue to enable AI-driven conversational search ad formats."
    If hasProductFeed=false: mark as not applicable.

CREATIVE CONTENT CATEGORY:
ad rows (_source="ad") are account-level aggregates: type, status, ad_strength,
  policy_approval_status, ad_count.
ad_group rows (_source="ad_group") have: ad_group_id, campaign_id, ad_group_name, status, ad_group_type.
rsa_per_adgroup rows (_source="rsa_per_adgroup") have: ad_group_id, campaign_id,
  enabled_rsa_count, total_enabled_ads, good_excellent_rsa_count, poor_average_rsa_count,
  disapproved_count, rich_media_count. One row per ad group.
rsa_headline_summary row (_source="rsa_headline_summary", _summary=true) has:
  total_rsa_ad_groups, ad_groups_10plus_headlines, ad_groups_under_5_headlines,
  ad_groups_3plus_descriptions, avg_headline_count, avg_description_count.
NOTE: actual headline/description text is not extracted — ad copy keyword relevance
requires qualitative inference from ad_group_name patterns.

- Responsive search ad coverage:
    From _source="rsa_per_adgroup": count rows where enabled_rsa_count = 0.
    Cross-reference with _source="ad_group" to confirm those rows are active Search ad groups
    (status="ENABLED" and ad_group_type not PMax/Display).
    Pass: every active Search ad group has enabled_rsa_count >= 1.
    Fail: any active Search ad group has enabled_rsa_count = 0 — relying on legacy formats only.
    Warn: enabled_rsa_count = 1 only (minimum coverage, no redundancy).

- Asset group ad strength:
    From _source="rsa_per_adgroup": compute across all rows:
      good_excellent_rate = SUM(good_excellent_rsa_count) / SUM(good_excellent_rsa_count + poor_average_rsa_count).
    Also check _source="ad" for PMax asset types (RESPONSIVE_DISPLAY_AD, etc.) ad_strength.
    Pass: good_excellent_rate >= 90% — at least 90% of active RSAs and asset groups are Good/Excellent.
    Fail: more than 10% of active RSAs have poor_average_rsa_count > 0 in their ad group
      (i.e., Poor or Average ratings dominate).
    Warn: good_excellent_rate between 80–89%.

- Headline / description variety:
    From _source="rsa_headline_summary": read ad_groups_10plus_headlines, ad_groups_under_5_headlines,
    avg_headline_count, avg_description_count.
    Pass: ad_groups_10plus_headlines / total_rsa_ad_groups >= 80% AND avg_description_count >= 3.0 —
      most RSAs use 10+ distinct headlines and 3+ descriptions.
    Fail: ad_groups_under_5_headlines / total_rsa_ad_groups > 20% OR avg_headline_count < 5 —
      significant slot underutilization or repetitive copy.
    Warn: avg_headline_count between 5–9 (acceptable but not optimised).
    If rsa_headline_summary is empty (UNNEST query failed), fall back to comparing total ENABLED
    ad count from _source="ad" against total ad groups from _source="ad_group".

- Image & video assets:
    From _source="rsa_per_adgroup": sum rich_media_count across all rows.
    Also from _source="ad": check for types IMAGE_AD, RESPONSIVE_DISPLAY_AD, VIDEO_RESPONSIVE_AD,
    DEMAND_GEN_MULTI_ASSET_AD, VIDEO_AD with ad_count > 0.
    Pass: rich_media_count sum > 0 OR rich media ad types present — campaigns include image/video
      assets beyond text-only RSAs.
    Fail: rich_media_count = 0 across all ad groups AND no rich media ad types in _source="ad" —
      video slots empty and no image extensions, forcing automated low-quality slideshows.
    Warn: only one rich media type present (e.g., display ads but no video).

- Ad policy compliance:
    From _source="rsa_per_adgroup": sum disapproved_count across all rows; sum total_enabled_ads.
    Also from _source="ad": sum ad_count where policy_approval_status = "DISAPPROVED".
    Pass: disapproved_count = 0 across all ad groups — 100% of active creatives are Approved.
    Fail: any ad group has disapproved_count > 0, OR any row in _source="ad" shows
      policy_approval_status = "DISAPPROVED" or "AREA_OF_INTEREST" (Approved Limited) with
      ad_count that represents > 0% of ENABLED ads.
    Warn: UNDER_REVIEW status present — pending approval, not yet a violation.

- Ad copy relevance:
    Headline text is not available in the exported data — this criterion requires qualitative inference.
    From _source="ad_group": review ad_group_name values for descriptive keyword themes.
    Score as warn if ad_group_names are generic (e.g., "Ad Group 1", "Group A") with no
    apparent keyword theme — suggests copy relevance has not been configured.
    Score as pass if ad_group_names contain specific keyword terms or product/service categories
    that would logically align with ad copy.
    Always flag: "Headline-to-keyword relevance requires manual review — verify that the top
    keyword intent of each ad group appears in the first 3 headline slots of its RSA."

KEYWORD STRATEGY CATEGORY:
keyword rows (_source="keyword") are aggregated by (is_negative, match_type, status,
  bidding_strategy_type) with keyword_count, avg_quality_score, disapproved_count.
  Smart bidding types: MAXIMIZE_CONVERSIONS, TARGET_CPA, TARGET_ROAS, MAXIMIZE_CONVERSION_VALUE.
  Manual types: MANUAL_CPC, ENHANCED_CPC.
campaign_negatives_summary row (_source="campaign_negatives_summary", _summary=true) has:
  campaigns_with_negatives, total_campaign_negative_keywords.
dsa_ad_groups rows (_source="dsa_ad_groups") have: campaign_id, ad_group_id, ad_group_type.
impression_weighted_qs row (_source="impression_weighted_qs", _summary=true) has:
  impression_weighted_avg_qs, keywords_qs_7plus, keywords_qs_4minus, total_keywords_with_qs.
keyword_serving_status rows (_source="keyword_serving_status") have: system_serving_status,
  keyword_count. Values include: ELIGIBLE, RARELY_SERVED, BELOW_FIRST_PAGE_BID,
  LOW_SEARCH_VOLUME, PAUSED, REMOVED.
adgroup_kw_structure row (_source="adgroup_kw_structure", _summary=true) has:
  total_ad_groups, ad_groups_50plus_kw, ad_groups_16_to_50_kw, ad_groups_15minus_kw,
  avg_kw_per_adgroup, max_kw_per_adgroup.
shared_neg_summary row (_source="shared_neg_summary", _summary=true) has:
  shared_negative_list_count.
  DATA AVAILABILITY NOTE: p_ads_SharedSet may not be present in this BQ export. If
  _source="shared_neg_summary" is absent from the data, treat shared_negative_list_count as
  UNAVAILABLE (data gap) — do not assume it equals 0.

- Keyword match type distribution:
    From _source="keyword": filter is_negative=false, group by match_type and bidding_strategy_type.
    Pass: BROAD match keywords exist AND all campaigns running BROAD use smart bidding types —
      broad is only deployed where machine learning signals guide it.
    Fail: any BROAD match keywords exist alongside MANUAL_CPC or ENHANCED_CPC bidding —
      uncapped broad match running in legacy manual bidding, diluting budget.
    Warn: BROAD present with a mix of smart and manual bidding campaigns.
    If no BROAD keywords exist: EXACT + PHRASE only — acceptable, not a failure.

- Negative keyword coverage:
    From _source="shared_neg_summary": read shared_negative_list_count (may be UNAVAILABLE — see note above).
    From _source="campaign_negatives_summary": read total_campaign_negative_keywords.
    From _source="keyword": sum keyword_count where is_negative=true (ad-group level negatives).
    Pass: shared_negative_list_count >= 1 (shared list attached) AND
      total_campaign_negative_keywords > 0 (campaign-level negatives exist).
    Fail: total_campaign_negative_keywords = 0 AND ad-group level negative keyword_count = 0 —
      no exclusions of any kind active (regardless of shared list availability).
    Warn (a): negatives exist at campaign or ad-group level but shared_negative_list_count = 0
      (no account-level shared list, increasing maintenance risk).
    Warn (b): shared_neg_summary is UNAVAILABLE (data gap) but campaign/ad-group level negatives
      are present — score as warn + flag "Shared negative list availability requires manual
      verification in Google Ads UI."
    NOTE: recency of search term exclusions (14-day check) is not available in BQ exports —
    flag for manual verification in Search Terms report.

- Keyword quality scores:
    From _source="impression_weighted_qs": read qs_status_computed directly — this field
    has already been computed from the threshold and you MUST use it as the verdict.
      qs_status_computed = "pass" → score pass
      qs_status_computed = "warn" → score warn
      qs_status_computed = "fail" → score fail
    Do NOT use _source="keyword" avg_quality_score to override this verdict.
    If the impression_weighted_qs row is absent: fall back to avg_quality_score × keyword_count
    weighted average from _source="keyword" where is_negative=false, status="ENABLED";
    apply pass ≥7.0, warn 5.5–6.9, fail <5.5.
    If all quality scores are null: score as warn — manual verification required.

- Keyword status hygiene:
    From _source="keyword_serving_status": check for problematic system_serving_status values.
    Pass: all keyword_count is in status ELIGIBLE — zero systemic delivery blocks.
    Fail: keyword_serving_status rows exist for BELOW_FIRST_PAGE_BID or LOW_SEARCH_VOLUME
      with significant keyword_count (> 10% of total ENABLED positive keywords) — campaigns
      clogged with keywords that cannot serve competitively.
    Warn (a): small proportion (< 10%) with BELOW_FIRST_PAGE_BID or LOW_SEARCH_VOLUME.
    Warn (b): RARELY_SERVED keyword_count > 15% of total enabled positive keywords — large
      share of the keyword list rarely matches, inflating the list without contributing traffic;
      flag for pruning review but do not fail (RARELY_SERVED keywords still serve occasionally).
    Also from _source="keyword": sum disapproved_count; any > 0 → add to warn.
    If keyword_serving_status is empty (column unavailable): fall back to disapproved_count
    check only and note that system status requires manual verification.

- Ad group keyword structure:
    From _source="adgroup_kw_structure": read ad_groups_50plus_kw, ad_groups_15minus_kw,
    avg_kw_per_adgroup, total_ad_groups.
    Pass: ad_groups_15minus_kw / total_ad_groups >= 80% — majority of ad groups are tight
      with ≤15 closely related keywords per group.
    Fail: ad_groups_50plus_kw / total_ad_groups > 20%, OR max_kw_per_adgroup > 50 with
      avg_kw_per_adgroup > 30 — significant share of ad groups are bloated keyword dumps
      that fracture ad copy relevance.
    Warn: avg_kw_per_adgroup between 15 and 30 — moderate oversizing, not critical.
    If adgroup_kw_structure is empty: fall back to dividing total positive ENABLED keyword_count
    from _source="keyword" by dsa_ad_groups count as a rough estimate.

- DSA / dynamic ad groups:
    From _source="dsa_ad_groups": count rows.
    Pass: dsa_ad_groups rows exist (DSA ad groups active) OR from _source="all_campaigns" in
      ai_readiness data there are enabled PMax campaigns — at least one automated
      long-tail expansion mechanism is active.
    Fail: zero dsa_ad_groups rows AND no PMax campaigns evident from keyword data — account
      relies entirely on static manually entered keyword lists with zero automated expansion.
    Warn: DSA groups exist but are paused (check ad_group_type vs campaign status context).

AI READINESS CATEGORY:
DATA AVAILABILITY NOTES:
- with_target_cpa is always 0 in pmax_campaign rows — campaign_target_cpa_cpa_micros does not
  exist in this BQ export. Only with_target_roas is a meaningful target constraint signal.
- pmax_with_shared_neg_lists is always 0 in pmax_brand_exclusions — p_ads_CampaignSharedSet
  does not exist in this BQ export. Only pmax_with_campaign_negatives is meaningful.
- pmax_asset rows come from p_ads_Ad filtered to display/shopping ad types; this is NOT the
  same as PMax asset group strength (p_ads_AssetGroup is unavailable). Treat pmax_asset data
  as a proxy only — UNSPECIFIED ad_strength rows indicate no strength data, not poor strength.
- pmax_audience_signals will be empty if p_ads_AssetGroupAudienceView is unavailable and PMax
  campaigns have no rows in p_ads_CampaignAudience. Empty = data gap, not zero signals.

pmax_campaign rows (_source="pmax_campaign") are aggregated by (status, bidding_strategy_type)
  with campaign_count, with_target_roas, with_target_cpa. One row per status+strategy combination.
all_campaigns rows (_source="all_campaigns") have: campaign_advertising_channel_type, status,
  campaign_count. One row per type+status combination.
pmax_asset rows (_source="pmax_asset") have: type, ad_strength, status, asset_count.
pmax_audience_signals rows (_source="pmax_audience_signals") have: campaign_id,
  audience_signal_count (and optionally asset_groups_with_signals).
pmax_brand_exclusions row (_source="pmax_brand_exclusions", _summary=true) has:
  total_enabled_pmax, pmax_with_shared_neg_lists, pmax_with_campaign_negatives.

- PMax campaign adoption:
    From _source="pmax_campaign": sum campaign_count where status="ENABLED".
    Pass: at least one enabled PMax campaign exists — multi-channel conversion infrastructure
      is deployed and running.
    Fail: total enabled PMax campaign_count = 0 — no PMax active despite the account having
      multi-channel retail or lead-generation objectives.
    Apply brand context: if hasProductFeed=false, score as not applicable for retail PMax;
    if B2B account with no e-commerce goals, absence of PMax is less severe (score as warn).

- Asset group strength:
    Note: pmax_asset rows are a proxy from p_ads_Ad (not actual PMax asset groups from
    p_ads_AssetGroup which is unavailable — see DATA AVAILABILITY NOTES). UNSPECIFIED
    ad_strength means no strength signal available, not poor quality — do not penalise it.
    From _source="pmax_asset": compute across all rows with status="ENABLED":
      good_excellent = SUM(asset_count where ad_strength IN ('GOOD', 'EXCELLENT'))
      poor_average   = SUM(asset_count where ad_strength IN ('POOR', 'AVERAGE'))
      unspecified    = SUM(asset_count where ad_strength = 'UNSPECIFIED' or NULL)
    Pass: poor_average = 0 AND good_excellent > 0 — no POOR/AVERAGE assets, some rated.
    Fail: poor_average > good_excellent — majority of assessable assets are poor quality.
    Warn: poor_average > 0 but < good_excellent, OR unspecified dominates (data gap).
    Always flag: "PMax asset group strength (p_ads_AssetGroup) is unavailable in BQ export —
    verify asset group strength directly in Google Ads UI."

- Audience signal quality:
    From _source="pmax_audience_signals": check audience_signal_count per campaign_id.
    Pass: every campaign_id has audience_signal_count >= 1 — every asset group has at least
      one audience signal guiding algorithmic expansion.
    Fail: any campaign_id has audience_signal_count = 0 — asset groups launched with zero
      audience signals, forcing completely unguided algorithmic search.
    If no pmax_audience_signals rows at all: score as warn/basic and note data unavailable —
      manual verification required in Google Ads > Asset Groups > Audience Signals.
    NOTE: signal type quality (first-party customer match vs. interest-based) is not
    distinguishable from this data — flag for manual review of signal composition.
    If hasCrmData=false: do not penalise absence of customer match signals specifically.

- Smart bidding configuration:
    From _source="pmax_campaign": for rows where status="ENABLED", check with_target_roas only
    (with_target_cpa is always 0 — data gap; see DATA AVAILABILITY NOTES).
    Pass: all enabled PMax campaign rows have with_target_roas = campaign_count — every active
      PMax campaign has a target ROAS constraint.
    Fail: sum(with_target_roas) = 0 across all enabled rows — no PMax campaign has any target
      constraint set, completely unconstrained pacing.
    Warn: some enabled PMax campaign rows have with_target_roas < campaign_count — partial
      coverage (some campaigns constrained, others not).

- PMax vs. standard campaign balance:
    From _source="pmax_brand_exclusions": read pmax_with_campaign_negatives, total_enabled_pmax.
    Note: pmax_with_shared_neg_lists is always 0 (data gap — see DATA AVAILABILITY NOTES);
    evaluate exclusion coverage using pmax_with_campaign_negatives only.
    Pass: Brand Exclusion Lists or shared negative brand lists are actively attached to PMax
      campaigns — pmax_with_campaign_negatives = total_enabled_pmax (every enabled PMax has
      campaign-level negatives protecting standard Exact Match search priority).
    Fail: PMax campaigns fully cannibalize standard brand search due to a total lack of brand
      exclusions — pmax_with_campaign_negatives = 0.
    Warn: pmax_with_campaign_negatives > 0 but < total_enabled_pmax — partial coverage;
      some PMax campaigns lack exclusions.
    Always add action item: "Verify shared negative keyword lists (Brand Exclusion Lists) in
    Google Ads UI — shared list coverage cannot be confirmed from BQ export data."
    If pmax_brand_exclusions is empty (data unavailable): score as warn and flag for manual
    verification.

- AI Max:
    AI Max (formerly Search Max) is a campaign feature that enables AI-powered keyword expansion
    and creative matching. This setting is NOT visible in the Google Ads BQ export.
    Pass: Search campaigns have AI Max enabled AND branded campaigns using AI Max have brand
      inclusions configured to prevent brand dilution.
    Fail: No campaign has AI Max enabled.
    Warn: AI Max is enabled but no guardrails (brand inclusions or brand exclusions) are configured.
    Since this data is unavailable from BQ, score as warn and instruct:
    "Verify in Google Ads > Campaigns > Settings whether AI Max is enabled. Ensure branded
    campaigns using AI Max are protected with Brand Inclusions (to restrict expansion to your
    own brand terms) or Brand Exclusions (to prevent PMax from competing with standard Search)."

- Native AI-driven generative tools in AI Max:
    This topic evaluates whether campaigns with AI Max enabled use native generative tools for
    asset expansion. This configuration is NOT visible in the Google Ads BQ export.
    Pass: Campaigns with AI Max enabled have Text Customization or Final URL Expansion active
      with text guidelines and URL exclusions configured.
    Fail: Campaigns have Text Customization or Final URL Expansion enabled but without text
      guidelines and URL exclusions. Or no campaign has AI Max enabled.
    Since this data is unavailable from BQ, score as warn and instruct:
    "Verify in Google Ads > AI Max settings whether Text Customization is enabled. If so,
    confirm that text guidelines (prohibited topics, brand tone) and URL exclusions are
    configured — without these guardrails, AI-generated copy may violate brand standards."

- Native AI-driven generative tools in PMax:
    This topic evaluates whether active PMax campaigns leverage native AI generative tools for
    asset volume expansion. Automatically Created Assets (ACA) and Final URL Expansion
    settings are NOT directly exposed in the standard BQ export.
    Pass: PMax campaigns have Automatically Created Assets or Final URL Expansion enabled, and
      asset groups utilize AI-generated visual variations or custom-prompted asset scaling.
    Fail: Automatically Created Assets and URL expansions are entirely disabled while asset groups
      have a low volume of manually uploaded creatives, preventing AI from testing variations.
    From _source="pmax_asset": if asset_count is very low (e.g. < 3 per status group) it may
    indicate minimal creative supply — note this as a signal but flag for manual verification.
    Score as warn and instruct:
    "Verify in Google Ads > Performance Max > Settings whether Automatically Created Assets
    and Final URL Expansion are enabled. With a limited creative library, enabling ACA allows
    Google's AI to generate text and image variations at scale."

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
- hasCrmData=false: do not penalise missing customer match audience signals in ai_readiness
  or audience_targeting — the client has no CRM data available to upload.
- hasProductFeed=false: do not penalise missing feed completeness or dynamic remarketing in
  feeds_catalogue, and do not expect Shopping PMax campaigns in ai_readiness.

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
