"""
Extract structured audit data from BigQuery Google Ads tables (Supermetrics export).

Schema notes (Supermetrics "Google Ads" BigQuery connector, dataset `google_ads`):
- Six flat tables: GOOGLEADS_CAMPAIGN, GOOGLEADS_AD, GOOGLEADS_CONVERSION,
  GOOGLEADS_KEYWORD, GOOGLEADS_SEARCH_QUERY, GOOGLEADS_SHOPPING.
- No per-account table suffix — every row carries an ACCOUNT_ID column instead,
  filtered via account_param(). Multiple accounts can be blended in the same tables.
- No _PARTITIONTIME pseudo-column — DATE is a normal partitioned column on every
  row. "Latest known state" entity queries use latest_row_qualifier() instead of
  the old _max_partition() snapshot pattern.
- Much flatter/less granular than the previous native Google Ads BQ Data Transfer
  export: there is no AdGroup, CampaignCriterion, CampaignAudience, Gender,
  AgeRange, HourlyCampaignStats, SharedSet, or AssetGroupAudienceView equivalent
  anywhere in this dataset. Categories/topics that depended entirely on those
  tables (see _audience_targeting, and large parts of _pmax_performance and
  _keyword_strategy below) now have no data source and are handled as empty
  DataFrames — the specialist prompt turns those into manual-verification stubs.
- Some fields are actually richer than before: GOOGLEADS_SHOPPING has a real
  PRODUCT_TITLE column (the old export was missing it entirely), and
  GOOGLEADS_CONVERSION has ESTIMATED_CROSS_DEVICE_CONVERSIONS directly on the
  row (the old export needed a separate table + join).

Sampling strategy is unchanged: high-volume tables are aggregated in SQL before
being sent to Gemini, not sampled row-by-row.
"""
from __future__ import annotations

import logging

import pandas as pd

from app.services.bigquery import account_param, cutoff_date_param, latest_row_qualifier, run_query, table

logger = logging.getLogger(__name__)


def _enum_eq(column: str, value: str) -> str:
    """Case/spacing-insensitive equality for Supermetrics enum-like columns.

    Supermetrics emits these as human-readable, inconsistently-cased strings
    (e.g. CAMPAIGN_STATUS='enabled', AD_STATUS='Enabled', ADVERTISING_CHANNEL_TYPE=
    'Performance Max', AD_TYPE='DEMAND_GEN_VIDEO_RESPONSIVE_AD' — mixing sentence
    case, spaces, and raw enum tokens in the same dataset) rather than the old
    GAQL SCREAMING_SNAKE_CASE enums. Normalise both sides the same way before
    comparing. `value` must already be a normalised literal (spaces as
    underscores, uppercase) and must never come from user input.
    """
    return f"UPPER(REPLACE({column}, ' ', '_')) = '{value}'"


