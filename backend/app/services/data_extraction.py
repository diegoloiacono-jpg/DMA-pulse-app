"""
Extract structured audit data from BigQuery Google Ads tables.

Schema notes (dataset `google_ads`, rebuilt 2026-08-20):
- The client's cloud team mirrored the native Google Ads BigQuery Data Transfer
  schema into this dataset. Two families of tables:
    * GOOGLEADS_P_*        — dated fact tables (DATE + PROFILE_ID + metrics).
    * GOOGLEADS_*METADATA  — undated entity snapshots (structure/config only).
- PROFILE_ID is the *account* id (Supermetrics' rename of ACCOUNT_ID). It is the
  only account key, and it exists ONLY on the P_* fact tables — every METADATA
  table lacks it. Metadata is therefore scoped to an account by joining through
  the account's campaign ids (see _account_campaigns_cte).
- Metric columns on the new tables are plain COST / CONVERSIONS / CONVERSION_VALUE
  (the old flat tables used COST_EUR).
- The original flat GOOGLEADS_* tables (GOOGLEADS_CAMPAIGN, GOOGLEADS_AD, ...) are
  FROZEN at 2026-08-17 and deprecated. The one exception is GOOGLEADS_SHOPPING,
  still read for feed attributes — see _feeds_catalogue.

Known remaining gaps (see DATA_GAPS below; keep it in sync with reality):
- AD_STRENGTH exists in GOOGLEADS_ADMETADATA but that table only contains Demand
  Gen / Video ads — 0 of 2,405 RSAs — so search ad strength is unavailable.
- PMax asset *text* is unavailable: GOOGLEADS_ASSETGROUPASSET links assets with
  field types (so counts/variety work), but GOOGLEADS_ASSETMETADATA holds only
  sitelinks/callouts/promotions and shares no ids with it.
- No negative keyword or shared-set signal anywhere in the new schema.
- No conversion-action configuration (primary-for-goal, attribution model,
  counting type).
- TARGET_CPA exists as a column but is empty on every row; TARGET_ROAS is real.

Sampling strategy: high-volume tables are aggregated in SQL before being sent to
Gemini, never sampled row-by-row.
"""
from __future__ import annotations

import logging

import pandas as pd

from app.services.bigquery import account_param, cutoff_date_param, run_query, table

logger = logging.getLogger(__name__)


# Topics that still have no BigQuery signal after the 2026-08-20 schema rebuild.
# specialist.py injects these into the per-category prompt so Gemini marks them
# as manual-verification stubs instead of inventing a score.
DATA_GAPS: dict[str, list[str]] = {
    "audience_targeting": [
        "Exclusion lists",
    ],
    "keyword_strategy": [
        "Negative keyword coverage",
    ],
    "conversion_kpi": [
        "Conversion categories",
        "Primary vs secondary conversions",
        "Attribution model",
    ],
    "feeds_catalogue": [
        "Dynamic remarketing feed",
        "Conversational attributes",
    ],
    "ai_readiness": [
        "Audience signal quality",
        "Native AI-driven generative tools in AI Max",
        "Native AI-driven generative tools in PMax",
    ],
}


def _enum_eq(column: str, value: str) -> str:
    """Case/spacing-insensitive equality for human-readable enum columns.

    The export emits inconsistently-cased strings ("enabled", "Enabled",
    "Performance Max", "Maximize Conversion Value") rather than GAQL
    SCREAMING_SNAKE_CASE. Normalise both sides before comparing. `value` must
    already be a normalised literal (uppercase, spaces as underscores) and must
    never come from user input.
    """
    return f"UPPER(REPLACE({column}, ' ', '_')) = '{value}'"


def _account_campaigns_cte(dataset: str | None = None) -> str:
    """CTE yielding the campaign ids belonging to @account_id in the window.

    METADATA tables carry no PROFILE_ID, so this is the only way to scope them
    to one account. CAMPAIGN_ID is globally unique in Google Ads, so joining on
    it alone is safe.
    """
    t_stats = table("GOOGLEADS_P_CAMPAIGNBASICSTATS", dataset)
    return f"""
    acct_campaigns AS (
        SELECT DISTINCT CAMPAIGN_ID
        FROM {t_stats}
        WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    )
    """


def _tagged(df: pd.DataFrame, source: str) -> pd.DataFrame:
    """Tag a frame with its _source label (no-op on empty frames)."""
    if df.empty:
        return df
    df = df.copy()
    df["_source"] = source
    return df


def _safe(label: str, sql: str, params: list, source: str) -> pd.DataFrame:
    """Run one query, tag it, and degrade to an empty frame on failure.

    A single broken sub-query must never take down a whole category — the
    remaining sources still give the specialist something to score.
    """
    try:
        df = run_query(sql, params)
        logger.warning("%s: %d rows", label, len(df))
        return _tagged(df, source)
    except Exception as exc:
        logger.warning("%s FAILED — %s", label, exc)
        return pd.DataFrame()


def _combine(*frames: pd.DataFrame) -> pd.DataFrame:
    non_empty = [f for f in frames if not f.empty]
    if not non_empty:
        return pd.DataFrame()
    return pd.concat(non_empty, ignore_index=True)


