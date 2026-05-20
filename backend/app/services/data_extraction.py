"""
Extract structured audit data from BigQuery Google Ads tables.

Column naming follows the raw Google Ads API convention (e.g. campaign_status,
metrics_impressions, segments_date).

Partition strategy:
- Entity tables (Campaign, AdGroup, Keyword, etc.): use MAX(_PARTITIONTIME) to
  always get the most recent snapshot regardless of load frequency.
- Stats tables (BasicStats, ConversionStats, HourlyCampaignStats, etc.): use a
  30-day rolling window to capture time-series trends.

Sampling strategy:
- High-volume entity tables (Keyword: 670k rows, CampaignCriterion: 358k rows,
  Ad: 33k rows) are aggregated before sending to Gemini to avoid sampling bias
  and keep prompt tokens low.
"""
from __future__ import annotations

import logging

import pandas as pd

from app.services.bigquery import run_query, table

logger = logging.getLogger(__name__)


def _max_partition(tbl: str) -> str:
    """Return a WHERE clause selecting only the latest partition of an entity table."""
    return f"_PARTITIONTIME = (SELECT MAX(_PARTITIONTIME) FROM {tbl})"


def _campaign_setup(suffix: str, dataset: str | None = None) -> pd.DataFrame:
    t_campaign = table("p_ads_Campaign", suffix, dataset)
    t_hourly = table("p_ads_HourlyCampaignStats", suffix, dataset)
    t_criteria = table("p_ads_CampaignCriterion", suffix, dataset)

    # Budget fields are denormalised into p_ads_Campaign — no JOINs needed.
    # LIMIT 50: account has ~1k campaigns; Gemini needs a representative sample.
    campaign_sql = f"""
    SELECT
        campaign_id,
        campaign_name,
        campaign_status                                AS status,
        campaign_advertising_channel_type,
        campaign_advertising_channel_sub_type,
        campaign_bidding_strategy_type,
        campaign_maximize_conversion_value_target_roas AS target_roas,
        campaign_start_date                            AS start_date,
        campaign_end_date                              AS end_date,
        campaign_budget_amount_micros                  AS budget_amount_micros,
        campaign_budget_has_recommended_budget         AS has_recommended_budget
    FROM {t_campaign}
    WHERE {_max_partition(t_campaign)}
    LIMIT 50
    """

    # Aggregate across all campaigns: 168 rows max (7 days × 24 hours).
    hourly_sql = f"""
    SELECT
        segments_day_of_week        AS day_of_week,
        segments_hour               AS hour,
        SUM(metrics_cost_micros)    AS cost_micros,
        SUM(metrics_conversions)    AS conversions,
        SUM(metrics_clicks)         AS clicks,
        SUM(metrics_impressions)    AS impressions
    FROM {t_hourly}
    WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    GROUP BY segments_day_of_week, segments_hour
    """

    # Single-row summary: tells Gemini whether dayparting (AD_SCHEDULE) is configured.
    adschedule_sql = f"""
    SELECT
        COUNT(DISTINCT campaign_id) AS campaigns_with_adschedule,
        COUNT(*)                    AS total_adschedule_entries,
        TRUE                        AS _summary
    FROM {t_criteria}
    WHERE campaign_criterion_type = 'AD_SCHEDULE'
      AND campaign_criterion_negative = FALSE
      AND {_max_partition(t_criteria)}
    """

    campaigns = run_query(campaign_sql)
    logger.warning("campaign_setup/campaign: %d rows", len(campaigns))
    campaigns["_source"] = "campaign"

    try:
        hourly = run_query(hourly_sql)
        logger.warning("campaign_setup/hourly_stats: %d rows", len(hourly))
        hourly["_source"] = "hourly_stats"
    except Exception as exc:
        logger.warning("campaign_setup/hourly_stats failed: %s", exc)
        hourly = pd.DataFrame()

    try:
        adschedule = run_query(adschedule_sql)
        logger.warning("campaign_setup/adschedule: %d campaigns with schedule", adschedule["campaigns_with_adschedule"].iloc[0] if not adschedule.empty else 0)
        adschedule["_source"] = "adschedule_summary"
    except Exception as exc:
        logger.warning("campaign_setup/adschedule failed: %s", exc)
        adschedule = pd.DataFrame()

    return pd.concat([campaigns, hourly, adschedule], ignore_index=True)


