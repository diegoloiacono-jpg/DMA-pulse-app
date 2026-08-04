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

DATA AVAILABILITY — GENERAL RULE:
The Google Ads data now arrives via a Supermetrics BigQuery export, which is flatter and less
granular than the previous native Google Ads BigQuery Data Transfer export. If the data you
receive for a category is exactly `{"_empty": true}`, that category has no BigQuery signal at
all in the current data source. In that case, return one entry per listed topic with:
  status = "warn", level = "basic", source = "no_data_source",
  action = "Verify manually — no BigQuery signal available for this category in the current
    data source (Supermetrics export does not include this data)",
  explanation = one sentence naming what table/field would be needed.
Apply this same "no_data_source" treatment to any individual topic below whose criteria say
its data has been dropped from the export, even when other topics in the same category still
have real data to evaluate.

=== PER-TOPIC EVALUATION CRITERIA ===

CAMPAIGN SETUP CATEGORY:
campaign rows (_source="campaign") have: campaign_id, campaign_name, status,
campaign_advertising_channel_type, campaign_advertising_channel_sub_type,
campaign_bidding_strategy_type, daily_budget (already in account currency, not micros).
campaign_perf rows (_source="campaign_perf") have: campaign_id, impressions_period,
impressions_recent, conversions_period, cost_period — aggregated over the audit's configurable
lookback window (impressions_period/conversions_period/cost_period cover the full window;
impressions_recent covers a shorter recent sub-window, typically the last 7 days or the full
window if shorter). Treat "period"/"recent" as relative to whatever window was actually used —
do not assume a fixed 30 days.
campaign_type_summary rows (_source="campaign_type_summary") have: campaign_advertising_channel_type,
campaign_count, _summary=true.
campaign_bidding_strategy_type values are human-readable strings from Supermetrics, not
  SCREAMING_SNAKE_CASE enums — e.g. "Maximize Conversion Value", "Target ROAS", "cpc". Match
  semantically rather than expecting exact old-style tokens.
Smart bidding types (any casing/spacing): Maximize Conversions, Target CPA, Target ROAS,
  Maximize Conversion Value.
Manual/basic bidding types (any casing/spacing): cpc, Manual CPC, Enhanced CPC, Maximize Clicks,
  Target Spend.
DATA AVAILABILITY NOTE: has_recommended_budget, budget target-vs-actual flags, and campaign
  start/end dates are NOT available in this export (regression vs. the previous schema, which
  had has_recommended_budget). Budget allocation below is evaluated from daily_budget vs. actual
  spend only.

- Campaign naming convention:
    Read _naming_convention_compliance_pct from the row where _summary=true.
    100% -> pass / champion.
    Any value < 100% -> fail / basic.
    Also fail if any campaign_name in _source="campaign" rows contains default strings
    such as "Campaign #", "Ad set #", or is blank.
    If the _summary row is absent, evaluate qualitatively from raw campaign_name values.

- Campaign status hygiene:
    Cross-reference _source="campaign" (status) with _source="campaign_perf" (impressions_recent,
    impressions_period) by campaign_id.
    Pass: every campaign where status="ENABLED" has impressions_recent > 0.
    Fail: any campaign with status="ENABLED" AND impressions_period = 0 (zero impressions across
          the whole lookback window).
    Warn: any campaign with status="ENABLED" AND impressions_recent = 0 but impressions_period > 0
          (was active earlier in the window but stalled recently).
    Do not penalise PAUSED or REMOVED campaigns.

- Bidding strategy:
    For each row in _source="campaign_perf" joined to _source="campaign" by campaign_id, read
    campaign_bidding_strategy_type and conversions_period.
    Pass: all campaigns use smart bidding types, OR any manual/basic campaign has conversions_period
          below roughly 30 (insufficient conversion volume to justify switching — acceptable for
          niche/B2B, and expected while the lookback window is still short/data is sparse).
    Fail: any campaign uses MANUAL_CPC or ENHANCED_CPC AND conversions_period is clearly high
          relative to the window (ample signal, no reason to stay manual).
    Warn: any campaign uses MAXIMIZE_CLICKS with meaningful conversions_period.

