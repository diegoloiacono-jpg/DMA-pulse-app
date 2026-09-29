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
from app.services.data_extraction import DATA_GAPS

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
The Google Ads data arrives from a BigQuery export that mirrors the native Google Ads Data
Transfer schema (dated GOOGLEADS_P_* fact tables joined to undated GOOGLEADS_*METADATA entity
tables). Most fields that were previously missing are now present — evaluate topics from real
data wherever the listed sources appear, and only fall back to manual-verification stubs where
a topic is explicitly named as unavailable below.
If the prompt includes a "TOPICS WITH NO DATA SOURCE" list, apply the no_data_source treatment
to exactly those topics, whatever the rest of the category data shows.
If the data you receive for a category is exactly `{"_empty": true}`, that category has no
BigQuery signal at all in the current data source. In that case, return one entry per listed
topic with:
  status = "warn", level = "basic", source = "no_data_source",
  action = "Verify manually — no BigQuery signal available for this category in the current
    data source (Supermetrics export does not include this data)",
  explanation = one sentence naming what table/field would be needed.
Apply this same "no_data_source" treatment to any individual topic below whose criteria say
its data has been dropped from the export, even when other topics in the same category still
have real data to evaluate.

=== PER-TOPIC EVALUATION CRITERIA ===

CAMPAIGN SETUP CATEGORY:
campaign rows (_source="campaign") have: campaign_id, campaign_name, status, serving_status,
campaign_advertising_channel_type, start_date, end_date, daily_budget (already in account
currency, not micros), budget_period, budget_is_shared, campaign_bidding_strategy_type,
bid_strategy_status, target_roas, ad_schedule_days.
campaign_impression_share rows (_source="campaign_impression_share") have: campaign_id,
avg_search_impression_share, avg_budget_lost_is, avg_rank_lost_is, avg_abs_top_is — all as
decimal fractions (0.35 = 35%).
campaign_schedule rows (_source="campaign_schedule", _schedule_summary=true) have:
campaigns_with_schedule, campaigns_with_day_rows, distinct_days_scheduled.
campaign_perf rows (_source="campaign_perf") have: campaign_id, impressions_period,
impressions_recent, conversions_period, conversion_value_period, cost_period — aggregated over the audit's configurable
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
DATA AVAILABILITY NOTE: has_recommended_budget is still NOT available. Everything else needed
  for this category now is: daily_budget, campaign start_date/end_date, serving_status,
  bid_strategy_status (which surfaces LIMITED_BY_BUDGET / LIMITED_BY_CPC_BID_CEILING directly),
  target_roas, ad_schedule_days, and full impression-share-lost-to-budget-vs-rank figures.

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
    Use three signals together: daily_budget vs. actual spend (cost_period), bid_strategy_status,
    and avg_budget_lost_is from _source="campaign_impression_share".
    Pass: no campaign has bid_strategy_status="LIMITED_BY_BUDGET", and avg_budget_lost_is is low
      (roughly < 0.10) across the highest-spending campaigns.
    Fail: a campaign with strong conversions_period shows bid_strategy_status="LIMITED_BY_BUDGET"
      or avg_budget_lost_is above roughly 0.20, while other lower-performing campaigns spend well
      below their daily_budget × window days (idle budget sitting unused elsewhere).
    Warn: some budget-lost impression share is present (roughly 0.10–0.20) without the full
      misallocation cross-condition above.
    Note in the explanation whether the constraint is budget (avg_budget_lost_is) or auction rank
    (avg_rank_lost_is) — these call for different fixes, and only the former is a budget problem.

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
    Read ad_schedule_days per campaign (_source="campaign") and distinct_days_scheduled from
    _source="campaign_schedule". ad_schedule_days counts the distinct scheduled days of week
    attached to that campaign: 7 means the campaign runs all week (no dayparting applied),
    fewer than 7 means a deliberate day-of-week schedule is in place.
    Pass: at least some campaigns show ad_schedule_days < 7, indicating dayparting is actively
      used where it makes sense.
    Warn: every campaign shows ad_schedule_days = 7 — no dayparting anywhere. This is defensible
      for always-on e-commerce, so warn rather than fail, and recommend testing a schedule
      against the account's known conversion-by-day pattern.
    Fail: ad_schedule_days is 0 or null across the account (no schedule data attached at all).
    NOTE: hour-of-day granularity is still unavailable — only day-of-week. Say so in the
    explanation and direct hour-level checks to the Google Ads UI.

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
This category has real data as of the 2026-08-20 schema rebuild — do NOT stub it.
audience rows (_source="audience") have: audience_name, audience_status, campaign_count,
  is_lookalike (bool), is_remarketing (bool).