def _audience_targeting(suffix: str, dataset: str | None = None) -> pd.DataFrame:
    t_audience = table("p_ads_CampaignAudience", suffix, dataset)
    t_criteria = table("p_ads_CampaignCriterion", suffix, dataset)
    t_gender = table("p_ads_Gender", suffix, dataset)
    t_age = table("p_ads_AgeRange", suffix, dataset)

    audiences_sql = f"""
    SELECT
        campaign_id,
        campaign_criterion_criterion_id AS audience_id,
        campaign_criterion_bid_modifier AS bid_modifier
    FROM {t_audience}
    WHERE {_max_partition(t_audience)}
    """

    # Aggregate 358k criteria rows to a ~20-row type breakdown.
    criteria_sql = f"""
    SELECT
        campaign_criterion_type     AS criterion_type,
        campaign_criterion_negative AS negative,
        COUNT(*)                    AS count
    FROM {t_criteria}
    WHERE {_max_partition(t_criteria)}
    GROUP BY campaign_criterion_type, campaign_criterion_negative
    ORDER BY count DESC
    """

    demo_sql = f"""
    SELECT
        campaign_id,
        ad_group_criterion_gender_type  AS demographic_type,
        ad_group_criterion_bid_modifier AS bid_modifier,
        ad_group_criterion_negative     AS negative,
        'gender'                        AS demo_category
    FROM {t_gender}
    WHERE {_max_partition(t_gender)}
    UNION ALL
    SELECT
        campaign_id,
        ad_group_criterion_age_range_type AS demographic_type,
        ad_group_criterion_bid_modifier   AS bid_modifier,
        ad_group_criterion_negative       AS negative,
        'age_range'                       AS demo_category
    FROM {t_age}
    WHERE {_max_partition(t_age)}
    """

    audiences = run_query(audiences_sql)
    criteria = run_query(criteria_sql)
    demographics = run_query(demo_sql)

    logger.warning(
        "audience_targeting: %d audiences, %d criteria types, %d demographics",
        len(audiences), len(criteria), len(demographics),
    )

    audiences["_source"] = "campaign_audience"
    criteria["_source"] = "campaign_criterion"
    demographics["_source"] = "demographics"

    return pd.concat([audiences, criteria, demographics], ignore_index=True)


def _conversion_kpi(suffix: str, dataset: str | None = None) -> pd.DataFrame:
    t_stats = table("p_ads_CampaignBasicStats", suffix, dataset)
    t_conv = table("p_ads_CampaignConversionStats", suffix, dataset)

    stats_sql = f"""
    SELECT
        campaign_id,
        segments_date             AS date,
        metrics_impressions       AS impressions,
        metrics_clicks            AS clicks,
        metrics_cost_micros       AS cost_micros,
        metrics_conversions       AS conversions,
        metrics_conversions_value AS conversions_value,
        SAFE_DIVIDE(metrics_conversions_value,
            SAFE_DIVIDE(metrics_cost_micros, 1e6)) AS roas,
        SAFE_DIVIDE(SAFE_DIVIDE(metrics_cost_micros, 1e6),
            NULLIF(metrics_conversions, 0)) AS cpa
    FROM {t_stats}
    WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    """

    conv_sql = f"""
    SELECT
        campaign_id,
        segments_conversion_action_name     AS conversion_name,
        segments_conversion_action_category AS conversion_category,
        metrics_conversions                 AS conversions,
        metrics_conversions_value           AS conversions_value
    FROM {t_conv}
    WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    """

    stats = run_query(stats_sql)
    convs = run_query(conv_sql)

    logger.warning("conversion_kpi: %d stats rows, %d conversion rows", len(stats), len(convs))

    stats["_source"] = "campaign_basic_stats"
    convs["_source"] = "campaign_conversion_stats"

    return pd.concat([stats, convs], ignore_index=True)


def _feeds_catalogue(suffix: str, dataset: str | None = None) -> pd.DataFrame:
    t_shopping = table("p_ads_ShoppingProductStats", suffix, dataset)
    t_groups = table("p_ads_ProductGroupStats", suffix, dataset)

    shopping_sql = f"""
    SELECT
        campaign_id,
        segments_product_brand   AS product_brand,
        segments_product_channel AS product_channel,
        SUM(metrics_impressions) AS impressions,
        SUM(metrics_clicks)      AS clicks,
        SUM(metrics_cost_micros) AS cost_micros,
        SUM(metrics_conversions) AS conversions
    FROM {t_shopping}
    WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    GROUP BY campaign_id, segments_product_brand, segments_product_channel
    """

    product_group_sql = f"""
    SELECT
        campaign_id,
        ad_group_id,
        ad_group_criterion_criterion_id AS product_group_criterion_id,
        SUM(metrics_impressions)        AS impressions,
        SUM(metrics_clicks)             AS clicks,
        SUM(metrics_cost_micros)        AS cost_micros
    FROM {t_groups}
    WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    GROUP BY campaign_id, ad_group_id, ad_group_criterion_criterion_id
    """

    shopping = run_query(shopping_sql)
    product_groups = run_query(product_group_sql)

    logger.warning("feeds_catalogue: %d shopping rows, %d product group rows", len(shopping), len(product_groups))

    shopping["_source"] = "shopping_product_stats"
    product_groups["_source"] = "product_group_stats"

    return pd.concat([shopping, product_groups], ignore_index=True)