# --------------------------------------------------------------------------- #
# campaign_setup
# --------------------------------------------------------------------------- #
def _campaign_setup(account_id: str, dataset: str | None = None, lookback_days: int = 30) -> pd.DataFrame:
    t_stats = table("GOOGLEADS_P_CAMPAIGNBASICSTATS", dataset)
    t_meta = table("GOOGLEADS_CAMPAIGNMETADATA", dataset)
    t_budget = table("GOOGLEADS_P_CAMPAIGNBUDGET", dataset)
    t_bid = table("GOOGLEADS_P_BIDDINGSTRATEGY", dataset)
    t_is = table("GOOGLEADS_P_CAMPAIGNIMPRESSIONSHARE", dataset)

    recent_days = min(7, lookback_days)
    params = [account_param(account_id), cutoff_date_param(lookback_days)]
    recent_params = params + [cutoff_date_param(recent_days, name="recent_cutoff_date")]
    cte = _account_campaigns_cte(dataset)

    # Entity snapshot: one row per campaign, structure + config + latest budget/bid.
    campaign_sql = f"""
    WITH {cte},
    budget AS (
        SELECT CAMPAIGN_ID, DAILYBUDGET, BUDGET_PERIOD, BUDGET_STATUS, IS_BUDGET_EXPLICITLY_SHARED
        FROM {t_budget}
        WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
        QUALIFY ROW_NUMBER() OVER (PARTITION BY CAMPAIGN_ID ORDER BY DATE DESC) = 1
    ),
    bid AS (
        SELECT CAMPAIGN_ID, BIDDING_STRATEGY_TYPE, CAMPAIGN_BID_STRATEGY_STATUS, TARGET_ROAS
        FROM {t_bid}
        WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
        QUALIFY ROW_NUMBER() OVER (PARTITION BY CAMPAIGN_ID ORDER BY DATE DESC) = 1
    )
    SELECT
        m.CAMPAIGN_ID                       AS campaign_id,
        ANY_VALUE(m.CAMPAIGN_NAME)          AS campaign_name,
        ANY_VALUE(m.CAMPAIGN_STATUS)        AS status,
        ANY_VALUE(m.CAMPAIGN_SERVING_STATUS) AS serving_status,
        ANY_VALUE(m.ADVERTISING_CHANNEL_TYPE) AS campaign_advertising_channel_type,
        ANY_VALUE(m.START_DATE)             AS start_date,
        ANY_VALUE(m.END_DATE)               AS end_date,
        ANY_VALUE(b.DAILYBUDGET)            AS daily_budget,
        ANY_VALUE(b.BUDGET_PERIOD)          AS budget_period,
        ANY_VALUE(b.IS_BUDGET_EXPLICITLY_SHARED) AS budget_is_shared,
        ANY_VALUE(bd.BIDDING_STRATEGY_TYPE) AS campaign_bidding_strategy_type,
        ANY_VALUE(bd.CAMPAIGN_BID_STRATEGY_STATUS) AS bid_strategy_status,
        ANY_VALUE(bd.TARGET_ROAS)           AS target_roas,
        COUNT(DISTINCT m.DAY_OF_WEEK_WITH_NUM) AS ad_schedule_days
    FROM {t_meta} m
    JOIN acct_campaigns USING (CAMPAIGN_ID)
    LEFT JOIN budget b  ON b.CAMPAIGN_ID = m.CAMPAIGN_ID
    LEFT JOIN bid bd    ON bd.CAMPAIGN_ID = m.CAMPAIGN_ID
    GROUP BY campaign_id
    LIMIT 60
    """

    perf_sql = f"""
    SELECT
        CAMPAIGN_ID                                                           AS campaign_id,
        SUM(IMPRESSIONS)                                                      AS impressions_period,
        SUM(CASE WHEN DATE >= @recent_cutoff_date THEN IMPRESSIONS ELSE 0 END) AS impressions_recent,
        SUM(CONVERSIONS)                                                      AS conversions_period,
        SUM(CONVERSION_VALUE)                                                 AS conversion_value_period,
        SUM(COST)                                                             AS cost_period
    FROM {t_stats}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY campaign_id
    """

    type_summary_sql = f"""
    SELECT
        ADVERTISING_CHANNEL_TYPE    AS campaign_advertising_channel_type,
        COUNT(DISTINCT CAMPAIGN_ID) AS campaign_count,
        SUM(COST)                   AS cost_period,
        TRUE                        AS _summary
    FROM {t_stats}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY 1
    ORDER BY campaign_count DESC
    """

    # Impression share lost to budget vs. rank — drives budget-allocation scoring.
    impr_share_sql = f"""
    SELECT
        CAMPAIGN_ID                                              AS campaign_id,
        ROUND(AVG(NULLIF(SEARCH_IMPRESSION_SHARE, 0)), 4)        AS avg_search_impression_share,
        ROUND(AVG(NULLIF(SEARCH_BUDGET_LOST_TOP_IMPRESSION_SHARE, 0)), 4) AS avg_budget_lost_is,
        ROUND(AVG(NULLIF(SEARCH_RANK_LOST_TOP_IMPRESSION_SHARE, 0)), 4)   AS avg_rank_lost_is,
        ROUND(AVG(NULLIF(SEARCH_ABSOLUTE_TOP_IMPRESSION_SHARE, 0)), 4)    AS avg_abs_top_is
    FROM {t_is}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY campaign_id
    """

    # Dayparting: distinct scheduled days per campaign, aggregated to account level.
    schedule_sql = f"""
    WITH {cte}
    SELECT
        COUNT(DISTINCT m.CAMPAIGN_ID) AS campaigns_with_schedule,
        COUNT(DISTINCT IF(m.DAY_OF_WEEK_WITH_NUM IS NOT NULL, m.CAMPAIGN_ID, NULL)) AS campaigns_with_day_rows,
        COUNT(DISTINCT m.DAY_OF_WEEK_WITH_NUM) AS distinct_days_scheduled,
        TRUE AS _schedule_summary
    FROM {t_meta} m
    JOIN acct_campaigns USING (CAMPAIGN_ID)
    """

    return _combine(
        _safe("campaign_setup/campaign", campaign_sql, params, "campaign"),
        _safe("campaign_setup/perf", perf_sql, recent_params, "campaign_perf"),
        _safe("campaign_setup/type_summary", type_summary_sql, params, "campaign_type_summary"),
        _safe("campaign_setup/impression_share", impr_share_sql, params, "campaign_impression_share"),
        _safe("campaign_setup/schedule", schedule_sql, params, "campaign_schedule"),
    )