audience_perf rows (_source="audience_perf") have: audience_name, campaign_count,
  impressions_period, clicks_period, cost_period, conversions_period, conversion_value_period.
demographics rows (_source="demographics") have: dimension ("age" or "gender"), bucket,
  impressions_period, cost_period, conversions_period.
geo_mode rows (_source="geo_mode") have: location_targeting_mode
  (LOCATION_OF_PRESENCE or AREA_OF_INTEREST), campaign_count.
geo_perf rows (_source="geo_perf") have: location_granularity (Country/Region/Province/City/
  Municipality/State/Department), locations_targeted, campaign_count, impressions_period,
  cost_period, conversions_period.

- Audience segmentation:
    Pass: multiple distinct audience_name values attached across several campaigns, and
      audience_perf shows more than one audience with impressions_period > 0 (segments are
      actually serving, not just attached).
    Warn: audiences are attached but only one or two carry meaningful impressions.
    Fail: no audience rows, or every audience has zero impressions.

- Remarketing lists:
    Pass: at least one audience with is_remarketing=true has impressions_period > 0 and
      conversions_period > 0.
    Warn: remarketing audiences are attached but show little or no conversion volume.
    Fail: no audience row has is_remarketing=true.

- Similar audiences / lookalikes:
    Pass: at least one audience with is_lookalike=true is serving (impressions_period > 0).
    Warn: lookalike audiences exist but are not serving.
    Fail: no audience row has is_lookalike=true. Note in the action that Google sunset similar
      audiences in favour of optimised targeting — recommend Customer Match seed lists feeding
      PMax/Demand Gen rather than recreating legacy similar-audience segments.

- Demographic targeting:
    Read _source="demographics".
    Pass: both "age" and "gender" dimensions are present with more than one bucket carrying
      impressions, AND the share of impressions in the "Undetermined" bucket is not dominant.
    Warn: demographic data is present but "Undetermined" dominates (typical when no demographic
      targeting or exclusions are configured) — recommend reviewing demographic performance and
      applying bid adjustments or exclusions where a bucket clearly underperforms.
    Fail: no demographics rows at all.

- Geo targeting precision:
    Read _source="geo_mode" and _source="geo_perf".
    Pass: location_targeting_mode is predominantly LOCATION_OF_PRESENCE (people physically in
      the targeted area — the precise setting), AND geo_perf shows targeting below country level
      (Region/Province/City) for at least some campaigns.
    Warn: mode is mostly LOCATION_OF_PRESENCE but all targeting is Country-level only, or a
      meaningful minority of campaigns use AREA_OF_INTEREST.
    Fail: location_targeting_mode is predominantly AREA_OF_INTEREST — this serves ads to people
      merely interested in the area and commonly wastes spend for local/e-commerce advertisers.

- Exclusion lists:
    DATA AVAILABILITY NOTE: audience and placement exclusions are NOT exported. Apply the
    no_data_source rule: warn/basic, source="no_data_source", and instruct the user to verify
    under "Audiences > Exclusions" and "Content > Exclusions" in the Google Ads UI.

CONVERSION KPI CATEGORY:
conversion_stats rows (_source="conversion_stats", _summary=true) have: impressions_period,
  clicks_period, cost_period, conversions_period, conversion_value_period,
  view_through_conversions_period, account_roas, account_cpa, campaigns_total,
  campaigns_with_conversions, days_with_data.
conversion_per_campaign rows (_source="conversion_per_campaign") have: campaign_id,
  campaign_advertising_channel_type, cost_period, conversions_period, conversion_value_period, roas.
cross_device rows (_source="cross_device", _xdev_summary=true) have: conversions_period,
  cross_device_conversions_period, cross_device_share (decimal fraction).
value_based_bidding rows (_source="value_based_bidding", _vbb_summary=true) have:
  bidding_strategy_type, campaign_count, campaigns_with_target_roas, avg_target_roas, actual_roas.