def _creative_content(suffix: str, dataset: str | None = None) -> pd.DataFrame:
    t_adgroup = table("p_ads_AdGroup", suffix, dataset)
    t_ad = table("p_ads_Ad", suffix, dataset)

    ad_group_sql = f"""
    SELECT
        ad_group_id,
        campaign_id,
        ad_group_name,
        ad_group_status AS status,
        ad_group_type
    FROM {t_adgroup}
    WHERE {_max_partition(t_adgroup)}
    LIMIT 50
    """

    # Aggregate 33k ad rows to a ~25-row type/status/strength breakdown.
    ad_sql = f"""
    SELECT
        ad_group_ad_ad_type                        AS type,
        ad_group_ad_status                         AS status,
        ad_group_ad_ad_strength                    AS ad_strength,
        ad_group_ad_policy_summary_approval_status AS policy_approval_status,
        COUNT(*)                                   AS ad_count
    FROM {t_ad}
    WHERE {_max_partition(t_ad)}
    GROUP BY 1, 2, 3, 4
    ORDER BY ad_count DESC
    """

    ad_groups = run_query(ad_group_sql)
    ads = run_query(ad_sql)

    logger.warning("creative_content: %d ad groups, %d ad type rows", len(ad_groups), len(ads))

    ad_groups["_source"] = "ad_group"
    ads["_source"] = "ad"

    return pd.concat([ad_groups, ads], ignore_index=True)


def _pmax_performance(suffix: str, dataset: str | None = None) -> pd.DataFrame:
    t_campaign = table("p_ads_Campaign", suffix, dataset)
    t_ad = table("p_ads_Ad", suffix, dataset)
    t_audience = table("p_ads_CampaignAudience", suffix, dataset)

    # Aggregate PMax campaigns by status so Gemini sees total counts, not a 12-row sample.
    pmax_sql = f"""
    SELECT
        campaign_status                                   AS status,
        campaign_bidding_strategy_type,
        COUNT(*)                                          AS campaign_count,
        COUNTIF(campaign_maximize_conversion_value_target_roas > 0) AS with_target_roas
    FROM {t_campaign}
    WHERE campaign_advertising_channel_type = 'PERFORMANCE_MAX'
      AND {_max_partition(t_campaign)}
    GROUP BY 1, 2
    ORDER BY campaign_count DESC
    """

    all_campaigns_sql = f"""
    SELECT
        campaign_advertising_channel_type,
        campaign_status AS status,
        COUNT(*) AS campaign_count
    FROM {t_campaign}
    WHERE campaign_status = 'ENABLED'
      AND {_max_partition(t_campaign)}
    GROUP BY 1, 2
    """

    asset_sql = f"""
    SELECT
        ad_group_ad_ad_type     AS type,
        ad_group_ad_ad_strength AS ad_strength,
        ad_group_ad_status      AS status,
        COUNT(*)                AS asset_count
    FROM {t_ad}
    WHERE ad_group_ad_ad_type IN ('RESPONSIVE_DISPLAY_AD', 'APP_AD', 'SHOPPING_PRODUCT_AD')
      AND {_max_partition(t_ad)}
    GROUP BY 1, 2, 3
    """

    # PMax audience signals are attached to asset groups, not campaigns.
    # Try p_ads_AssetGroupAudienceView first; fall back to CampaignAudience filtered to PMax.
    t_assetgroup_audience = table("p_ads_AssetGroupAudienceView", suffix, dataset)
    audience_sql = f"""
    SELECT
        campaign_id,
        COUNT(DISTINCT asset_group_id)                          AS asset_groups_with_signals,
        COUNT(DISTINCT audience_view_user_list_user_list)        AS audience_signal_count
    FROM {t_assetgroup_audience}
    WHERE {_max_partition(t_assetgroup_audience)}
    GROUP BY campaign_id
    """
    audience_sql_fallback = f"""
    SELECT
        a.campaign_id,
        COUNT(DISTINCT a.campaign_criterion_criterion_id) AS audience_signal_count
    FROM {t_audience} a
    INNER JOIN (
        SELECT campaign_id
        FROM {t_campaign}
        WHERE campaign_advertising_channel_type = 'PERFORMANCE_MAX'
          AND {_max_partition(t_campaign)}
    ) pmax USING (campaign_id)
    WHERE {_max_partition(t_audience)}
    GROUP BY a.campaign_id
    """

    pmax = run_query(pmax_sql)
    pmax["_source"] = "pmax_campaign"

    all_campaigns = run_query(all_campaigns_sql)
    all_campaigns["_source"] = "all_campaigns"

    try:
        assets = run_query(asset_sql)
        assets["_source"] = "pmax_asset"
    except Exception as exc:
        logger.warning("pmax_performance/assets failed: %s", exc)
        assets = pd.DataFrame()

    try:
        audiences = run_query(audience_sql)
        audiences["_source"] = "pmax_audience_signals"
        logger.warning("pmax_performance/audiences via AssetGroupAudienceView: %d rows", len(audiences))
    except Exception:
        try:
            audiences = run_query(audience_sql_fallback)
            audiences["_source"] = "pmax_audience_signals"
            logger.warning("pmax_performance/audiences via CampaignAudience fallback: %d rows", len(audiences))
        except Exception as exc:
            logger.warning("pmax_performance/audiences failed both queries: %s", exc)
            audiences = pd.DataFrame()

    logger.warning(
        "pmax_performance: %d pmax status rows, %d with audience signals",
        len(pmax), len(audiences),
    )

    return pd.concat([pmax, all_campaigns, assets, audiences], ignore_index=True)