def _campaign_setup(account_id: str, dataset: str | None = None, lookback_days: int = 30) -> pd.DataFrame:
    t_campaign = table("GOOGLEADS_CAMPAIGN", dataset)
    recent_days = min(7, lookback_days)
    params = [account_param(account_id), cutoff_date_param(lookback_days)]
    recent_params = params + [cutoff_date_param(recent_days, name="recent_cutoff_date")]

    # Entity snapshot: latest known row per campaign within the window.
    # LIMIT 50: account has ~200 campaigns; Gemini needs a representative sample.
    campaign_sql = f"""
    SELECT
        CAMPAIGN_ID                        AS campaign_id,
        CAMPAIGN_NAME                      AS campaign_name,
        CAMPAIGN_STATUS                    AS status,
        ADVERTISING_CHANNEL_TYPE           AS campaign_advertising_channel_type,
        ADVERTISING_CHANNEL_SUB_TYPE       AS campaign_advertising_channel_sub_type,
        BIDDING_STRATEGY_TYPE              AS campaign_bidding_strategy_type,
        DAILY_BUDGET                       AS daily_budget
    FROM {t_campaign}
    WHERE ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    {latest_row_qualifier("CAMPAIGN_ID")}
    LIMIT 50
    """

    # Per-campaign performance across the lookback window, plus a shorter
    # "recent" sub-window to detect campaigns that stalled.
    perf_sql = f"""
    SELECT
        CAMPAIGN_ID                                                      AS campaign_id,
        SUM(IMPRESSIONS)                                                 AS impressions_period,
        SUM(CASE WHEN DATE >= @recent_cutoff_date THEN IMPRESSIONS ELSE 0 END) AS impressions_recent,
        SUM(CONVERSIONS)                                                 AS conversions_period,
        SUM(COST)                                                        AS cost_period
    FROM {t_campaign}
    WHERE ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY campaign_id
    """

    type_summary_sql = f"""
    SELECT
        ADVERTISING_CHANNEL_TYPE AS campaign_advertising_channel_type,
        COUNT(DISTINCT CAMPAIGN_ID) AS campaign_count,
        TRUE AS _summary
    FROM {t_campaign}
    WHERE {_enum_eq("CAMPAIGN_STATUS", "ENABLED")}
      AND ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY 1
    ORDER BY campaign_count DESC
    """

    campaigns = run_query(campaign_sql, params)
    logger.warning("campaign_setup/campaign: %d rows", len(campaigns))
    campaigns["_source"] = "campaign"

    try:
        perf = run_query(perf_sql, recent_params)
        logger.warning("campaign_setup/perf: %d rows", len(perf))
        perf["_source"] = "campaign_perf"
    except Exception as exc:
        logger.warning("campaign_setup/perf failed: %s", exc)
        perf = pd.DataFrame()

    try:
        type_summary = run_query(type_summary_sql, params)
        logger.warning("campaign_setup/type_summary: %d rows", len(type_summary))
        type_summary["_source"] = "campaign_type_summary"
    except Exception as exc:
        logger.warning("campaign_setup/type_summary failed: %s", exc)
        type_summary = pd.DataFrame()

    # NOTE: HourlyCampaignStats (dayparting) and CampaignCriterion (AD_SCHEDULE)
    # have no equivalent in this dataset — "Scheduling & dayparting" has no
    # automated signal anymore; the specialist prompt scores it as a stub.

    return pd.concat([campaigns, perf, type_summary], ignore_index=True)


def _audience_targeting(account_id: str, dataset: str | None = None, lookback_days: int = 30) -> pd.DataFrame:
    # CampaignAudience, CampaignCriterion, Gender, and AgeRange have no
    # equivalent table in this dataset at all — every topic in this category
    # (segmentation, remarketing, lookalikes, demographics, geo targeting,
    # exclusion lists) is unrecoverable from BigQuery under the current
    # Supermetrics export. Return empty rather than firing four queries
    # against tables that don't exist.
    logger.warning("audience_targeting: no data source in current schema — returning empty")
    return pd.DataFrame()