DATA AVAILABILITY NOTE: target_roas IS now available (per campaign, per day). target_cpa exists
  as a column but is empty on every row — treat tCPA as unavailable. There is still NO
  conversion-action table: conversion names, categories, primary-vs-secondary flags, attribution
  model, and counting type are all unavailable and must be verified in the Google Ads UI.

- Conversion tracking setup:
    From _source="conversion_stats": compare cost_period against conversions_period, and
    campaigns_with_conversions against campaigns_total.
    Pass: conversions_period > 0 with active cost_period, and campaigns_with_conversions covers
      a clear majority of campaigns_total — tracking is firing broadly.
    Fail: cost_period > 0 but conversions_period = 0 — tracking is broken or absent.
    Warn: conversions are recorded but campaigns_with_conversions covers well under half of
      campaigns_total (partial coverage), or days_with_data is short enough that the absence
      is not yet conclusive — say so explicitly.
    NOTE: tag firing recency and action-level status cannot be verified from daily batches —
    flag for manual validation in Google Ads tag diagnostics.

- Conversion categories:
    DATA AVAILABILITY NOTE: no conversion-action table exists in the current schema, so the mix
    of tracked conversion categories cannot be read. Apply the no_data_source rule: warn/basic,
    source="no_data_source", and instruct: "Verify in Google Ads > Tools > Conversions that
    bottom-of-funnel actions (Purchase/Lead) are tracked and firing, not just soft micro-events."

- Primary vs secondary conversions:
    primary_for_goal is not available. Score as warn, source="no_data_source", and instruct:
    "Verify in Google Ads > Tools > Conversions that only bottom-of-funnel actions (Purchase/Lead)
    are set as Primary Goal — soft events should be Secondary only."

- ROAS / CPA targets:
    From _source="value_based_bidding": compare campaigns_with_target_roas against campaign_count
    for value-based strategies, and avg_target_roas against actual_roas.
    Pass: the large majority of value-based-bidding campaigns have campaigns_with_target_roas set,
      and actual_roas is within roughly ±25% of avg_target_roas — targets exist and are realistic.
    Fail: value-based strategies are in use but campaigns_with_target_roas is 0 or near 0 (bidding
      with no target), or actual_roas is less than half of avg_target_roas (target unreachable and
      likely throttling delivery).
    Warn: targets are set but actual_roas deviates materially from avg_target_roas without meeting
      the fail threshold.
    NOTE: target_cpa is unavailable — if the account relies on Target CPA strategies, say that the
    CPA side of this topic needs manual verification.

- Target stability:
    From _source="value_based_bidding" and _source="conversion_per_campaign": judge whether the
    target level is consistent with delivered performance across campaigns.
    Pass: avg_target_roas is set and per-campaign roas values cluster near it — targets look
      stable and achievable.
    Warn: per-campaign roas varies very widely around avg_target_roas, suggesting targets are
      applied uniformly regardless of campaign economics.
    Fail: no target is set anywhere on value-based strategies, so stability is meaningless.
    NOTE: target *revision history* is not in the export — recommend confirming revision frequency
    in Google Ads change history, and say that this assessment reflects target-vs-actual spread
    only, not how often targets were edited.

- Attribution model:
    attribution_model is not available. Score as warn, source="no_data_source", and instruct:
    "Verify in Google Ads > Tools > Conversions that primary conversion actions use Data-Driven
    attribution. Last-Click under-credits upper-funnel activity and distorts smart bidding."

- Cross-device conversions:
    From _source="cross_device": read cross_device_conversions_period and cross_device_share.
    Pass: cross_device_conversions_period > 0 — cross-device paths are tracked and contributing.
    Fail: the source is empty or cross_device_conversions_period = 0 — the account is blind to
      users who switch devices between click and conversion.
    Warn: cross-device conversions are present but cross_device_share is very low (possible
      under-attribution).

FEEDS & CATALOGUE CATEGORY:
shopping_summary rows (_source="shopping_summary", _summary=true) have: products_served,
  shopping_campaigns, impressions_period, clicks_period, cost_period, conversions_period,
  conversion_value_period, shopping_roas, products_with_conversions, products_zero_clicks.
shopping_product rows (_source="shopping_product") have: product_title, impressions_period,
  cost_period, conversions_period, conversion_value_period — the top products by spend.
listing_group_summary rows (_source="listing_group_summary", _listing_group_summary=true) have:
  listing_group_filter_type ("Included" / "Subdivision" / "Excluded"), listing_source,
  filter_count, asset_group_count. This is the PMax product-partition structure.