# --------------------------------------------------------------------------- #
# keyword_strategy
# --------------------------------------------------------------------------- #
def _keyword_strategy(account_id: str, dataset: str | None = None, lookback_days: int = 30) -> pd.DataFrame:
    t_kw_meta = table("GOOGLEADS_KEYWORDMETADATA", dataset)
    t_kw_stats = table("GOOGLEADS_P_KEYWORDBASICSTATS", dataset)
    t_sq = table("GOOGLEADS_P_SEARCHQUERYSTATS", dataset)
    t_ag_meta = table("GOOGLEADS_ADGROUPMETADATA", dataset)

    params = [account_param(account_id), cutoff_date_param(lookback_days)]
    cte = _account_campaigns_cte(dataset)

    # Top keywords by spend, with quality score and match type from metadata.
    keyword_sql = f"""
    WITH stats AS (
        SELECT
            KEYWORD_ID,
            ANY_VALUE(KEYWORD)   AS keyword,
            SUM(IMPRESSIONS)     AS impressions_period,
            SUM(CLICKS)          AS clicks_period,
            SUM(COST)            AS cost_period,
            SUM(CONVERSIONS)     AS conversions_period,
            SUM(CONVERSION_VALUE) AS conversion_value_period
        FROM {t_kw_stats}
        WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
        GROUP BY KEYWORD_ID
    ),
    meta AS (
        SELECT
            KEYWORD_ID,
            ANY_VALUE(MATCH_TYPE)             AS match_type,
            ANY_VALUE(KEYWORD_STATUS)         AS keyword_status,
            ANY_VALUE(QUALITY_SCORE)          AS quality_score,
            ANY_VALUE(CREATIVE_QUALITY_SCORE) AS creative_quality_score,
            ANY_VALUE(POST_CLICK_QUALITY_SCORE) AS landing_page_quality_score,
            ANY_VALUE(FIRST_PAGE_CPC)         AS first_page_cpc,
            ANY_VALUE(TOP_OF_PAGE_CPC)        AS top_of_page_cpc
        FROM {t_kw_meta}
        GROUP BY KEYWORD_ID
    )
    SELECT
        s.keyword, m.match_type, m.keyword_status, m.quality_score,
        m.creative_quality_score, m.landing_page_quality_score,
        m.first_page_cpc, m.top_of_page_cpc,
        s.impressions_period, s.clicks_period, s.cost_period,
        s.conversions_period, s.conversion_value_period
    FROM stats s
    LEFT JOIN meta m USING (KEYWORD_ID)
    ORDER BY s.cost_period DESC
    LIMIT 60
    """

    # Match type mix + status hygiene across the whole account. Deliberately spans
    # ALL keywords in the account's campaigns, not just those that served — the
    # paused/removed tail is exactly what status hygiene is scoring.
    match_mix_sql = f"""
    WITH {cte}
    SELECT
        m.MATCH_TYPE     AS match_type,
        m.KEYWORD_STATUS AS keyword_status,
        COUNT(DISTINCT m.KEYWORD_ID) AS keyword_count,
        TRUE AS _summary
    FROM {t_kw_meta} m
    JOIN acct_campaigns USING (CAMPAIGN_ID)
    GROUP BY 1, 2
    ORDER BY keyword_count DESC
    """

    # Quality score distribution — only over keywords that actually served.
    qs_sql = f"""
    WITH kw AS (
        SELECT DISTINCT KEYWORD_ID FROM {t_kw_stats}
        WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    )
    SELECT
        COUNT(DISTINCT m.KEYWORD_ID)                                      AS keywords_scored,
        COUNT(DISTINCT IF(m.QUALITY_SCORE >= 7, m.KEYWORD_ID, NULL))      AS qs_7_plus,
        COUNT(DISTINCT IF(m.QUALITY_SCORE BETWEEN 4 AND 6, m.KEYWORD_ID, NULL)) AS qs_4_to_6,
        COUNT(DISTINCT IF(m.QUALITY_SCORE BETWEEN 1 AND 3, m.KEYWORD_ID, NULL)) AS qs_1_to_3,
        ROUND(AVG(NULLIF(m.QUALITY_SCORE, 0)), 2)                         AS avg_quality_score,
        TRUE AS _qs_summary
    FROM {t_kw_meta} m
    JOIN kw USING (KEYWORD_ID)
    """

    # Search terms: volume, spend concentration, and AI Max broad-match share.
    search_term_sql = f"""
    SELECT
        SEARCH_TERM_MATCH_SOURCE   AS match_source,
        COUNT(DISTINCT SEARCH_TERM) AS search_terms,
        SUM(IMPRESSIONS)            AS impressions_period,
        SUM(CLICKS)                 AS clicks_period,
        SUM(COST)                   AS cost_period,
        SUM(CONVERSIONS)            AS conversions_period,
        COUNT(DISTINCT IF(CONVERSIONS = 0 AND COST > 0, SEARCH_TERM, NULL)) AS zero_conv_paid_terms,
        TRUE AS _search_term_summary
    FROM {t_sq}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY 1
    """

    # Ad group types — DSA / dynamic ad group detection.
    adgroup_sql = f"""
    WITH {cte}
    SELECT
        m.AD_GROUP_TYPE   AS ad_group_type,
        m.AD_GROUP_STATUS AS ad_group_status,
        COUNT(DISTINCT m.AD_GROUP_ID) AS ad_group_count,
        TRUE AS _adgroup_summary
    FROM {t_ag_meta} m
    JOIN acct_campaigns USING (CAMPAIGN_ID)
    GROUP BY 1, 2
    ORDER BY ad_group_count DESC
    """

    return _combine(
        _safe("keyword_strategy/keywords", keyword_sql, params, "keyword"),
        _safe("keyword_strategy/match_mix", match_mix_sql, params, "keyword_match_mix"),
        _safe("keyword_strategy/quality_score", qs_sql, params, "keyword_quality_score"),
        _safe("keyword_strategy/search_terms", search_term_sql, params, "search_term_summary"),
        _safe("keyword_strategy/adgroups", adgroup_sql, params, "adgroup_structure"),
    )