def _conversion_kpi(account_id: str, dataset: str | None = None, lookback_days: int = 30) -> pd.DataFrame:
    t_campaign = table("GOOGLEADS_CAMPAIGN", dataset)
    t_conv = table("GOOGLEADS_CONVERSION", dataset)
    params = [account_param(account_id), cutoff_date_param(lookback_days)]

    stats_sql = f"""
    SELECT
        CAMPAIGN_ID                                            AS campaign_id,
        DATE                                                   AS date,
        IMPRESSIONS                                            AS impressions,
        CLICKS                                                 AS clicks,
        COST                                                   AS cost,
        CONVERSIONS                                            AS conversions,
        CONVERSION_VALUE                                       AS conversions_value,
        SAFE_DIVIDE(CONVERSION_VALUE, COST)                    AS roas,
        SAFE_DIVIDE(COST, NULLIF(CONVERSIONS, 0))              AS cpa
    FROM {t_campaign}
    WHERE ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    """

    conv_sql = f"""
    SELECT
        CAMPAIGN_ID              AS campaign_id,
        CONVERSION_TYPE_NAME     AS conversion_name,
        CONVERSION_CATEGORY      AS conversion_category,
        SUM(CONVERSIONS)         AS conversions,
        SUM(CONVERSION_VALUE)    AS conversions_value
    FROM {t_conv}
    WHERE ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY campaign_id, conversion_name, conversion_category
    """

    # Account-wide rollup by conversion type/category — same "no per-action
    # status/primary_for_goal" gap as the previous schema.
    conv_action_sql = f"""
    SELECT
        CONVERSION_TYPE_NAME                AS name,
        CONVERSION_CATEGORY                 AS category,
        ROUND(SUM(CONVERSIONS), 1)          AS conversions_period,
        ROUND(SUM(CONVERSION_VALUE), 0)     AS value_period,
        COUNT(DISTINCT CAMPAIGN_ID)         AS campaigns_tracking
    FROM {t_conv}
    WHERE ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY name, category
    ORDER BY conversions_period DESC
    """

    # No target_roas/target_cpa column exists anywhere in this dataset (a
    # regression vs. the previous export, which at least had target_roas) —
    # this is now actual performance only, no target comparison possible.
    targets_sql = f"""
    WITH latest_status AS (
        SELECT CAMPAIGN_ID, CAMPAIGN_STATUS
        FROM {t_campaign}
        WHERE ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
        {latest_row_qualifier("CAMPAIGN_ID")}
    )
    SELECT
        c.CAMPAIGN_ID                                                        AS campaign_id,
        ANY_VALUE(c.BIDDING_STRATEGY_TYPE)                                   AS bidding_strategy,
        ROUND(SAFE_DIVIDE(SUM(c.CONVERSION_VALUE), SUM(c.COST)), 2)          AS actual_roas_period,
        ROUND(SAFE_DIVIDE(SUM(c.COST), NULLIF(SUM(c.CONVERSIONS), 0)), 2)    AS actual_cpa_period,
        SUM(c.CONVERSIONS)                                                   AS conversions_period
    FROM {t_campaign} c
    INNER JOIN latest_status ls
            ON c.CAMPAIGN_ID = ls.CAMPAIGN_ID AND {_enum_eq("ls.CAMPAIGN_STATUS", "ENABLED")}
    WHERE c.ACCOUNT_ID = @account_id AND c.DATE >= @cutoff_date
    GROUP BY c.CAMPAIGN_ID
    """

    # Cross-device conversions live directly on GOOGLEADS_CONVERSION now — no
    # separate table/join needed (an improvement over the previous schema).
    xdevice_sql = f"""
    SELECT
        CONVERSION_TYPE_NAME                                     AS name,
        CONVERSION_CATEGORY                                      AS category,
        ROUND(SUM(ESTIMATED_CROSS_DEVICE_CONVERSIONS), 1)        AS cross_device_conversions_period,
        COUNT(DISTINCT CAMPAIGN_ID)                              AS campaigns_with_xdevice,
        TRUE                                                     AS _summary
    FROM {t_conv}
    WHERE ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY name, category
    ORDER BY cross_device_conversions_period DESC
    LIMIT 10
    """

    stats = run_query(stats_sql, params)
    convs = run_query(conv_sql, params)

    try:
        conv_actions = run_query(conv_action_sql, params)
        logger.warning("conversion_kpi/conv_actions: %d rows", len(conv_actions))
        conv_actions["_source"] = "conversion_actions"
    except Exception as exc:
        logger.warning("conversion_kpi/conv_actions failed: %s", exc)
        conv_actions = pd.DataFrame()

    try:
        targets = run_query(targets_sql, params)
        logger.warning("conversion_kpi/targets: %d rows", len(targets))
        targets["_source"] = "campaign_targets"
    except Exception as exc:
        logger.warning("conversion_kpi/targets failed: %s", exc)
        targets = pd.DataFrame()

    try:
        xdevice = run_query(xdevice_sql, params)
        logger.warning("conversion_kpi/xdevice: %d rows", len(xdevice))
        xdevice["_source"] = "cross_device_conversions"
    except Exception as exc:
        logger.warning("conversion_kpi/xdevice failed: %s", exc)
        xdevice = pd.DataFrame()

    logger.warning("conversion_kpi: %d stats rows, %d conversion rows", len(stats), len(convs))

    stats["_source"] = "campaign_basic_stats"
    convs["_source"] = "campaign_conversion_stats"

    return pd.concat([stats, convs, conv_actions, targets, xdevice], ignore_index=True)