- Budget allocation:
    DATA AVAILABILITY NOTE: has_recommended_budget and budget_amount_micros are NOT available in
    this export — evaluate using daily_budget (from _source="campaign") against actual spend
    (cost_period from _source="campaign_perf") only.
    Pass: campaigns with the highest cost_period are not obviously budget-capped (daily_budget
      comfortably exceeds average daily spend implied by cost_period over the window).
    Fail: a top-performing campaign (high conversions_period) shows cost_period tracking very
      close to daily_budget × window days (likely budget-constrained), while other
      lower-performing campaigns show cost_period well below their daily_budget × window days
      (idle budget sitting unused elsewhere).
    Warn: some campaigns show spend tracking close to their daily_budget cap, without the full
      cross-condition above.

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
    DATA AVAILABILITY NOTE: hourly/day-of-week stats and ad-schedule criteria have no equivalent
    table in the current Supermetrics export. Apply the general "no_data_source" rule: score as
    warn/basic, source="no_data_source", and instruct: "Verify dayparting and AD_SCHEDULE
    configuration directly in Google Ads UI — not available from the current BigQuery export."

- Data density:
    From _source="campaign_perf": for each smart-bidding campaign (join to _source="campaign" for
    campaign_bidding_strategy_type), read conversions_period. Smart bidding requires sufficient
    conversion volume to learn effectively (Google recommends ~30 conversions per campaign per
    30-day window for most smart bidding strategies — scale this expectation down proportionally
    if the lookback window is shorter than 30 days, since the export may only have a few days
    of history so far).
    Pass: the majority (>60%) of ENABLED smart-bidding campaigns are on pace for that volume
      given the window length — the account provides sufficient data for the bidding algorithm
      to optimise.
    Fail: the majority of smart-bidding campaigns are clearly far off pace — running smart
      bidding without enough conversion signal, leading to suboptimal learning.
    Warn: borderline — partial data density; algorithm can learn but performance may be
      constrained. If the lookback window is very short (a few days), lean toward warn rather
      than fail and note that the assessment will sharpen as more history accumulates.
    If no smart-bidding campaigns exist, score as warn: data density is not applicable but
    note the account relies on manual bidding without conversion learning.

AUDIENCE TARGETING CATEGORY:
DATA AVAILABILITY NOTE: none of CampaignAudience, CampaignCriterion, Gender, or AgeRange have an
  equivalent table in the current Supermetrics export. This category's data will always be
  `{"_empty": true}` under the current data source — apply the general "no_data_source" rule to
  every topic below (Audience segmentation, Remarketing lists, Similar audiences / lookalikes,
  Demographic targeting, Geo targeting precision, Exclusion lists). For each, instruct the user
  to verify directly in Google Ads UI under Audiences / Demographics / Locations, and name the
  specific screen (e.g. "Audiences > Targeting setting" for segmentation mode, "Audience Manager"
  for remarketing lists, "Campaigns > Locations" for geo targeting, "Audiences > Exclusions" for
  exclusion lists).

CONVERSION KPI CATEGORY:
DATA AVAILABILITY NOTE: there is no ConversionAction-equivalent table in this export either
  (same gap as before). The conversion_actions source is derived from GOOGLEADS_CONVERSION over
  the audit's lookback window. Available columns: name, category, conversions_period, value_period,
  campaigns_tracking. NOT available: status, primary_for_goal, attribution_model,
  include_in_conversions, counting_type — these require manual verification in the Google Ads UI.
  target_roas/target_cpa are NOT available at all anymore (a new regression — the previous export
  at least had target_roas); campaign_targets below is actual-performance-only, no target
  comparison is possible.
conversion_actions rows (_source="conversion_actions") have: name, category, conversions_period,
  value_period, campaigns_tracking. category is Supermetrics' free-text CONVERSION_CATEGORY label
  (e.g. "Purchase/Sale", "Add to cart", "Lead", "Sign-up", "Page view") — not a fixed enum. Judge
  bottom-of-funnel vs. soft-event intent semantically from the label text rather than expecting
  exact PURCHASE/LEAD/PAGE_VIEW tokens.
campaign_targets rows (_source="campaign_targets") have: campaign_id, bidding_strategy,
  actual_roas_period, actual_cpa_period, conversions_period. No target_roas/target_cpa column exists.