# --------------------------------------------------------------------------- #
# audience_targeting  (was a permanent stub before the 2026-08-20 rebuild)
# --------------------------------------------------------------------------- #
def _audience_targeting(account_id: str, dataset: str | None = None, lookback_days: int = 30) -> pd.DataFrame:
    t_aud_meta = table("GOOGLEADS_CAMPAIGNAUDIENCE", dataset)
    t_aud_stats = table("GOOGLEADS_P_AUDIENCEBASICSTATS", dataset)
    t_age = table("GOOGLEADS_P_AGERANGEBASICSTATS", dataset)
    t_gender = table("GOOGLEADS_P_GENDERBASICSTATS", dataset)
    t_loc_meta = table("GOOGLEADS_CAMPAIGNLOCATION", dataset)
    t_loc_stats = table("GOOGLEADS_P_CAMPAIGNTARGETEDLOCATIONSTATS", dataset)

    params = [account_param(account_id), cutoff_date_param(lookback_days)]
    cte = _account_campaigns_cte(dataset)

    # Attached audiences per campaign — segmentation + remarketing + lookalikes.
    audience_sql = f"""
    WITH {cte}
    SELECT
        a.AUDIENCE        AS audience_name,
        a.AUDIENCE_STATUS AS audience_status,
        COUNT(DISTINCT a.CAMPAIGN_ID) AS campaign_count,
        -- "LAL"/"Lookalike"/"Similar" prefixes mark lookalike lists in this account
        REGEXP_CONTAINS(UPPER(a.AUDIENCE), r'^LAL|LOOKALIKE|SIMILAR') AS is_lookalike,
        REGEXP_CONTAINS(UPPER(a.AUDIENCE), r'VISITOR|CONVERT|CUSTOMER|KLANT|REMARKET|ALL USERS|GEBRUIKER') AS is_remarketing
    FROM {t_aud_meta} a
    JOIN acct_campaigns USING (CAMPAIGN_ID)
    GROUP BY 1, 2, 4, 5
    ORDER BY campaign_count DESC
    LIMIT 60
    """

    # Audience performance — proves the segments are actually serving.
    audience_perf_sql = f"""
    SELECT
        AUDIENCE            AS audience_name,
        COUNT(DISTINCT CAMPAIGN_ID) AS campaign_count,
        SUM(IMPRESSIONS)    AS impressions_period,
        SUM(CLICKS)         AS clicks_period,
        SUM(COST)           AS cost_period,
        SUM(CONVERSIONS)    AS conversions_period,
        SUM(CONVERSION_VALUE) AS conversion_value_period
    FROM {t_aud_stats}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY 1
    ORDER BY impressions_period DESC
    LIMIT 40
    """

    demographics_sql = f"""
    SELECT 'age' AS dimension, AGE AS bucket,
           SUM(IMPRESSIONS) AS impressions_period, SUM(COST) AS cost_period,
           SUM(CONVERSIONS) AS conversions_period
    FROM {t_age}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY 1, 2
    UNION ALL
    SELECT 'gender', GENDER,
           SUM(IMPRESSIONS), SUM(COST), SUM(CONVERSIONS)
    FROM {t_gender}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY 1, 2
    ORDER BY dimension, impressions_period DESC
    """

    # Geo targeting precision: presence-vs-interest mode + targeted location granularity.
    geo_mode_sql = f"""
    WITH {cte}
    SELECT
        l.LOCATION_TYPE AS location_targeting_mode,
        COUNT(DISTINCT l.CAMPAIGN_ID) AS campaign_count,
        TRUE AS _geo_mode_summary
    FROM {t_loc_meta} l
    JOIN acct_campaigns USING (CAMPAIGN_ID)
    GROUP BY 1
    ORDER BY campaign_count DESC
    """

    geo_perf_sql = f"""
    SELECT
        LOCATION_TYPE    AS location_granularity,
        COUNT(DISTINCT LOCATION)    AS locations_targeted,
        COUNT(DISTINCT CAMPAIGN_ID) AS campaign_count,
        SUM(IMPRESSIONS) AS impressions_period,
        SUM(COST)        AS cost_period,
        SUM(CONVERSIONS) AS conversions_period
    FROM {t_loc_stats}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY 1
    ORDER BY impressions_period DESC
    """

    return _combine(
        _safe("audience_targeting/audiences", audience_sql, params, "audience"),
        _safe("audience_targeting/audience_perf", audience_perf_sql, params, "audience_perf"),
        _safe("audience_targeting/demographics", demographics_sql, params, "demographics"),
        _safe("audience_targeting/geo_mode", geo_mode_sql, params, "geo_mode"),
        _safe("audience_targeting/geo_perf", geo_perf_sql, params, "geo_perf"),
    )