feed_attributes_stale rows (_source="feed_attributes_stale", _feed_attrs_stale_snapshot=true)
  have: offers, offers_with_title, offers_with_product_type_1, offers_with_product_type_3,
  offers_with_custom_label, merchant_accounts, snapshot_date.
  IMPORTANT: this row comes from a FROZEN legacy table that stopped updating on 2026-08-17 —
  product taxonomy changes slowly so it stays directionally useful, but say in any explanation
  that relies on it that the figure is a stale snapshot dated snapshot_date.
DATA AVAILABILITY NOTE: Shopping conversions and conversion value ARE now available (previously
  a hard gap), as is the PMax listing-group partition structure. Merchant Center diagnostics
  (approval rates, disapproval counts) remain unavailable.

- Product feed completeness:
    From _source="shopping_summary": products_served and impressions_period show whether the feed
    is live. From _source="feed_attributes_stale": compare offers_with_title and
    offers_with_product_type_1 against offers.
    Pass: products_served > 0 with impressions_period > 0, AND offers_with_title covers nearly all
      offers — feed is active and titled.
    Fail: products_served = 0 or impressions_period = 0 (no active feed or no Shopping delivery).
    Warn: the feed is live but offers_with_product_type_1 covers well under half of offers —
      incomplete categorisation.
    NOTE: Merchant Center approval rate cannot be verified from BQ — flag for manual review.

- Product title optimisation:
    From _source="shopping_product": read product_title values directly.
    Pass: the majority of sampled titles are descriptive (more than a bare SKU/code) and carry
      recognisable product and attribute tokens.
    Fail: most titles are blank, purely numeric/SKU-like, or placeholder strings.
    Warn: titles are present but inconsistent — some descriptive, some generic.
    Always add: "Full title-length and keyword-placement review (target 70+ characters, key
    attributes near the front) still requires manual confirmation in Merchant Center."

- Feed segmentation:
    From _source="feed_attributes_stale": read offers_with_custom_label against offers, and
    offers_with_product_type_3 as a depth signal.
    Pass: offers_with_custom_label covers a meaningful share of offers — inventory is segmented
      by strategic business value.
    Fail: offers_with_custom_label is zero — custom labels entirely blank, preventing product
      cluster separation.
    Warn: labels are used on only a small minority of offers.
    Flag that this reads from the stale snapshot dated snapshot_date.

- Shopping campaign structure:
    From _source="listing_group_summary": read filter_count and asset_group_count by
    listing_group_filter_type.
    Pass: "Subdivision" rows exist with a meaningful filter_count — the catalogue is partitioned
      rather than left in one catch-all group — AND "Excluded" filters exist, showing deliberate
      exclusion of unprofitable inventory.
    Fail: only a single "Included" row with no "Subdivision" rows — the whole catalogue sits in
      one undifferentiated partition.
    Warn: subdivisions exist but no exclusions are configured, or partitioning is very shallow
      relative to the number of asset groups.

- Dynamic remarketing feed:
    This is a tag-implementation check (does the remarketing tag pass item ids matching the feed?)
    and is NOT visible in the BigQuery export.
    Score as warn, source="no_data_source", and instruct: "Verify in Google Tag diagnostics that
    the ecomm_prodid or dynx_itemid parameter matches the feed's item_id column exactly. A
    mismatch prevents product-level remarketing from serving."
    If shopping_summary shows active clicks, note that Shopping is delivering but tag alignment
    still requires manual verification.

- Conversational attributes:
    Conversational feed attributes ([question_and_answer], [document_link], [related_product],
    [item_group_title], [variant_option], [popularity_rank]) are NOT available in the Google Ads
    BQ export — Merchant Center does not surface these fields in the standard data transfer.
    Score as warn, source="no_data_source", and instruct:
    "Verify in Merchant Center > Products > Attributes that conversational attributes are
    populated for at least 80% of your approved product catalogue to enable AI-driven
    conversational search ad formats."
    If hasProductFeed=false: mark as not applicable.

CREATIVE CONTENT CATEGORY:
rsa_summary rows (_source="rsa_summary", _rsa_summary=true) have: rsa_count,
  avg_headlines_per_rsa, avg_descriptions_per_rsa, rsas_with_12_plus_headlines,
  rsas_with_4_plus_descriptions, rsas_under_8_headlines.
  RSA creative text landed in the 2026-08-20 rebuild: the full 15 headline / 5 description slots
  are now exported, so the FULL thresholds apply again (12+ headlines, 4+ descriptions).