campaign_basic_stats rows (_source="campaign_basic_stats") have: campaign_id, date, impressions,
  clicks, cost, conversions, conversions_value, roas, cpa (cost is already in account currency).
campaign_conversion_stats rows (_source="campaign_conversion_stats") have: campaign_id,
  conversion_name, conversion_category, conversions, conversions_value.
cross_device_conversions rows (_source="cross_device_conversions") have: name, category,
  cross_device_conversions_period, campaigns_with_xdevice, _summary=true. (This is actually simpler
  and more reliable than before — cross-device figures come straight off the conversion export,
  no join required.)

- Conversion tracking setup:
    From _source="conversion_actions": check conversions_period > 0 for any action.
    From _source="campaign_basic_stats": verify active spend exists.
    Pass: conversion_actions has at least one row with conversions_period > 0 AND
      campaign_basic_stats shows active spend — tracking is firing and recording conversions.
    Fail: campaign_basic_stats shows spend but conversion_actions has zero conversions across all
      actions — tracking is broken or no conversion actions are configured.
    Warn: very few conversions relative to spend (possible partial tag breakage), or the lookback
      window is short enough that absence of conversions isn't yet conclusive — note this caveat.
    NOTE: tag firing recency (within 24h), include_in_conversions, and action status cannot be
    verified from BQ daily batches — flag for manual validation in Google Ads tag diagnostics.

- Conversion categories:
    From _source="conversion_actions": read category for each tracked action.
    Pass: at least one action has a category label that reads as bottom-of-funnel (e.g.
      "Purchase/Sale", "Add to cart" for e-commerce; "Lead", "Sign-up", "Phone call" for lead-gen)
      with conversions_period > 0 — bottom-of-funnel events are being tracked and firing.
    Fail: all actions recording conversions have category labels that read as soft micro-events
      (e.g. "Page view", "Download", "Newsletter signup" with no purchase/lead action present) —
      account is optimizing for soft engagement instead of revenue or lead objectives.
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
    DATA AVAILABILITY NOTE: target_roas and target_cpa are NOT available anywhere in this export
    (both gone — a new regression). This topic cannot be evaluated automatically. Score as warn,
    source="no_data_source", and instruct: "Verify tROAS/tCPA targets directly in Google Ads UI
    for each smart-bidding campaign; compare against actual_roas_period/actual_cpa_period from
    campaign_targets (available in this export) to judge whether targets look realistic."

- Target stability:
    DATA AVAILABILITY NOTE: same gap as ROAS/CPA targets above — no target_roas/target_cpa column
    exists to compare against actual performance. Score as warn, source="no_data_source", and
    instruct: "Verify target revision frequency and target-vs-actual variance directly in Google
    Ads UI change history; actual_roas_period/actual_cpa_period from this export can inform the
    conversation but cannot substitute for the target values themselves."

- Attribution model:
    attribution_model is NOT available in this BQ export. Score as warn and flag for manual
    verification: "Verify in Google Ads > Tools > Conversions that all primary conversion actions
    use Data-Driven attribution. Last-Click attribution under-credits upper-funnel activity
    and distorts smart bidding signals."

- Cross-device conversions:
    From _source="cross_device_conversions": check cross_device_conversions_period.
    Pass: at least one row exists with cross_device_conversions_period > 0 — cross-device
      paths are being tracked and contributing to conversion counts.
    Fail: source is empty or all cross_device_conversions_period = 0 — account is blind to
      users who switch devices between click and conversion.
    Warn: cross-device conversions present but very low relative to total conversions
      (possible under-attribution).

FEEDS & CATALOGUE CATEGORY:
DATA AVAILABILITY NOTE: PRODUCT_TITLE actually exists directly in this export (an upgrade over the
  previous schema, which was missing it entirely) — "Product title optimisation" below now has a
  real automated check instead of a permanent stub. Conversely, this export has NO conversions
  column on the Shopping report at all (a new regression), and NO product-group / ad-group-level
  partitioning data — "Shopping campaign structure" below has no automated signal anymore.
shopping_product_stats rows (_source="shopping_product_stats") have: campaign_id, product_brand,
  rows_with_label_0 through rows_with_label_4 (count of rows where that custom label is non-empty),
  impressions, clicks, cost. No conversions or product_channel column exists.