def _feeds_catalogue(account_id: str, dataset: str | None = None, lookback_days: int = 30) -> pd.DataFrame:
    t_shopping = table("GOOGLEADS_SHOPPING", dataset)
    params = [account_param(account_id), cutoff_date_param(lookback_days)]
    recent_params = [account_param(account_id), cutoff_date_param(min(7, lookback_days))]

    # Custom labels: CUSTOM_ATTRIBUTE (label 0) + CUSTOM_ATTRIBUTE_1..4 (labels 1-4).
    # NOTE: no conversions column exists on this table in the new export (a
    # regression vs. the old ShoppingProductStats, which had metrics_conversions).
    shopping_sql = f"""
    SELECT
        CAMPAIGN_ID                                                     AS campaign_id,
        BRAND                                                           AS product_brand,
        COUNTIF(CUSTOM_ATTRIBUTE IS NOT NULL AND CUSTOM_ATTRIBUTE != '')     AS rows_with_label_0,
        COUNTIF(CUSTOM_ATTRIBUTE_1 IS NOT NULL AND CUSTOM_ATTRIBUTE_1 != '') AS rows_with_label_1,
        COUNTIF(CUSTOM_ATTRIBUTE_2 IS NOT NULL AND CUSTOM_ATTRIBUTE_2 != '') AS rows_with_label_2,
        COUNTIF(CUSTOM_ATTRIBUTE_3 IS NOT NULL AND CUSTOM_ATTRIBUTE_3 != '') AS rows_with_label_3,
        COUNTIF(CUSTOM_ATTRIBUTE_4 IS NOT NULL AND CUSTOM_ATTRIBUTE_4 != '') AS rows_with_label_4,
        SUM(IMPRESSIONS)                                                AS impressions,
        SUM(CLICKS)                                                     AS clicks,
        SUM(COST)                                                       AS cost
    FROM {t_shopping}
    WHERE ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY campaign_id, product_brand
    """

    # PRODUCT_TITLE actually exists in this export (unlike the previous schema,
    # where segments_product_title was missing entirely) — a genuine upgrade.
    title_sql = f"""
    SELECT
        PRODUCT_TITLE                                  AS product_title,
        PRODUCT_TYPE_LEVEL_1                            AS product_type,
        BRAND                                           AS product_brand,
        NULLIF(CUSTOM_ATTRIBUTE, '')                    AS custom_label_0,
        NULLIF(CUSTOM_ATTRIBUTE_1, '')                  AS custom_label_1,
        NULLIF(CUSTOM_ATTRIBUTE_2, '')                  AS custom_label_2,
        SUM(IMPRESSIONS)                                AS impressions
    FROM {t_shopping}
    WHERE ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
      AND PRODUCT_TITLE IS NOT NULL
    GROUP BY product_title, product_type, product_brand, custom_label_0, custom_label_1, custom_label_2
    ORDER BY impressions DESC
    LIMIT 50
    """

    shopping = run_query(shopping_sql, params)

    try:
        titles = run_query(title_sql, recent_params)
        logger.warning("feeds_catalogue/titles: %d sample rows", len(titles))
        titles["_source"] = "product_title_sample"
    except Exception as exc:
        logger.warning("feeds_catalogue/titles failed: %s", exc)
        titles = pd.DataFrame()

    logger.warning("feeds_catalogue: %d shopping rows", len(shopping))

    shopping["_source"] = "shopping_product_stats"

    # NOTE: ProductGroupStats (catch-all vs. partitioned product groups) has no
    # equivalent — there is no ad_group_id/product-group concept in this
    # dataset. "Shopping campaign structure" has no automated signal anymore.

    return pd.concat([shopping, titles], ignore_index=True)