# --------------------------------------------------------------------------- #
# conversion_kpi
# --------------------------------------------------------------------------- #
def _conversion_kpi(account_id: str, dataset: str | None = None, lookback_days: int = 30) -> pd.DataFrame:
    t_stats = table("GOOGLEADS_P_CAMPAIGNBASICSTATS", dataset)
    t_xdev = table("GOOGLEADS_P_ADGROUPCROSSDEVICESTATS", dataset)
    t_bid = table("GOOGLEADS_P_BIDDINGSTRATEGY", dataset)

    params = [account_param(account_id), cutoff_date_param(lookback_days)]

    # Account-level conversion health.
    stats_sql = f"""
    SELECT
        SUM(IMPRESSIONS)      AS impressions_period,
        SUM(CLICKS)           AS clicks_period,
        SUM(COST)             AS cost_period,
        SUM(CONVERSIONS)      AS conversions_period,
        SUM(CONVERSION_VALUE) AS conversion_value_period,
        SUM(VIEW_THROUGH_CONVERSIONS) AS view_through_conversions_period,
        SAFE_DIVIDE(SUM(CONVERSION_VALUE), NULLIF(SUM(COST), 0)) AS account_roas,
        SAFE_DIVIDE(SUM(COST), NULLIF(SUM(CONVERSIONS), 0))      AS account_cpa,
        COUNT(DISTINCT CAMPAIGN_ID) AS campaigns_total,
        COUNT(DISTINCT IF(CONVERSIONS > 0, CAMPAIGN_ID, NULL)) AS campaigns_with_conversions,
        COUNT(DISTINCT DATE) AS days_with_data,
        TRUE AS _summary
    FROM {t_stats}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    """

    # Per-campaign conversion + value, so the specialist can see value-based coverage.
    per_campaign_sql = f"""
    SELECT
        CAMPAIGN_ID              AS campaign_id,
        ANY_VALUE(ADVERTISING_CHANNEL_TYPE) AS campaign_advertising_channel_type,
        SUM(COST)                AS cost_period,
        SUM(CONVERSIONS)         AS conversions_period,
        SUM(CONVERSION_VALUE)    AS conversion_value_period,
        SAFE_DIVIDE(SUM(CONVERSION_VALUE), NULLIF(SUM(COST), 0)) AS roas
    FROM {t_stats}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY campaign_id
    ORDER BY cost_period DESC
    LIMIT 50
    """

    # Cross-device conversions — proves the account is not blind to multi-device journeys.
    xdev_sql = f"""
    SELECT
        SUM(CONVERSIONS)                        AS conversions_period,
        SUM(ESTIMATED_CROSS_DEVICE_CONVERSIONS) AS cross_device_conversions_period,
        SAFE_DIVIDE(SUM(ESTIMATED_CROSS_DEVICE_CONVERSIONS), NULLIF(SUM(CONVERSIONS), 0)) AS cross_device_share,
        TRUE AS _xdev_summary
    FROM {t_xdev}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    """

    # Value-based bidding: is TARGET_ROAS actually set, and how does it compare to actual?
    vbb_sql = f"""
    SELECT
        BIDDING_STRATEGY_TYPE AS bidding_strategy_type,
        COUNT(DISTINCT CAMPAIGN_ID) AS campaign_count,
        COUNT(DISTINCT IF(TARGET_ROAS > 0, CAMPAIGN_ID, NULL)) AS campaigns_with_target_roas,
        ROUND(AVG(NULLIF(TARGET_ROAS, 0)), 3) AS avg_target_roas,
        SAFE_DIVIDE(SUM(CONVERSION_VALUE), NULLIF(SUM(COST), 0)) AS actual_roas,
        TRUE AS _vbb_summary
    FROM {t_bid}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY 1
    ORDER BY campaign_count DESC
    """

    return _combine(
        _safe("conversion_kpi/stats", stats_sql, params, "conversion_stats"),
        _safe("conversion_kpi/per_campaign", per_campaign_sql, params, "conversion_per_campaign"),
        _safe("conversion_kpi/cross_device", xdev_sql, params, "cross_device"),
        _safe("conversion_kpi/vbb", vbb_sql, params, "value_based_bidding"),
    )