rsa_sample rows (_source="rsa_sample") have: ad_id, headline_1, headline_2, headline_3,
  description_1, description_2, final_url — real ad copy, usable for qualitative judgement.
ad_mix rows (_source="ad_mix", _ad_mix_summary=true) have: ad_type, ad_status, ad_count,
  ad_group_count, ads_per_ad_group.
ad_strength_partial rows (_source="ad_strength_partial", _ad_strength_summary=true) have:
  ad_type, ad_strength, ad_count.
  CRITICAL: this source covers Demand Gen and Video ads ONLY. The ad-strength column is not
  populated for responsive search ads at all, so it can never be used to judge SEARCH creative.
asset_variety rows (_source="asset_variety", _asset_variety_summary=true) have:
  asset_field_type (e.g. "Headline", "Long headline", "Description", "Marketing image",
  "Square marketing image", "Portrait marketing image", "YouTube video", "Logo"),
  asset_count, asset_group_count, assets_per_asset_group. These are PMax asset counts.
  NOTE: PMax asset TEXT is not available — only counts by field type.

- Responsive search ad coverage:
    From _source="ad_mix": find the "Responsive search ad" row and read ad_count,
    ad_group_count and ads_per_ad_group.
    Pass: ads_per_ad_group >= 1.5 for RSAs — ad groups generally carry more than a single RSA,
      leaving room for rotation and testing.
    Warn: ads_per_ad_group is between 1.0 and 1.5 (minimum coverage, little redundancy).
    Fail: no "Responsive search ad" row exists, or ads_per_ad_group < 1.0 — some ad groups run
      without an RSA and rely on legacy formats.

- Asset group ad strength:
    From _source="asset_variety" and, for PMax asset groups, the asset_group_strength source in
    the AI readiness category. If asset-group ad strength figures are present, score them:
    Pass: the majority of asset groups rate Good or Excellent.
    Fail: the majority rate Poor.
    Warn: mostly Average, or the ratings are mixed.
    NOTE: search-ad strength is NOT available (ad_strength_partial covers Demand Gen / Video
    only). Whatever the asset-group verdict, add: "RSA ad strength is not present in the
    BigQuery export — verify search ad strength ratings directly in the Google Ads UI."

- Headline / description variety:
    From _source="rsa_summary": read avg_headlines_per_rsa, avg_descriptions_per_rsa,
    rsas_with_12_plus_headlines, rsas_under_8_headlines, rsa_count.
    Pass: rsas_with_12_plus_headlines / rsa_count >= 0.6 AND avg_descriptions_per_rsa >= 3.5 —
      most RSAs fill the great majority of the 15 headline and 5 description slots.
    Fail: rsas_under_8_headlines / rsa_count > 0.3 OR avg_headlines_per_rsa < 8 — significant
      slot underutilisation.
    Warn: avg_headlines_per_rsa between 8 and 11 (solid but not maximised).
    Cross-check against _source="rsa_sample": if the sampled headlines are near-duplicates of
    each other, note that slot COUNT alone overstates real variety.

- Image & video assets:
    From _source="asset_variety": read asset_count and assets_per_asset_group for the image and
    video field types ("Marketing image", "Square marketing image", "Portrait marketing image",
    "YouTube video", "Logo", "Landscape logo").
    Also from _source="ad_mix": check for rich-media ad types (Demand Gen, video, display).
    Pass: both image AND video field types are present with healthy assets_per_asset_group
      (roughly >= 2 images per asset group and at least one YouTube video).
    Fail: no video assets at all, or images present in only a small minority of asset groups —
      Google will auto-generate low-quality slideshows to fill the gap.
    Warn: only one rich-media family is well covered (e.g. images but thin video, or vice versa),
      or portrait/square variants are missing so some placements cannot serve.

- Ad policy compliance:
    From _source="ad_mix": read ad_status across rows.
    Pass: no ad_status indicating disapproval appears among ads that are otherwise enabled.
    Fail: a disapproved status appears with meaningful ad_count.
    Warn: statuses indicating "under review" or similar pending states are present.
    NOTE: a dedicated policy/approval column is not reliably populated in the current export —
    if ad_status carries only enabled/paused/removed values, say that policy status could not be
    confirmed from BigQuery and direct the check to Google Ads > Ads & assets > Policy manager.