product_title_sample rows (_source="product_title_sample") have: product_title, product_type,
  product_brand, custom_label_0, custom_label_1, custom_label_2, impressions. product_title is a
  real title string now — evaluate it directly rather than as a structural proxy.
NOTE: Merchant Center diagnostic health data (approval rates, disapproval counts) is NOT available
in the Google Ads BQ export — these criteria require manual verification in Merchant Center.

- Product feed completeness:
    From _source="shopping_product_stats": if rows exist with impressions > 0, the feed is live.
    From _source="product_title_sample": check product_title, product_type, and product_brand for
    null values.
    Pass: shopping_product_stats rows present with impressions > 0 AND product_title_sample shows
      non-null product_title/product_type/product_brand on most rows — feed is active and
      categorised.
    Fail: zero shopping_product_stats rows (no active feed or no Shopping campaigns).
    Warn: shopping stats present but product_title or product_type is mostly null — incomplete feed.
    NOTE: Merchant Center approval rate (>95% threshold) cannot be verified from BQ — flag for
    manual review in Merchant Center Diagnostics.

- Product title optimisation:
    From _source="product_title_sample": read product_title, product_brand directly (this is real
    title text now, not a proxy).
    Pass: the majority of sampled titles are reasonably descriptive (contain more than just a
      generic code), include the product_brand token, and are not empty/placeholder strings.
    Fail: most sampled titles are blank, purely numeric/SKU-like, or do not contain product_brand
      at all — titles are not structured for Shopping ad relevance.
    Warn: titles are present and non-empty but inconsistent — some descriptive, some generic —
      or brand inclusion is partial across the catalogue.
    Always add: "Full title-length and keyword-placement review (target 70+ characters, key
    attributes near the front) still requires manual confirmation in Merchant Center."

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
    DATA AVAILABILITY NOTE: there is no ad_group_id or product-group-count concept anywhere in
    this export (a new regression — the previous schema had ProductGroupStats). This topic cannot
    be evaluated automatically. Score as warn, source="no_data_source", and instruct: "Verify
    Shopping ad group / listing group partitioning directly in Google Ads UI — confirm the catalog
    is split by brand, category, or custom label rather than left in a single catch-all group."

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
ad rows (_source="ad") are account-level aggregates: type, status, policy_approval_status,
  ad_count. NOTE: ad_strength is NOT available anywhere in this export (a new regression — the
  previous schema at least had it as a weak proxy).
ad_group rows (_source="ad_group") have: ad_group_id, campaign_id, ad_group_name, status.
  NOTE: ad_group_type is NOT available (no way to detect PMax/Display ad-group type from this
  table alone — cross-reference campaign type via campaign_id where needed).
rsa_per_adgroup rows (_source="rsa_per_adgroup") have: ad_group_id, campaign_id,
  enabled_rsa_count, total_enabled_ads, disapproved_count, rich_media_count. One row per ad group.
  NOTE: good_excellent_rsa_count/poor_average_rsa_count are gone (ad_strength unavailable).
rsa_headline_summary row (_source="rsa_headline_summary", _summary=true) has:
  total_rsa_ads, ads_5plus_headlines, ads_under_3_headlines, ads_2plus_descriptions,
  avg_headline_count, avg_description_count.
  NOTE: headline/description text is now derived from flat scalar columns (HEADLINE,
  HEADLINE_PART_1/2/3, LONG_HEADLINE, SHORT_HEADLINE = max 6 slots; DESCRIPTION, DESCRIPTION_1/2 =
  max 3 slots) rather than a JSON array of up to 15/4 slots. Thresholds below are recalibrated
  for this lower ceiling — do not apply the old "10+ headlines" bar, it is unreachable here.
  Actual headline/description TEXT is available on the raw ad rows if needed for qualitative
  review, even though this summary only reports counts.

- Responsive search ad coverage:
    From _source="rsa_per_adgroup": count rows where enabled_rsa_count = 0.
    Cross-reference with _source="ad_group" to confirm those rows are active ad groups
    (status="ENABLED").
    Pass: every active ad group has enabled_rsa_count >= 1.
    Fail: any active ad group has enabled_rsa_count = 0 — relying on legacy formats only.
    Warn: enabled_rsa_count = 1 only (minimum coverage, no redundancy).