def _creative_content(account_id: str, dataset: str | None = None, lookback_days: int = 30) -> pd.DataFrame:
    t_ad = table("GOOGLEADS_AD", dataset)
    params = [account_param(account_id), cutoff_date_param(lookback_days)]

    # No separate AdGroup entity table — derive the ad-group list from the
    # latest known row per ad group in GOOGLEADS_AD. No ad_group_type column
    # exists either (DSA ad-group detection has no source anymore — see
    # _keyword_strategy).
    ad_group_sql = f"""
    SELECT
        AD_GROUP_ID     AS ad_group_id,
        CAMPAIGN_ID     AS campaign_id,
        AD_GROUP_NAME   AS ad_group_name,
        AD_GROUP_STATUS AS status
    FROM {t_ad}
    WHERE ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    {latest_row_qualifier("AD_GROUP_ID")}
    LIMIT 50
    """

    # Account-level type/status/approval breakdown. NOTE: ad_strength does not
    # exist in this export at all (not even as a weak proxy) — dropped.
    ad_sql = f"""
    SELECT
        AD_TYPE               AS type,
        AD_STATUS              AS status,
        AD_APPROVAL_STATUS     AS policy_approval_status,
        COUNT(DISTINCT AD_ID)  AS ad_count
    FROM {t_ad}
    WHERE ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY 1, 2, 3
    ORDER BY ad_count DESC
    """

    # Per-ad-group RSA presence and policy status. This is a daily fact table
    # (multiple rows per ad), so counts use COUNT(DISTINCT AD_ID), not COUNTIF(*).
    # AD_TYPE values are inconsistently cased/spaced (e.g. "Responsive search ad",
    # "DEMAND_GEN_VIDEO_RESPONSIVE_AD") — normalise before comparing. Rich media
    # is defined as "anything that isn't a text-only search ad format" rather
    # than an exact enum list, since the observed vocabulary doesn't match the
    # old GAQL constants closely enough to enumerate safely.
    _rsa = "UPPER(REPLACE(AD_TYPE, ' ', '_'))"
    rsa_per_adgroup_sql = f"""
    SELECT
        AD_GROUP_ID  AS ad_group_id,
        CAMPAIGN_ID  AS campaign_id,
        COUNT(DISTINCT IF({_rsa} = 'RESPONSIVE_SEARCH_AD' AND {_enum_eq("AD_STATUS", "ENABLED")}, AD_ID, NULL))
                                                                                AS enabled_rsa_count,
        COUNT(DISTINCT IF({_enum_eq("AD_STATUS", "ENABLED")}, AD_ID, NULL))    AS total_enabled_ads,
        COUNT(DISTINCT IF({_enum_eq("AD_APPROVAL_STATUS", "DISAPPROVED")} AND {_enum_eq("AD_STATUS", "ENABLED")}, AD_ID, NULL))
                                                                                AS disapproved_count,
        COUNT(DISTINCT IF({_rsa} NOT IN ('RESPONSIVE_SEARCH_AD', 'EXPANDED_DYNAMIC_SEARCH_AD'), AD_ID, NULL))
                                                                                AS rich_media_count
    FROM {t_ad}
    WHERE ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY ad_group_id, campaign_id
    """

    # Headline/description text is now flat scalar columns instead of a JSON
    # array — max 6 observable headline slots (HEADLINE, HEADLINE_PART_1/2/3,
    # LONG_HEADLINE, SHORT_HEADLINE) and max 3 description slots (DESCRIPTION,
    # DESCRIPTION_1/2), versus up to 15/4 in the old export. Thresholds below
    # are recalibrated for this ceiling — see specialist.py for the matching
    # pass/warn/fail criteria. NOTE: verified against live data that these
    # columns can come back completely empty for RSAs on some accounts (a
    # Supermetrics report-configuration gap) even though the ads exist —
    # specialist.py treats an all-zero result as a data gap, not a real fail.
    rsa_headline_sql = f"""
    SELECT
        COUNT(*)                                AS total_rsa_ads,
        COUNTIF(headline_count >= 5)            AS ads_5plus_headlines,
        COUNTIF(headline_count < 3)             AS ads_under_3_headlines,
        COUNTIF(description_count >= 2)         AS ads_2plus_descriptions,
        ROUND(AVG(headline_count), 1)           AS avg_headline_count,
        ROUND(AVG(description_count), 1)        AS avg_description_count,
        TRUE                                     AS _summary
    FROM (
        SELECT
            AD_ID,
            (IF(HEADLINE IS NOT NULL AND HEADLINE != '', 1, 0)
             + IF(HEADLINE_PART_1 IS NOT NULL AND HEADLINE_PART_1 != '', 1, 0)
             + IF(HEADLINE_PART_2 IS NOT NULL AND HEADLINE_PART_2 != '', 1, 0)
             + IF(HEADLINE_PART_3 IS NOT NULL AND HEADLINE_PART_3 != '', 1, 0)
             + IF(LONG_HEADLINE IS NOT NULL AND LONG_HEADLINE != '', 1, 0)
             + IF(SHORT_HEADLINE IS NOT NULL AND SHORT_HEADLINE != '', 1, 0))  AS headline_count,
            (IF(DESCRIPTION IS NOT NULL AND DESCRIPTION != '', 1, 0)
             + IF(DESCRIPTION_1 IS NOT NULL AND DESCRIPTION_1 != '', 1, 0)
             + IF(DESCRIPTION_2 IS NOT NULL AND DESCRIPTION_2 != '', 1, 0))    AS description_count
        FROM {t_ad}
        WHERE {_rsa} = 'RESPONSIVE_SEARCH_AD'
          AND {_enum_eq("AD_STATUS", "ENABLED")}
          AND ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
        {latest_row_qualifier("AD_ID")}
    )
    """

    ad_groups = run_query(ad_group_sql, params)
    ads = run_query(ad_sql, params)

    try:
        rsa_per_adgroup = run_query(rsa_per_adgroup_sql, params)
        logger.warning("creative_content/rsa_per_adgroup: %d rows", len(rsa_per_adgroup))
        rsa_per_adgroup["_source"] = "rsa_per_adgroup"
    except Exception as exc:
        logger.warning("creative_content/rsa_per_adgroup failed: %s", exc)
        rsa_per_adgroup = pd.DataFrame()

    try:
        rsa_headlines = run_query(rsa_headline_sql, params)
        logger.warning("creative_content/rsa_headlines: %d rows", len(rsa_headlines))
        rsa_headlines["_source"] = "rsa_headline_summary"
    except Exception as exc:
        logger.warning("creative_content/rsa_headlines failed: %s", exc)
        rsa_headlines = pd.DataFrame()

    logger.warning("creative_content: %d ad groups, %d ad type rows", len(ad_groups), len(ads))

    ad_groups["_source"] = "ad_group"
    ads["_source"] = "ad"

    return pd.concat([ad_groups, ads, rsa_per_adgroup, rsa_headlines], ignore_index=True)


