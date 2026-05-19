"""
Extract structured audit data from BigQuery Google Ads tables.

Each function targets one of the five audit categories and returns a
pandas DataFrame.  The combined result is a dict keyed by category name,
consumed by the specialist agent service.
"""
from __future__ import annotations

import pandas as pd

from app.services.bigquery import run_query, table


def _campaign_setup(suffix: str) -> pd.DataFrame:
    sql = f"""
    SELECT
        c.campaign_id,
        c.campaign_name,
        c.status,
        c.advertising_channel_type,
        c.advertising_channel_sub_type,
        c.bidding_strategy_type,
        c.target_cpa_micros,
        c.target_roas,
        c.start_date,
        c.end_date,
        b.budget_amount_micros,
        b.has_recommended_budget,
        bg.type            AS bid_goal_type,
        bg.target_cpa_micros AS bid_goal_cpa,
        bg.target_roas     AS bid_goal_roas
    FROM {table("p_ads_Campaign", suffix)} c
    LEFT JOIN {table("p_ads_Budget", suffix)} b
        ON c.campaign_budget_id = b.budget_id
    LEFT JOIN {table("p_ads_BidGoal", suffix)} bg
        ON c.campaign_id = bg.campaign_id
    """
    return run_query(sql)


def _audience_targeting(suffix: str) -> pd.DataFrame:
    """Combines audience segments, demographics, geo, and placement targeting."""
    # Campaign-level audience segments (no standalone audience catalog in this dataset)
    audiences_sql = f"""
    SELECT
        campaign_id,
        campaign_name,
        user_list_id  AS audience_id,
        bid_modifier
    FROM {table("p_ads_CampaignAudience", suffix)}
    """

    # Criteria: geo, device, keyword negatives
    criteria_sql = f"""
    SELECT
        campaign_id,
        criterion_type,
        location_name,
        device,
        keyword_text,
        negative
    FROM {table("p_ads_CampaignCriterion", suffix)}
    """

    # Demographics
    demo_sql = f"""
    SELECT campaign_id, gender_type, impressions, clicks, cost_micros
    FROM {table("p_ads_Gender", suffix)}
    UNION ALL
    SELECT campaign_id, age_range_type AS gender_type, impressions, clicks, cost_micros
    FROM {table("p_ads_AgeRange", suffix)}
    """

    audiences = run_query(audiences_sql)
    criteria = run_query(criteria_sql)
    demographics = run_query(demo_sql)

    # Tag each frame with its source so the specialist knows what it's reading
    audiences["_source"] = "campaign_audience"
    criteria["_source"] = "campaign_criterion"
    demographics["_source"] = "demographics"

    return pd.concat([audiences, criteria, demographics], ignore_index=True)


def _conversion_kpi(suffix: str) -> pd.DataFrame:
    """Campaign-level stats + conversion breakdown + pre-computed structural audit."""
    stats_sql = f"""
    SELECT
        campaign_id,
        campaign_name,
        date,
        impressions,
        clicks,
        cost_micros,
        conversions,
        conversions_value,
        SAFE_DIVIDE(conversions_value, SAFE_DIVIDE(cost_micros, 1e6)) AS roas,
        SAFE_DIVIDE(SAFE_DIVIDE(cost_micros, 1e6), NULLIF(conversions, 0)) AS cpa
    FROM {table("p_ads_CampaignBasicStats", suffix)}
    """

    conv_sql = f"""
    SELECT
        campaign_id,
        conversion_name,
        conversion_category,
        conversions,
        conversions_value
    FROM {table("p_ads_CampaignConversionStats", suffix)}
    """

    # Pre-computed structural audit view — may already surface issues
    structural_sql = f"""
    SELECT *
    FROM `{_structural_view(suffix)}`
    LIMIT 500
    """

    stats = run_query(stats_sql)
    convs = run_query(conv_sql)

    try:
        structural = run_query(structural_sql)
        structural["_source"] = "structural_audit"
    except Exception:
        structural = pd.DataFrame()

    stats["_source"] = "campaign_basic_stats"
    convs["_source"] = "campaign_conversion_stats"

    return pd.concat([stats, convs, structural], ignore_index=True)


def _feeds_catalogue(suffix: str) -> pd.DataFrame:
    shopping_sql = f"""
    SELECT
        campaign_id,
        product_title,
        product_brand,
        product_channel,
        impressions,
        clicks,
        cost_micros,
        conversions
    FROM {table("p_ads_ShoppingProductStats", suffix)}
    """

    product_group_sql = f"""
    SELECT
        campaign_id,
        product_group_criterion_id,
        impressions,
        clicks,
        cost_micros,
        conversions
    FROM {table("p_ads_ProductGroupStats", suffix)}
    """

    shopping = run_query(shopping_sql)
    product_groups = run_query(product_group_sql)

    shopping["_source"] = "shopping_product_stats"
    product_groups["_source"] = "product_group_stats"

    return pd.concat([shopping, product_groups], ignore_index=True)


def _creative_content(suffix: str) -> pd.DataFrame:
    ad_group_sql = f"""
    SELECT
        ad_group_id,
        campaign_id,
        name   AS ad_group_name,
        status,
        type   AS ad_group_type
    FROM {table("p_ads_AdGroup", suffix)}
    """

    ad_sql = f"""
    SELECT
        ad_id,
        campaign_id,
        ad_group_id,
        type,
        status,
        final_urls
    FROM {table("p_ads_Ad", suffix)}
    """

    ad_groups = run_query(ad_group_sql)
    ads = run_query(ad_sql)

    ad_groups["_source"] = "ad_group"
    ads["_source"] = "ad"

    return pd.concat([ad_groups, ads], ignore_index=True)


def _structural_view(suffix: str) -> str:
    """Return the dataset-qualified name of the structural audit view."""
    from app.config import GCP_PROJECT, BQ_DATASET
    return f"{GCP_PROJECT}.{BQ_DATASET}.v_structural_audit_{suffix}"


def extract_audit_data(suffix: str) -> dict[str, pd.DataFrame]:
    """
    Run all five category extractions and return a dict of DataFrames.
    Any category that fails is returned as an empty DataFrame so the pipeline
    can continue and flag the gap rather than crashing.
    """
    extractors = {
        "campaign_setup": _campaign_setup,
        "audience_targeting": _audience_targeting,
        "conversion_kpi": _conversion_kpi,
        "feeds_catalogue": _feeds_catalogue,
        "creative_content": _creative_content,
    }

    results: dict[str, pd.DataFrame] = {}
    for name, fn in extractors.items():
        try:
            results[name] = fn(suffix)
        except Exception as exc:
            results[name] = pd.DataFrame({"_error": [str(exc)]})

    return results