- Asset group ad strength:
    DATA AVAILABILITY NOTE: ad_strength is NOT available anywhere in this export (regression —
    the previous schema at least had it as a weak proxy on p_ads_Ad). This topic cannot be
    evaluated automatically. Score as warn, source="no_data_source", and instruct: "Verify RSA
    and asset group ad-strength ratings directly in Google Ads UI — not available from the
    current BigQuery export."

- Headline / description variety:
    From _source="rsa_headline_summary": read ads_5plus_headlines, ads_under_3_headlines,
    ads_2plus_descriptions, avg_headline_count, avg_description_count, total_rsa_ads.
    Remember the ceiling here is 6 headline slots / 3 description slots (not 15/4).
    DATA AVAILABILITY CAVEAT: for some accounts the underlying headline/description text
    columns come back completely empty from Supermetrics even though RSA ads exist (a report
    configuration gap, not a copy quality issue). If avg_headline_count = 0 AND
    avg_description_count = 0 while total_rsa_ads > 0, treat this as UNAVAILABLE data —
    score as warn, source="no_data_source", and instruct: "Headline/description text is not
    populated for RSAs in the current BigQuery export — verify headline and description slot
    usage directly in Google Ads UI." Do NOT score this as fail; a genuine zero-slot finding
    and a data gap look identical in the aggregate numbers, and only the data-gap explanation
    is safe to assume by default.
    Otherwise (some real values present):
    Pass: ads_5plus_headlines / total_rsa_ads >= 80% AND avg_description_count >= 2.0 —
      most RSAs use 5+ of the 6 observable headline slots and 2+ of the 3 description slots.
    Fail: ads_under_3_headlines / total_rsa_ads > 20% OR avg_headline_count < 3 —
      significant slot underutilization or repetitive copy.
    Warn: avg_headline_count between 3–4 (acceptable but not optimised).
    If rsa_headline_summary is empty entirely, fall back to comparing total ENABLED ad count
    from _source="ad" against total ad groups from _source="ad_group".

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
      policy_approval_status = "DISAPPROVED" with ad_count that represents > 0% of ENABLED ads.
    Warn: UNDER_REVIEW status present — pending approval, not yet a violation.

- Ad copy relevance:
    From _source="ad_group": review ad_group_name values for descriptive keyword themes. Note:
    the raw ad rows have HEADLINE/HEADLINE_PART_1-3/DESCRIPTION/DESCRIPTION_1-2 columns, but for
    some accounts Supermetrics leaves them entirely empty (see the headline/description variety
    data-availability caveat above) — do not assume headline text is reliably present.
    Score as warn if ad_group_names are generic (e.g., "Ad Group 1", "Group A") with no
    apparent keyword theme — suggests copy relevance has not been configured.
    Score as pass if ad_group_names contain specific keyword terms or product/service categories
    that would logically align with ad copy.
    Always flag: "Headline-to-keyword relevance requires manual review — verify that the top
    keyword intent of each ad group appears in the first 3 headline slots of its RSA."

KEYWORD STRATEGY CATEGORY:
DATA AVAILABILITY NOTE: the keyword report in this export contains only positive/active keywords
  — there is no is_negative flag at all (Supermetrics convention), and no campaign-level negative
  criteria, DSA ad-group type, system-serving-status breakdown, or shared negative list table
  exist anywhere in this dataset. "Negative keyword coverage" below has lost all three of its old
  signals and is now a full manual-verification stub. "Keyword status hygiene" and "DSA / dynamic
  ad groups" are weaker than before but still partially automated.
keyword rows (_source="keyword") are aggregated by (match_type, status, bidding_strategy_type)
  with keyword_count, avg_quality_score (bidding_strategy_type comes from a join to the campaign
  table by name, so it may be null if no match was found).
  bidding_strategy_type values are human-readable strings (e.g. "Maximize Conversion Value",
  "Target ROAS", "cpc"), not SCREAMING_SNAKE_CASE enums — match semantically.
impression_weighted_qs row (_source="impression_weighted_qs", _summary=true) has:
  impression_weighted_avg_qs, keywords_qs_7plus, keywords_qs_4minus, total_keywords_with_qs,
  qs_status_computed (already computed in Python — see below).