- Ad copy relevance:
    From _source="rsa_sample": read headline_1..3 and description_1..2 as real text, alongside
    final_url.
    Pass: the sampled copy is specific — headlines name the product/category, carry a clear value
      proposition or offer, and plausibly match the landing page implied by final_url.
    Fail: the copy is generic or templated across unrelated ads (e.g. brand name repeated in every
      slot with no product or benefit language).
    Warn: copy is partly specific but repetitive across the sample, or leans on one theme only.
    Always flag: "Headline-to-keyword relevance requires manual review — verify that the top
    keyword intent of each ad group appears in the first 3 headline slots of its RSA."

KEYWORD STRATEGY CATEGORY:
keyword rows (_source="keyword") are the top keywords by spend, one row each: keyword,
  match_type, keyword_status, quality_score, creative_quality_score, landing_page_quality_score,
  first_page_cpc, top_of_page_cpc, impressions_period, clicks_period, cost_period,
  conversions_period, conversion_value_period.
keyword_match_mix rows (_source="keyword_match_mix", _summary=true) have: match_type,
  keyword_status, keyword_count — a complete account-level aggregation.
keyword_quality_score row (_source="keyword_quality_score", _qs_summary=true) has:
  keywords_scored, qs_7_plus, qs_4_to_6, qs_1_to_3, avg_quality_score.
search_term_summary rows (_source="search_term_summary", _search_term_summary=true) have:
  match_source ("Keyword" or "AI Max broad match"), search_terms, impressions_period,
  clicks_period, cost_period, conversions_period, zero_conv_paid_terms.
adgroup_structure rows (_source="adgroup_structure", _adgroup_summary=true) have:
  ad_group_type ("Standard", "Search Dynamic Ads", "Shopping - Product", "Display", video types),
  ad_group_status, ad_group_count.
DATA AVAILABILITY NOTE: ad_group_type IS now available (so DSA detection is a real check again),
  as are paused/removed keywords (status hygiene is now meaningful). Still unavailable: any
  negative-keyword or shared-negative-list signal, and keyword system serving status
  (BELOW_FIRST_PAGE_BID / LOW_SEARCH_VOLUME / RARELY_SERVED).

- Keyword match type distribution:
    From _source="keyword_match_mix": read keyword_count by match_type across enabled keywords.
    Pass: all three of Exact, Phrase and Broad are present, with no single type overwhelmingly
      dominant — the account balances control and reach.
    Fail: only one match type exists across the account.
    Warn: Broad is absent entirely (missing reach under smart bidding), or Broad dominates while
      the campaigns carrying it are not on smart bidding (check campaign_setup bidding data).
    Cross-check _source="keyword": if Broad keywords carry high cost_period with near-zero
    conversions_period, call that out regardless of the distribution verdict.

- Negative keyword coverage:
    DATA AVAILABILITY NOTE: no negative-keyword signal of any kind exists in the current schema —
    no is_negative flag, no campaign-level negative criteria, no shared negative list table.
    Score as warn, source="no_data_source", and instruct: "Verify negative keyword coverage
    (ad group, campaign, and shared lists) directly in the Google Ads UI."
    You MAY strengthen the recommendation using _source="search_term_summary": if
    zero_conv_paid_terms is large relative to search_terms, note that a substantial number of
    search terms took spend without converting, which is where negatives should be focused.

- Keyword quality scores:
    From _source="keyword_quality_score": compute the share qs_7_plus / keywords_scored and read
    avg_quality_score.
    Pass: avg_quality_score >= 7.0, or qs_7_plus is a clear majority of keywords_scored.
    Warn: avg_quality_score between 5.5 and 6.9.
    Fail: avg_quality_score < 5.5, or qs_1_to_3 is a substantial share of keywords_scored.
    If keywords_scored is 0 or avg_quality_score is null: score warn and note that quality score
    is only populated for keywords that served in the window.
    Use _source="keyword" creative_quality_score and landing_page_quality_score to say WHICH
    component is dragging the score (ad relevance vs. landing page experience) in the explanation.