# --------------------------------------------------------------------------- #
# feeds_catalogue
# --------------------------------------------------------------------------- #
def _feeds_catalogue(account_id: str, dataset: str | None = None, lookback_days: int = 30) -> pd.DataFrame:
    t_shop = table("GOOGLEADS_P_SHOPPINGBASICSTATS", dataset)
    t_shop_old = table("GOOGLEADS_SHOPPING", dataset)
    t_lgf = table("GOOGLEADS_PMAXASSETGROUPMETADATA", dataset)

    params = [account_param(account_id), cutoff_date_param(lookback_days)]
    cte = _account_campaigns_cte(dataset)

    # Product performance — the new table finally carries conversions + value.
    product_sql = f"""
    SELECT
        COUNT(DISTINCT PRODUCT_TITLE) AS products_served,
        COUNT(DISTINCT CAMPAIGN_ID)   AS shopping_campaigns,
        SUM(IMPRESSIONS)              AS impressions_period,
        SUM(CLICKS)                   AS clicks_period,
        SUM(COST)                     AS cost_period,
        SUM(CONVERSIONS)              AS conversions_period,
        SUM(CONVERSION_VALUE)         AS conversion_value_period,
        SAFE_DIVIDE(SUM(CONVERSION_VALUE), NULLIF(SUM(COST), 0)) AS shopping_roas,
        COUNT(DISTINCT IF(CONVERSIONS > 0, PRODUCT_TITLE, NULL)) AS products_with_conversions,
        COUNT(DISTINCT IF(IMPRESSIONS > 0 AND CLICKS = 0, PRODUCT_TITLE, NULL)) AS products_zero_clicks,
        TRUE AS _summary
    FROM {t_shop}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    """

    top_products_sql = f"""
    SELECT
        PRODUCT_TITLE         AS product_title,
        SUM(IMPRESSIONS)      AS impressions_period,
        SUM(COST)             AS cost_period,
        SUM(CONVERSIONS)      AS conversions_period,
        SUM(CONVERSION_VALUE) AS conversion_value_period
    FROM {t_shop}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY product_title
    ORDER BY cost_period DESC
    LIMIT 40
    """

    # PMax listing group filters — the product-partition structure.
    listing_group_sql = f"""
    WITH {cte}
    SELECT
        l.LISTING_GROUP_FILTER_TYPE           AS listing_group_filter_type,
        l.LISTING_GROUP_FILTER_LISTING_SOURCE AS listing_source,
        COUNT(DISTINCT l.LISTING_GROUP_FILTER_ID) AS filter_count,
        COUNT(DISTINCT l.ASSET_GROUP_ID)          AS asset_group_count,
        TRUE AS _listing_group_summary
    FROM {t_lgf} l
    JOIN acct_campaigns USING (CAMPAIGN_ID)
    GROUP BY 1, 2
    ORDER BY filter_count DESC
    """

    # Feed attribute coverage (product type levels, custom labels) exists ONLY on the
    # frozen legacy table — the new P_SHOPPINGBASICSTATS carries PRODUCT_TITLE alone.
    # Flagged stale so the specialist can discount it; taxonomy changes slowly enough
    # to stay directionally useful.
    feed_attrs_sql = f"""
    SELECT
        COUNT(DISTINCT OFFER_ID) AS offers,
        COUNT(DISTINCT IF(COALESCE(PRODUCT_TITLE, '') != '', OFFER_ID, NULL))          AS offers_with_title,
        COUNT(DISTINCT IF(COALESCE(PRODUCT_TYPE_LEVEL_1, '') != '', OFFER_ID, NULL))   AS offers_with_product_type_1,
        COUNT(DISTINCT IF(COALESCE(PRODUCT_TYPE_LEVEL_3, '') != '', OFFER_ID, NULL))   AS offers_with_product_type_3,
        COUNT(DISTINCT IF(COALESCE(CUSTOM_ATTRIBUTE, '') != '', OFFER_ID, NULL))       AS offers_with_custom_label,
        COUNT(DISTINCT MERCHANT_ID) AS merchant_accounts,
        MAX(DATE) AS snapshot_date,
        TRUE AS _feed_attrs_stale_snapshot
    FROM {t_shop_old}
    WHERE PROFILE_ID = @account_id
    """

    return _combine(
        _safe("feeds_catalogue/products", product_sql, params, "shopping_summary"),
        _safe("feeds_catalogue/top_products", top_products_sql, params, "shopping_product"),
        _safe("feeds_catalogue/listing_groups", listing_group_sql, params, "listing_group_summary"),
        _safe("feeds_catalogue/feed_attrs", feed_attrs_sql, [account_param(account_id)], "feed_attributes_stale"),
    )