def _keyword_strategy(suffix: str, dataset: str | None = None) -> pd.DataFrame:
    t_keyword = table("p_ads_Keyword", suffix, dataset)
    t_criteria = table("p_ads_CampaignCriterion", suffix, dataset)
    t_adgroup = table("p_ads_AdGroup", suffix, dataset)

    # Aggregate 670k keyword rows to a ~30-row breakdown. This avoids the sampling
    # bias where negatives (518k) dominate a raw row sample, hiding positive keywords.
    keyword_sql = f"""
    SELECT
        ad_group_criterion_negative            AS is_negative,
        ad_group_criterion_keyword_match_type  AS match_type,
        ad_group_criterion_status              AS status,
        campaign_bidding_strategy_type         AS bidding_strategy_type,
        COUNT(*)                               AS keyword_count,
        ROUND(AVG(NULLIF(ad_group_criterion_quality_info_quality_score, 0)), 1)
                                               AS avg_quality_score,
        COUNTIF(ad_group_criterion_approval_status = 'DISAPPROVED')
                                               AS disapproved_count
    FROM {t_keyword}
    WHERE {_max_partition(t_keyword)}
    GROUP BY 1, 2, 3, 4
    ORDER BY keyword_count DESC
    """

    campaign_neg_sql = f"""
    SELECT
        COUNT(DISTINCT campaign_id) AS campaigns_with_negatives,
        SUM(1)                      AS total_campaign_negative_keywords,
        TRUE                        AS _summary
    FROM {t_criteria}
    WHERE campaign_criterion_negative = TRUE
      AND {_max_partition(t_criteria)}
    """

    dsa_sql = f"""
    SELECT
        campaign_id,
        ad_group_id,
        ad_group_type
    FROM {t_adgroup}
    WHERE ad_group_type = 'SEARCH_DYNAMIC_ADS'
      AND {_max_partition(t_adgroup)}
    """

    keywords = run_query(keyword_sql)
    campaign_negs = run_query(campaign_neg_sql)
    dsa_groups = run_query(dsa_sql)

    logger.warning(
        "keyword_strategy: %d keyword aggregate rows, %d campaign neg rows, %d DSA groups",
        len(keywords), len(campaign_negs), len(dsa_groups),
    )

    keywords["_source"] = "keyword"
    campaign_negs["_source"] = "campaign_negatives_summary"
    dsa_groups["_source"] = "dsa_ad_groups"

    return pd.concat([keywords, campaign_negs, dsa_groups], ignore_index=True)


def extract_audit_data(suffix: str, dataset: str | None = None) -> dict[str, pd.DataFrame]:
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
        "pmax_performance": _pmax_performance,
    }

    results: dict[str, pd.DataFrame] = {}
    for name, fn in extractors.items():
        try:
            results[name] = fn(suffix, dataset)
        except Exception as exc:
            logger.warning("extract_audit_data: %s FAILED — %s", name, exc)
            results[name] = pd.DataFrame({"_error": [str(exc)]})

    return results