def _pmax_performance(account_id: str, dataset: str | None = None, lookback_days: int = 30) -> pd.DataFrame:
    t_campaign = table("GOOGLEADS_CAMPAIGN", dataset)
    params = [account_param(account_id), cutoff_date_param(lookback_days)]

    # with_target_roas/with_target_cpa are hardcoded 0 — no target_roas or
    # target_cpa column exists anywhere in this dataset (previously only
    # target_cpa was missing; now both are). "Smart bidding configuration"
    # regresses to a full manual-verification stub — see specialist.py.
    pmax_sql = f"""
    SELECT
        CAMPAIGN_STATUS                    AS status,
        BIDDING_STRATEGY_TYPE               AS campaign_bidding_strategy_type,
        COUNT(DISTINCT CAMPAIGN_ID)         AS campaign_count,
        0                                    AS with_target_roas,
        0                                    AS with_target_cpa
    FROM {t_campaign}
    WHERE {_enum_eq("ADVERTISING_CHANNEL_TYPE", "PERFORMANCE_MAX")}
      AND ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY 1, 2
    ORDER BY campaign_count DESC
    """

    all_campaigns_sql = f"""
    SELECT
        ADVERTISING_CHANNEL_TYPE AS campaign_advertising_channel_type,
        CAMPAIGN_STATUS          AS status,
        COUNT(DISTINCT CAMPAIGN_ID) AS campaign_count
    FROM {t_campaign}
    WHERE {_enum_eq("CAMPAIGN_STATUS", "ENABLED")}
      AND ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    GROUP BY 1, 2
    """

    pmax = run_query(pmax_sql, params)
    pmax["_source"] = "pmax_campaign"

    all_campaigns = run_query(all_campaigns_sql, params)
    all_campaigns["_source"] = "all_campaigns"

    logger.warning("pmax_performance: %d pmax status rows, %d all-campaign rows", len(pmax), len(all_campaigns))

    # NOTE: brand-exclusion checks (CampaignCriterion), asset ad_strength
    # (Ad.ad_strength — gone entirely, not even as a proxy), and PMax audience
    # signals (AssetGroupAudienceView / CampaignAudience — both gone) have no
    # data source left in this dataset. Only "PMax campaign adoption" stays
    # genuinely automated in this category; the rest score as
    # manual-verification stubs in the specialist prompt.

    return pd.concat([pmax, all_campaigns], ignore_index=True)