# --------------------------------------------------------------------------- #
# creative_content
# --------------------------------------------------------------------------- #
def _creative_content(account_id: str, dataset: str | None = None, lookback_days: int = 30) -> pd.DataFrame:
    t_ad = table("GOOGLEADS_P_ADBASICSTATS", dataset)
    t_ad_meta = table("GOOGLEADS_ADMETADATA", dataset)
    t_aga = table("GOOGLEADS_ASSETGROUPASSET", dataset)

    params = [account_param(account_id), cutoff_date_param(lookback_days)]
    cte = _account_campaigns_cte(dataset)

    headline_cols = " + ".join(
        f"(CASE WHEN COALESCE(AD_HEADLINE_{i}, '') != '' THEN 1 ELSE 0 END)" for i in range(1, 16)
    )
    desc_cols = " + ".join(
        f"(CASE WHEN COALESCE(AD_DESCRIPTION_{i}, '') != '' THEN 1 ELSE 0 END)" for i in range(1, 6)
    )

    # RSA asset depth — the headline/description text landed in the 2026-08-20 rebuild.
    rsa_sql = f"""
    WITH latest AS (
        SELECT *
        FROM {t_ad}
        WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
          AND {_enum_eq("AD_TYPE", "RESPONSIVE_SEARCH_AD")}
        QUALIFY ROW_NUMBER() OVER (PARTITION BY AD_ID ORDER BY DATE DESC) = 1
    )
    SELECT
        COUNT(*) AS rsa_count,
        ROUND(AVG({headline_cols}), 2) AS avg_headlines_per_rsa,
        ROUND(AVG({desc_cols}), 2)     AS avg_descriptions_per_rsa,
        COUNTIF(({headline_cols}) >= 12) AS rsas_with_12_plus_headlines,
        COUNTIF(({desc_cols}) >= 4)      AS rsas_with_4_plus_descriptions,
        COUNTIF(({headline_cols}) < 8)   AS rsas_under_8_headlines,
        TRUE AS _rsa_summary
    FROM latest
    """

    # A sample of actual copy so the specialist can judge relevance/differentiation.
    rsa_sample_sql = f"""
    SELECT
        AD_ID AS ad_id,
        AD_HEADLINE_1 AS headline_1, AD_HEADLINE_2 AS headline_2, AD_HEADLINE_3 AS headline_3,
        AD_DESCRIPTION_1 AS description_1, AD_DESCRIPTION_2 AS description_2,
        FINAL_URL AS final_url
    FROM {t_ad}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
      AND {_enum_eq("AD_TYPE", "RESPONSIVE_SEARCH_AD")}
      AND COALESCE(AD_HEADLINE_1, '') != ''
    QUALIFY ROW_NUMBER() OVER (PARTITION BY AD_ID ORDER BY DATE DESC) = 1
    LIMIT 25
    """

    # Ad mix + per-ad-group ad counts (rotation / testing coverage).
    ad_mix_sql = f"""
    WITH per_ad AS (
        SELECT AD_ID, ANY_VALUE(AD_TYPE) AS ad_type, ANY_VALUE(AD_STATUS) AS ad_status,
               ANY_VALUE(AD_GROUP_ID) AS ad_group_id
        FROM {t_ad}
        WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
        GROUP BY AD_ID
    )
    SELECT
        ad_type, ad_status,
        COUNT(DISTINCT AD_ID) AS ad_count,
        COUNT(DISTINCT ad_group_id) AS ad_group_count,
        ROUND(SAFE_DIVIDE(COUNT(DISTINCT AD_ID), NULLIF(COUNT(DISTINCT ad_group_id), 0)), 2) AS ads_per_ad_group,
        TRUE AS _ad_mix_summary
    FROM per_ad
    GROUP BY 1, 2
    ORDER BY ad_count DESC
    """

    # AD_STRENGTH: present only for Demand Gen / Video ads. Emitted with an explicit
    # coverage count so the specialist can see it does NOT cover search ads.
    ad_strength_sql = f"""
    WITH {cte},
    served AS (
        SELECT DISTINCT AD_ID FROM {t_ad}
        WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    )
    SELECT
        m.AD_TYPE      AS ad_type,
        m.AD_STRENGTH  AS ad_strength,
        COUNT(DISTINCT m.AD_ID) AS ad_count,
        TRUE AS _ad_strength_summary
    FROM {t_ad_meta} m
    JOIN acct_campaigns USING (CAMPAIGN_ID)
    JOIN served USING (AD_ID)
    WHERE COALESCE(m.AD_STRENGTH, '') != ''
    GROUP BY 1, 2
    ORDER BY ad_count DESC
    """

    # PMax asset variety by field type — counts only; asset text is unavailable.
    asset_variety_sql = f"""
    WITH {cte}
    SELECT
        a.ASSET_FIELD_TYPE AS asset_field_type,
        COUNT(DISTINCT a.ASSET_ID)       AS asset_count,
        COUNT(DISTINCT a.ASSET_GROUP_ID) AS asset_group_count,
        ROUND(SAFE_DIVIDE(COUNT(DISTINCT a.ASSET_ID), NULLIF(COUNT(DISTINCT a.ASSET_GROUP_ID), 0)), 2)
            AS assets_per_asset_group,
        TRUE AS _asset_variety_summary
    FROM {t_aga} a
    JOIN acct_campaigns USING (CAMPAIGN_ID)
    GROUP BY 1
    ORDER BY asset_count DESC
    """

    return _combine(
        _safe("creative_content/rsa_summary", rsa_sql, params, "rsa_summary"),
        _safe("creative_content/rsa_sample", rsa_sample_sql, params, "rsa_sample"),
        _safe("creative_content/ad_mix", ad_mix_sql, params, "ad_mix"),
        _safe("creative_content/ad_strength", ad_strength_sql, params, "ad_strength_partial"),
        _safe("creative_content/asset_variety", asset_variety_sql, params, "asset_variety"),
    )