adgroup_kw_structure row (_source="adgroup_kw_structure", _summary=true) has:
  total_ad_groups, ad_groups_50plus_kw, ad_groups_16_to_50_kw, ad_groups_15minus_kw,
  avg_kw_per_adgroup, max_kw_per_adgroup.

- Keyword match type distribution:
    From _source="keyword": group by match_type and bidding_strategy_type (keyword_count only —
    remember this table has no negative keywords to filter out, all rows are positive).
    Pass: BROAD match keywords exist AND all campaigns running BROAD use smart bidding types —
      broad is only deployed where machine learning signals guide it.
    Fail: any BROAD match keywords exist alongside MANUAL_CPC or ENHANCED_CPC bidding —
      uncapped broad match running in legacy manual bidding, diluting budget.
    Warn: BROAD present with a mix of smart and manual bidding campaigns, or bidding_strategy_type
      is null for a meaningful share of BROAD keywords (the campaign-name join didn't resolve —
      note this as a data-quality caveat rather than a hard fail).
    If no BROAD keywords exist: EXACT + PHRASE only — acceptable, not a failure.

- Negative keyword coverage:
    DATA AVAILABILITY NOTE: this export has no negative-keyword signal of any kind — no
    is_negative flag on the keyword report, no campaign-level negative criteria table, and no
    shared negative list table. This topic cannot be evaluated automatically. Score as warn,
    source="no_data_source", and instruct: "Verify negative keyword coverage (ad-group level,
    campaign level, and shared negative lists) directly in Google Ads UI — not available from
    the current BigQuery export."

- Keyword quality scores:
    From _source="impression_weighted_qs": read qs_status_computed directly — this field
    has already been computed from the threshold and you MUST use it as the verdict.
      qs_status_computed = "pass" → score pass
      qs_status_computed = "warn" → score warn
      qs_status_computed = "fail" → score fail
    Do NOT use _source="keyword" avg_quality_score to override this verdict.
    If the impression_weighted_qs row is absent: fall back to avg_quality_score × keyword_count
    weighted average from _source="keyword" where status="ENABLED";
    apply pass ≥7.0, warn 5.5–6.9, fail <5.5.
    If all quality scores are null: score as warn — manual verification required.

- Keyword status hygiene:
    DATA AVAILABILITY NOTE: system_serving_status (ELIGIBLE/RARELY_SERVED/BELOW_FIRST_PAGE_BID/
    LOW_SEARCH_VOLUME) and disapproved_count are NOT available in this export — only the basic
    KEYWORD_STATUS enum (ENABLED/PAUSED/REMOVED) remains, via the `status` field on _source="keyword".
    Pass: the large majority of keyword_count is in status ENABLED with none in a clearly stale
      state — basic hygiene looks fine from what's visible.
    Warn (default): treat this as a thinner signal than before — score warn if PAUSED/REMOVED
      keyword_count is unusually high relative to ENABLED, and always add: "Delivery-limiting
      statuses (BELOW_FIRST_PAGE_BID, LOW_SEARCH_VOLUME, RARELY_SERVED) are not visible in the
      current BigQuery export — verify directly in Google Ads UI."
    Fail: PAUSED/REMOVED keyword_count dominates ENABLED — most of the keyword list is inactive.

- Ad group keyword structure:
    From _source="adgroup_kw_structure": read ad_groups_50plus_kw, ad_groups_15minus_kw,
    avg_kw_per_adgroup, total_ad_groups.
    Pass: ad_groups_15minus_kw / total_ad_groups >= 80% — majority of ad groups are tight
      with ≤15 closely related keywords per group.
    Fail: ad_groups_50plus_kw / total_ad_groups > 20%, OR max_kw_per_adgroup > 50 with
      avg_kw_per_adgroup > 30 — significant share of ad groups are bloated keyword dumps
      that fracture ad copy relevance.
    Warn: avg_kw_per_adgroup between 15 and 30 — moderate oversizing, not critical.
    If adgroup_kw_structure is empty: score as warn — data unavailable.