- Keyword status hygiene:
    From _source="keyword_match_mix": compare keyword_count by keyword_status.
    Paused and removed keywords ARE now exported, so this is a real signal.
    Pass: enabled keywords clearly outnumber paused + removed, and the paused share looks like
      deliberate pruning rather than neglect.
    Warn: paused + removed is roughly comparable to enabled — a large dormant tail that should
      be cleaned up or re-tested.
    Fail: paused + removed dominates enabled outright.
    Always add: "Delivery-limiting statuses (BELOW_FIRST_PAGE_BID, LOW_SEARCH_VOLUME,
    RARELY_SERVED) are still not exported — verify those in the Google Ads UI."

- Ad group keyword structure:
    From _source="adgroup_structure": read ad_group_count by ad_group_type and ad_group_status,
    and cross-reference the keyword totals in _source="keyword_match_mix".
    Pass: enabled ad groups are numerous relative to total keywords, implying tight thematic
      grouping (roughly 15 or fewer keywords per enabled ad group on average).
    Fail: the implied average exceeds roughly 30 keywords per enabled ad group — bloated groups
      that fracture ad copy relevance.
    Warn: the implied average sits between 15 and 30.
    State plainly that this is an account-level average, not a per-ad-group distribution.

- DSA / dynamic ad groups:
    From _source="adgroup_structure": look for ad_group_type = "Search Dynamic Ads".
    Pass: "Search Dynamic Ads" ad groups exist and are enabled — automated long-tail coverage is
      active alongside standard ad groups.
    Warn: no DSA ad groups exist but PMax campaigns do (from the ai_readiness data) — long-tail
      expansion is handled by PMax instead; recommend testing DSA for search-specific coverage.
    Fail: neither DSA ad groups nor PMax campaigns exist — no automated expansion mechanism at all.

AI READINESS CATEGORY:
channel_balance rows (_source="channel_balance", _channel_balance_summary=true) have:
  campaign_advertising_channel_type, campaign_count, cost_period, conversions_period,
  conversion_value_period, roas.
asset_group rows (_source="asset_group") have: asset_group_id, asset_group_name,
  asset_group_status, impressions_period, clicks_period, cost_period, conversions_period,
  conversion_value_period — now properly dated, so these are true windowed figures.
asset_group_strength rows (_source="asset_group_strength", _ag_strength_summary=true) have:
  asset_group_ad_strength ("Excellent" / "Good" / "Average" / "Poor"), asset_group_status,
  asset_group_count.
ai_max_summary rows (_source="ai_max_summary", _ai_max_summary=true) have: match_source
  ("Keyword" or "AI Max broad match"), search_terms, campaign_count, impressions_period,
  cost_period, conversions_period.
Asset counts by field type are available in the creative_content category under
  _source="asset_variety" — reference them when judging asset supply for PMax.
DATA AVAILABILITY NOTE: asset-group ad strength, asset-group performance, PMax listing-group
  structure and AI Max delivery are all available now. Still unavailable: PMax audience signals,
  brand exclusion lists, and the on/off state of generative features (ACA, Text Customization,
  Final URL Expansion).

- PMax campaign adoption:
    From _source="channel_balance": read campaign_count and cost_period for
    campaign_advertising_channel_type = "Performance Max".
    Pass: PMax campaigns exist and carry a meaningful share of cost_period.
    Fail: no PMax campaigns at all.
    Warn: PMax exists but with negligible spend share.
    Apply brand context: if hasProductFeed=false, retail PMax absence is less severe; for a B2B
    lead-gen account, score absence as warn rather than fail.

- Asset group strength:
    From _source="asset_group_strength": read asset_group_count by asset_group_ad_strength.
    Pass: the majority of enabled asset groups rate Good or Excellent.
    Fail: the majority rate Poor — asset supply is too thin for the algorithm to optimise.
    Warn: mostly Average, or ratings are split.
    Cross-reference _source="asset_variety" in creative_content to say WHICH asset family is
    short (e.g. missing portrait images, no video) rather than only reporting the rating.

- Audience signal quality:
    DATA AVAILABILITY NOTE: asset-group audience signals are not exported. Score as warn,
    source="no_data_source", and instruct: "Verify audience signal coverage in Google Ads >
    Performance Max > Asset groups > Audience signals."
    You MAY inform the recommendation using the audience_targeting category: if that account has
    rich remarketing and lookalike lists available, note that those lists exist and should be
    attached as PMax audience signals.
    If hasCrmData=false: note the gap but do not additionally penalise absent customer match.