# --------------------------------------------------------------------------- #
# ai_readiness / PMax
# --------------------------------------------------------------------------- #
def _pmax_performance(account_id: str, dataset: str | None = None, lookback_days: int = 30) -> pd.DataFrame:
    t_ag_stats = table("GOOGLEADS_P_ASSETGROUPBASICSTATS", dataset)
    t_ag_meta = table("GOOGLEADS_PMAXASSETGROUPMETADATA", dataset)
    t_camp = table("GOOGLEADS_P_CAMPAIGNBASICSTATS", dataset)
    t_sq = table("GOOGLEADS_P_SEARCHQUERYSTATS", dataset)

    params = [account_param(account_id), cutoff_date_param(lookback_days)]
    cte = _account_campaigns_cte(dataset)

    # PMax vs. standard campaign balance.
    balance_sql = f"""
    SELECT
        ADVERTISING_CHANNEL_TYPE AS campaign_advertising_channel_type,
        COUNT(DISTINCT CAMPAIGN_ID) AS campaign_count,
        SUM(COST)                AS cost_period,
        SUM(CONVERSIONS)         AS conversions_period,
        SUM(CONVERSION_VALUE)    AS conversion_value_period,
        SAFE_DIVIDE(SUM(CONVERSION_VALUE), NULLIF(SUM(COST), 0)) AS roas,
        TRUE AS _channel_balance_summary
    FROM {t_camp}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY 1
    ORDER BY cost_period DESC
    """

    # Asset group performance — now dated, so it can be windowed properly.
    asset_group_sql = f"""
    SELECT
        ASSET_GROUP_ID        AS asset_group_id,
        ANY_VALUE(ASSET_GROUP_NAME)   AS asset_group_name,
        ANY_VALUE(ASSET_GROUP_STATUS) AS asset_group_status,
        SUM(IMPRESSIONS)      AS impressions_period,
        SUM(CLICKS)           AS clicks_period,
        SUM(COST)             AS cost_period,
        SUM(CONVERSIONS)      AS conversions_period,
        SUM(CONVERSION_VALUE) AS conversion_value_period
    FROM {t_ag_stats}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY asset_group_id
    ORDER BY cost_period DESC
    LIMIT 40
    """

    # Asset group strength — AD_STRENGTH *is* populated at asset-group level.
    ag_strength_sql = f"""
    WITH {cte}
    SELECT
        m.AD_STRENGTH         AS asset_group_ad_strength,
        m.ASSET_GROUP_STATUS  AS asset_group_status,
        COUNT(DISTINCT m.ASSET_GROUP_ID) AS asset_group_count,
        TRUE AS _ag_strength_summary
    FROM {t_ag_meta} m
    JOIN acct_campaigns USING (CAMPAIGN_ID)
    GROUP BY 1, 2
    ORDER BY asset_group_count DESC
    """

    # AI Max adoption — surfaced via the search-term match source.
    ai_max_sql = f"""
    SELECT
        SEARCH_TERM_MATCH_SOURCE AS match_source,
        COUNT(DISTINCT SEARCH_TERM) AS search_terms,
        COUNT(DISTINCT CAMPAIGN_ID) AS campaign_count,
        SUM(IMPRESSIONS)         AS impressions_period,
        SUM(COST)                AS cost_period,
        SUM(CONVERSIONS)         AS conversions_period,
        TRUE AS _ai_max_summary
    FROM {t_sq}
    WHERE PROFILE_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY 1
    ORDER BY impressions_period DESC
    """

    return _combine(
        _safe("ai_readiness/channel_balance", balance_sql, params, "channel_balance"),
        _safe("ai_readiness/asset_groups", asset_group_sql, params, "asset_group"),
        _safe("ai_readiness/ag_strength", ag_strength_sql, params, "asset_group_strength"),
        _safe("ai_readiness/ai_max", ai_max_sql, params, "ai_max_summary"),
    )


def extract_audit_data(
    account_id: str,
    dataset: str | None = None,
    lookback_days: int = 30,
) -> dict[str, pd.DataFrame]:
    """
    Run all seven category extractions and return a dict of DataFrames.
    Any category that fails is returned as an empty DataFrame so the pipeline
    can continue and flag the gap rather than crashing.
    """
    extractors = {
        "campaign_setup": _campaign_setup,
        "keyword_strategy": _keyword_strategy,
        "audience_targeting": _audience_targeting,
        "conversion_kpi": _conversion_kpi,
        "feeds_catalogue": _feeds_catalogue,
        "creative_content": _creative_content,
        "ai_readiness": _pmax_performance,
    }

    results: dict[str, pd.DataFrame] = {}
    for name, fn in extractors.items():
        try:
            results[name] = fn(account_id, dataset, lookback_days)
        except Exception as exc:
            logger.warning("extract_audit_data: %s FAILED — %s", name, exc)
            results[name] = pd.DataFrame({"_error": [str(exc)]})

    return results