- DSA / dynamic ad groups:
    DATA AVAILABILITY NOTE: there is no ad_group_type column anywhere in this export, so DSA ad
    groups cannot be directly identified (a regression vs. the previous schema). The only
    remaining automated signal is PMax adoption from the ai_readiness data.
    Pass: from _source="all_campaigns" in the ai_readiness data, enabled PMax campaigns exist —
      at least one automated long-tail expansion mechanism is active.
    Warn: no PMax campaigns evident either — always add: "Dynamic Search Ads ad-group presence
      cannot be confirmed from the current BigQuery export — verify directly in Google Ads UI."
    Do not score fail here given the reduced visibility — use warn as the ceiling when no
    automated expansion mechanism is evident.

AI READINESS CATEGORY:
DATA AVAILABILITY NOTES — this category has degraded significantly under the current export:
- with_target_roas AND with_target_cpa are now BOTH always 0 in pmax_campaign rows (previously
  only with_target_cpa was a placeholder; target_roas is now gone from the whole dataset too).
  "Smart bidding configuration" below can no longer be evaluated automatically at all.
- There is no CampaignCriterion-equivalent table, so brand-exclusion / campaign-negative checks
  have no data source — "PMax vs. standard campaign balance" cannot be evaluated automatically.
- There is no Ad.ad_strength column at all anymore (not even as a weak proxy) — "Asset group
  strength" cannot be evaluated automatically.
- There is no AssetGroupAudienceView or CampaignAudience equivalent — "Audience signal quality"
  cannot be evaluated automatically.
- Only "PMax campaign adoption" remains genuinely automated in this category; the other four
  topics below are manual-verification stubs under the general "no_data_source" rule. If
  Supermetrics adds a richer PMax/asset-group report later, these can become real checks again.

pmax_campaign rows (_source="pmax_campaign") are aggregated by (status, bidding_strategy_type)
  with campaign_count, with_target_roas (always 0), with_target_cpa (always 0). One row per
  status+strategy combination.
all_campaigns rows (_source="all_campaigns") have: campaign_advertising_channel_type, status,
  campaign_count. One row per type+status combination.

- PMax campaign adoption:
    From _source="pmax_campaign": sum campaign_count where status="ENABLED".
    Pass: at least one enabled PMax campaign exists — multi-channel conversion infrastructure
      is deployed and running.
    Fail: total enabled PMax campaign_count = 0 — no PMax active despite the account having
      multi-channel retail or lead-generation objectives.
    Apply brand context: if hasProductFeed=false, score as not applicable for retail PMax;
    if B2B account with no e-commerce goals, absence of PMax is less severe (score as warn).

- Asset group strength:
    DATA AVAILABILITY NOTE: no ad_strength column exists anywhere in this export (a new
    regression — the previous schema at least had a weak proxy). This topic cannot be evaluated
    automatically. Score as warn, source="no_data_source", and instruct: "Verify PMax asset
    group strength directly in Google Ads UI > Performance Max > Asset groups — not available
    from the current BigQuery export."

- Audience signal quality:
    DATA AVAILABILITY NOTE: no audience-signal table (AssetGroupAudienceView or CampaignAudience)
    exists in this export. This topic cannot be evaluated automatically. Score as warn,
    source="no_data_source", and instruct: "Verify audience signal coverage directly in Google
    Ads UI > Asset Groups > Audience Signals — not available from the current BigQuery export."
    If hasCrmData=false: still note this data gap, but do not additionally penalise absence of
    customer match signals specifically.

- Smart bidding configuration:
    DATA AVAILABILITY NOTE: with_target_roas and with_target_cpa are both hardcoded 0 in this
    export (target_roas is gone from the dataset entirely — a new regression). This topic cannot
    be evaluated automatically. Score as warn, source="no_data_source", and instruct: "Verify
    target ROAS/CPA configuration for each enabled PMax campaign directly in Google Ads UI —
    not available from the current BigQuery export."

- PMax vs. standard campaign balance:
    DATA AVAILABILITY NOTE: no CampaignCriterion-equivalent table exists in this export, so
    brand-exclusion coverage on PMax campaigns cannot be measured. This topic cannot be
    evaluated automatically. Score as warn, source="no_data_source", and instruct: "Verify
    Brand Exclusion Lists / campaign-level negative keywords on PMax campaigns directly in
    Google Ads UI — not available from the current BigQuery export."

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
    No creative-supply-volume signal is available in the current export (no asset-group-level
    table exists) to inform this qualitatively — treat it as fully unavailable.
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