- Smart bidding configuration:
    From the conversion_kpi category's _source="value_based_bidding": read campaigns_with_target_roas,
    avg_target_roas and actual_roas; and from _source="channel_balance" read PMax roas.
    Pass: PMax and other value-based campaigns run smart bidding WITH target_roas set, and
      actual performance is in a plausible range of the target.
    Fail: value-based strategies run with no target_roas set anywhere.
    Warn: targets are set on only some campaigns, or actual_roas diverges sharply from target.
    NOTE: target_cpa is empty across the whole export — if the account leans on Target CPA, say
    that portion needs manual verification.

- PMax vs. standard campaign balance:
    From _source="channel_balance": compare cost_period, conversions_period and roas across
    "Performance Max" vs "Search" vs "Shopping".
    Pass: spend is meaningfully split across PMax and standard campaign types, and PMax roas is
      broadly comparable to or better than the standard types.
    Fail: PMax absorbs nearly all spend with no standard Search presence — the account has no
      controllable, query-transparent layer, and brand traffic is likely being absorbed by PMax.
    Warn: the split is heavily skewed one way, or PMax roas materially trails Search/Shopping.
    NOTE: brand exclusion lists are not exported — always add: "Verify Brand Exclusions on PMax
    campaigns in the Google Ads UI to confirm PMax is not cannibalising branded Search."

- AI Max:
    From _source="ai_max_summary": look for match_source = "AI Max broad match".
    Pass: AI Max broad match rows exist with impressions_period > 0 and conversions_period > 0 —
      the feature is enabled and delivering.
    Warn: AI Max rows exist but with negligible volume, or with spend and no conversions.
    Fail: no "AI Max broad match" row exists — the feature is not enabled on any campaign.
    Always add: "Brand guardrails for AI Max (Brand Inclusions / Brand Exclusions) are not
    exported — verify them in Google Ads > Campaigns > Settings."

- Native AI-driven generative tools in AI Max:
    The on/off state of Text Customization and Final URL Expansion is NOT exported.
    Score as warn, source="no_data_source", and instruct: "Verify in Google Ads > AI Max settings
    whether Text Customization is enabled. If so, confirm that text guidelines (prohibited topics,
    brand tone) and URL exclusions are configured — without these guardrails, AI-generated copy
    may violate brand standards."
    Use the _source="ai_max_summary" volume to say whether this is urgent (large AI Max delivery
    means unguarded generation is a live risk) or lower priority.

- Native AI-driven generative tools in PMax:
    Automatically Created Assets and Final URL Expansion settings are NOT exported.
    Score as warn, source="no_data_source", and instruct: "Verify in Google Ads > Performance Max
    > Settings whether Automatically Created Assets and Final URL Expansion are enabled."
    Inform the urgency from _source="asset_variety" in creative_content: if assets_per_asset_group
    is low for headlines/descriptions/images, note that a thin creative library makes enabling
    ACA more valuable; if the library is already rich, note that ACA is optional and manual
    control may be preferable.

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
    """Map Gemini's topic names back to the canonical list and fill any gaps.

    Both topic AND category are forced back to the canonical values — Gemini
    sometimes echoes a prettified category ("CONVERSION KPI" for "conversion_kpi"),
    which silently splits the results when they are later grouped by category.
    """
    canonical_lower = {t.lower(): t for t in canonical}
    mapped: dict[str, SpecialistResult] = {}

    for r in results:
        matches = difflib.get_close_matches(r.topic.lower(), canonical_lower.keys(), n=1, cutoff=0.4)
        if matches:
            canon = canonical_lower[matches[0]]
            if canon not in mapped:
                mapped[canon] = SpecialistResult(
                    **{**r.model_dump(), "topic": canon, "category": category}
                )

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
    # Topics with no data source at all in the current schema. Naming them here
    # keeps the stub decision in one place (data_extraction.DATA_GAPS) instead of
    # relying on the model to infer it from the criteria text alone.
    gaps = DATA_GAPS.get(category, [])
    gap_block = ""
    if gaps:
        gap_lines = "\n".join(f"  - {t}" for t in gaps)
        gap_block = (
            "TOPICS WITH NO DATA SOURCE (score these as warn / basic / no_data_source, "
            "with a manual-verification action):\n"
            f"{gap_lines}\n\n"
        )

    user_prompt = (
        f"Category: {category}\n\n"
        f"Topics to evaluate:\n{topic_list}\n\n"
        f"{gap_block}"
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