def _keyword_strategy(account_id: str, dataset: str | None = None, lookback_days: int = 30) -> pd.DataFrame:
    t_keyword = table("GOOGLEADS_KEYWORD", dataset)
    t_campaign = table("GOOGLEADS_CAMPAIGN", dataset)
    params = [account_param(account_id), cutoff_date_param(lookback_days)]

    # GOOGLEADS_KEYWORD has no campaign_id — join to campaign by name (+account,
    # to avoid name collisions across blended accounts) to recover bidding
    # strategy type. It also has no is_negative flag: this report only
    # contains positive/active keywords, so the old negative/positive split
    # is gone (see negative-keyword-coverage note below).
    keyword_sql = f"""
    WITH campaign_bidding AS (
        SELECT DISTINCT CAMPAIGN_NAME, BIDDING_STRATEGY_TYPE
        FROM {t_campaign}
        WHERE ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    )
    SELECT
        kw.MATCH_TYPE               AS match_type,
        kw.KEYWORD_STATUS           AS status,
        cb.BIDDING_STRATEGY_TYPE    AS bidding_strategy_type,
        COUNT(DISTINCT kw.KEYWORD_ID)                          AS keyword_count,
        ROUND(AVG(NULLIF(kw.QUALITY_SCORE, 0)), 1)             AS avg_quality_score
    FROM {t_keyword} kw
    LEFT JOIN campaign_bidding cb ON kw.CAMPAIGN_NAME = cb.CAMPAIGN_NAME
    WHERE kw.ACCOUNT_ID = @account_id AND kw.DATE >= @cutoff_date
    GROUP BY 1, 2, 3
    ORDER BY keyword_count DESC
    """

    # Quality score and impressions are on the same row now — no join to a
    # separate KeywordBasicStats table needed (simpler than the old schema).
    impression_qs_sql = f"""
    SELECT
        ROUND(SAFE_DIVIDE(SUM(QUALITY_SCORE * IMPRESSIONS), SUM(IMPRESSIONS)), 1)
                                                             AS impression_weighted_avg_qs,
        COUNTIF(QUALITY_SCORE >= 7)                         AS keywords_qs_7plus,
        COUNTIF(QUALITY_SCORE <= 4)                         AS keywords_qs_4minus,
        COUNT(*)                                            AS total_keywords_with_qs,
        TRUE                                                AS _summary
    FROM {t_keyword}
    WHERE {_enum_eq("KEYWORD_STATUS", "ENABLED")}
      AND NULLIF(QUALITY_SCORE, 0) IS NOT NULL
      AND ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
    """

    adgroup_structure_sql = f"""
    SELECT
        COUNT(*)                             AS total_ad_groups,
        COUNTIF(kw_count > 50)               AS ad_groups_50plus_kw,
        COUNTIF(kw_count BETWEEN 16 AND 50)  AS ad_groups_16_to_50_kw,
        COUNTIF(kw_count <= 15)              AS ad_groups_15minus_kw,
        ROUND(AVG(kw_count), 1)              AS avg_kw_per_adgroup,
        MAX(kw_count)                        AS max_kw_per_adgroup,
        TRUE                                 AS _summary
    FROM (
        SELECT AD_GROUP_ID, COUNT(DISTINCT KEYWORD_ID) AS kw_count
        FROM {t_keyword}
        WHERE {_enum_eq("KEYWORD_STATUS", "ENABLED")}
          AND ACCOUNT_ID = @account_id AND DATE >= @cutoff_date
        GROUP BY AD_GROUP_ID
    )
    """

    keywords = run_query(keyword_sql, params)

    try:
        impression_qs = run_query(impression_qs_sql, params)
        qs_val = impression_qs["impression_weighted_avg_qs"].iloc[0] if not impression_qs.empty else None
        logger.warning("keyword_strategy/impression_qs: weighted_avg_qs=%s", qs_val)
        if qs_val is not None:
            impression_qs["qs_status_computed"] = (
                "fail" if qs_val < 5.5 else "warn" if qs_val < 7.0 else "pass"
            )
        impression_qs["_source"] = "impression_weighted_qs"
    except Exception as exc:
        logger.warning("keyword_strategy/impression_qs failed: %s", exc)
        impression_qs = pd.DataFrame()

    try:
        adgroup_structure = run_query(adgroup_structure_sql, params)
        logger.warning("keyword_strategy/adgroup_structure: %d total ad groups",
                       adgroup_structure["total_ad_groups"].iloc[0] if not adgroup_structure.empty else 0)
        adgroup_structure["_source"] = "adgroup_kw_structure"
    except Exception as exc:
        logger.warning("keyword_strategy/adgroup_structure failed: %s", exc)
        adgroup_structure = pd.DataFrame()

    logger.warning("keyword_strategy: %d keyword aggregate rows", len(keywords))

    keywords["_source"] = "keyword"

    # NOTE: campaign-level negatives (CampaignCriterion), DSA ad-group detection
    # (no ad_group_type column), system_serving_status breakdown, and shared
    # negative lists (SharedSet) have no data source left in this dataset.
    # "Negative keyword coverage" loses all three of its old signals and
    # becomes a full stub; "Keyword status hygiene" and "DSA / dynamic ad
    # groups" weaken but stay partially automated — see specialist.py.

    return pd.concat([keywords, impression_qs, adgroup_structure], ignore_index=True)


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
