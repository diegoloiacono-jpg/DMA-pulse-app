"""
Validation queries for DMA Pulse audit criteria.
Run: uv run --with google-cloud-bigquery --with tabulate validate_bq.py <category>
Categories: campaign_setup, audience_targeting, conversion_kpi, feeds_catalogue,
            creative_content, keyword_strategy, pmax_performance
"""
import sys
from google.cloud import bigquery

PROJECT = "coi-innovation-testing-8166"
DATASET = "bwj_google_ads"
SUFFIX = "6600502562"

client = bigquery.Client(project=PROJECT)


def t(name):
    return f"`{PROJECT}.{DATASET}.{name}_{SUFFIX}`"


def mp(tbl):
    return f"_PARTITIONTIME = (SELECT MAX(_PARTITIONTIME) FROM {tbl})"


def run(label, sql):
    print(f"\n{'='*60}")
    print(f"  {label}")
    print('='*60)
    try:
        rows = list(client.query(sql).result())
        if not rows:
            print("  (no rows)")
            return
        keys = rows[0].keys()
        # header
        print("  " + " | ".join(str(k).ljust(28) for k in keys))
        print("  " + "-" * (31 * len(list(keys))))
        for r in rows:
            print("  " + " | ".join(str(r[k]).ljust(28) for k in keys))
    except Exception as e:
        print(f"  ERROR: {e}")


# ── Category 1: Campaign Setup ──────────────────────────────────────────────

def campaign_setup():
    run("1a — Campaign list (naming, status, bidding, budget)", f"""
SELECT
  campaign_id,
  campaign_name,
  campaign_status                                         AS status,
  campaign_advertising_channel_type,
  campaign_bidding_strategy_type,
  campaign_budget_has_recommended_budget                  AS has_recommended_budget,
  ROUND(campaign_budget_amount_micros / 1e6, 2)           AS budget_daily_usd
FROM {t("p_ads_Campaign")}
WHERE {mp(t("p_ads_Campaign"))}
ORDER BY status, campaign_advertising_channel_type
LIMIT 50
""")

    run("1b — Performance last 30 days (status hygiene + bidding + budget)", f"""
SELECT
  campaign_id,
  SUM(metrics_impressions)                                AS impressions_30d,
  SUM(CASE WHEN DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
           THEN metrics_impressions ELSE 0 END)           AS impressions_7d,
  SUM(metrics_conversions)                               AS conversions_30d,
  ROUND(SUM(metrics_cost_micros) / 1e6, 2)              AS cost_30d_usd
FROM {t("p_ads_CampaignBasicStats")}
WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY campaign_id
ORDER BY impressions_30d DESC
""")

    run("1c — Ad schedule summary", f"""
SELECT
  COUNT(DISTINCT campaign_id)  AS campaigns_with_adschedule,
  COUNT(*)                     AS total_adschedule_entries
FROM {t("p_ads_CampaignCriterion")}
WHERE campaign_criterion_type = 'AD_SCHEDULE'
  AND campaign_criterion_negative = FALSE
  AND {mp(t("p_ads_CampaignCriterion"))}
""")


# ── Category 2: Audience Targeting ──────────────────────────────────────────

def audience_targeting():
    run("2a — Geo target type breakdown", f"""
SELECT
  campaign_geo_target_type  AS geo_target_type,
  COUNT(*)                  AS campaign_count
FROM {t("p_ads_Campaign")}
WHERE campaign_status = 'ENABLED'
  AND {mp(t("p_ads_Campaign"))}
GROUP BY campaign_geo_target_type
ORDER BY campaign_count DESC
""")

    run("2b — Criterion type breakdown", f"""
SELECT
  campaign_criterion_type     AS criterion_type,
  campaign_criterion_negative AS negative,
  COUNT(*)                    AS count
FROM {t("p_ads_CampaignCriterion")}
WHERE {mp(t("p_ads_CampaignCriterion"))}
GROUP BY criterion_type, negative
ORDER BY count DESC
LIMIT 20
""")

    run("2c — Demographics (gender & age)", f"""
SELECT 'gender' AS demo_category, ad_group_criterion_gender_type AS demo_type, COUNT(*) AS cnt
FROM {t("p_ads_Gender")}
WHERE {mp(t("p_ads_Gender"))}
GROUP BY demo_type
UNION ALL
SELECT 'age_range', ad_group_criterion_age_range_type, COUNT(*)
FROM {t("p_ads_AgeRange")}
WHERE {mp(t("p_ads_AgeRange"))}
GROUP BY ad_group_criterion_age_range_type
""")


# ── Category 3: Conversion & KPI ────────────────────────────────────────────

def conversion_kpi():
    run("3a — Conversion actions", f"""
SELECT
  conversion_action_name                                                       AS name,
  conversion_action_status                                                     AS status,
  conversion_action_primary_for_goal                                           AS primary_for_goal,
  conversion_action_attribution_model_settings_attribution_model               AS attribution_model,
  conversion_action_include_in_conversions_metric                              AS include_in_conversions,
  conversion_action_category                                                   AS category
FROM {t("p_ads_ConversionAction")}
WHERE conversion_action_status != 'REMOVED'
  AND {mp(t("p_ads_ConversionAction"))}
""")

    run("3b — Campaign targets vs actuals (30d)", f"""
SELECT
  c.campaign_id,
  c.campaign_bidding_strategy_type                                             AS bidding_strategy,
  c.campaign_maximize_conversion_value_target_roas                             AS target_roas,
  ROUND(c.campaign_target_cpa_cpa_micros / 1e6, 2)                            AS target_cpa_usd,
  ROUND(SAFE_DIVIDE(SUM(s.metrics_conversions_value),
        SUM(s.metrics_cost_micros/1e6)), 2)                                    AS actual_roas_30d,
  ROUND(SAFE_DIVIDE(SUM(s.metrics_cost_micros/1e6),
        NULLIF(SUM(s.metrics_conversions),0)), 2)                              AS actual_cpa_30d,
  SUM(s.metrics_conversions)                                                   AS conversions_30d
FROM {t("p_ads_Campaign")} c
LEFT JOIN {t("p_ads_CampaignBasicStats")} s
  ON c.campaign_id = s.campaign_id
  AND DATE(s._PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
WHERE c.campaign_status = 'ENABLED'
  AND c.{mp(t("p_ads_Campaign"))}
GROUP BY 1,2,3,4
""")


# ── Category 4: Feeds & Catalogue ───────────────────────────────────────────

def feeds_catalogue():
    run("4a — Custom label usage per campaign", f"""
SELECT
  campaign_id,
  COUNTIF(segments_product_custom_attribute_0 IS NOT NULL
    AND segments_product_custom_attribute_0 != '') AS rows_with_label_0,
  COUNTIF(segments_product_custom_attribute_1 IS NOT NULL
    AND segments_product_custom_attribute_1 != '') AS rows_with_label_1,
  COUNTIF(segments_product_custom_attribute_2 IS NOT NULL
    AND segments_product_custom_attribute_2 != '') AS rows_with_label_2,
  SUM(metrics_impressions) AS impressions
FROM {t("p_ads_ShoppingProductStats")}
WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY campaign_id
ORDER BY impressions DESC
LIMIT 20
""")

    run("4b — Product group partitioning per ad group", f"""
SELECT
  campaign_id,
  ad_group_id,
  COUNT(DISTINCT ad_group_criterion_criterion_id) AS product_group_count,
  SUM(metrics_impressions) AS impressions
FROM {t("p_ads_ProductGroupStats")}
WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY campaign_id, ad_group_id
ORDER BY impressions DESC
LIMIT 20
""")


# ── Category 5: Creative Content ────────────────────────────────────────────

def creative_content():
    run("5a — RSA coverage and strength per ad group", f"""
SELECT
  campaign_id,
  ad_group_id,
  COUNTIF(ad_group_ad_ad_type = 'RESPONSIVE_SEARCH_AD'
    AND ad_group_ad_status = 'ENABLED')                          AS enabled_rsa_count,
  COUNTIF(ad_group_ad_ad_type = 'RESPONSIVE_SEARCH_AD'
    AND ad_group_ad_status = 'ENABLED'
    AND ad_group_ad_ad_strength IN ('GOOD','EXCELLENT'))          AS good_excellent_rsa_count,
  COUNTIF(ad_group_ad_ad_type = 'RESPONSIVE_SEARCH_AD'
    AND ad_group_ad_status = 'ENABLED'
    AND ad_group_ad_ad_strength IN ('POOR','AVERAGE'))            AS poor_average_rsa_count
FROM {t("p_ads_Ad")}
WHERE {mp(t("p_ads_Ad"))}
GROUP BY campaign_id, ad_group_id
ORDER BY enabled_rsa_count DESC
LIMIT 30
""")


# ── Category 6: Keyword Strategy ────────────────────────────────────────────

def keyword_strategy():
    run("6a — Impression-weighted Quality Score", f"""
SELECT
  ROUND(SAFE_DIVIDE(
    SUM(kw.ad_group_criterion_quality_info_quality_score * s.impressions_30d),
    SUM(s.impressions_30d)
  ), 1) AS impression_weighted_avg_qs,
  COUNTIF(kw.ad_group_criterion_quality_info_quality_score >= 7) AS keywords_qs_7plus,
  COUNTIF(kw.ad_group_criterion_quality_info_quality_score <= 4) AS keywords_qs_4minus,
  COUNT(*) AS total_keywords_with_qs
FROM {t("p_ads_Keyword")} kw
INNER JOIN (
  SELECT ad_group_criterion_criterion_id, SUM(metrics_impressions) AS impressions_30d
  FROM {t("p_ads_KeywordBasicStats")}
  WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  GROUP BY ad_group_criterion_criterion_id
) s ON kw.ad_group_criterion_criterion_id = s.ad_group_criterion_criterion_id
WHERE kw.ad_group_criterion_status = 'ENABLED'
  AND kw.ad_group_criterion_negative = FALSE
  AND kw.ad_group_criterion_quality_info_quality_score IS NOT NULL
  AND kw.{mp(t("p_ads_Keyword"))}
""")

    run("6b — Serving status breakdown", f"""
SELECT
  ad_group_criterion_system_serving_status AS system_serving_status,
  COUNT(*) AS keyword_count
FROM {t("p_ads_Keyword")}
WHERE ad_group_criterion_status = 'ENABLED'
  AND ad_group_criterion_negative = FALSE
  AND {mp(t("p_ads_Keyword"))}
GROUP BY system_serving_status
ORDER BY keyword_count DESC
""")

    run("6c — Shared negative keyword lists", f"""
SELECT COUNT(*) AS shared_negative_list_count
FROM {t("p_ads_SharedSet")}
WHERE shared_set_type = 'NEGATIVE_KEYWORDS'
  AND shared_set_status = 'ENABLED'
  AND {mp(t("p_ads_SharedSet"))}
""")


# ── Category 7: PMax Performance ────────────────────────────────────────────

def pmax_performance():
    run("7a — PMax campaign overview", f"""
SELECT
  campaign_status                               AS status,
  campaign_bidding_strategy_type,
  COUNT(*)                                      AS campaign_count,
  COUNTIF(campaign_maximize_conversion_value_target_roas > 0) AS with_target_roas,
  COUNTIF(campaign_target_cpa_cpa_micros > 0)  AS with_target_cpa
FROM {t("p_ads_Campaign")}
WHERE campaign_advertising_channel_type = 'PERFORMANCE_MAX'
  AND {mp(t("p_ads_Campaign"))}
GROUP BY status, campaign_bidding_strategy_type
""")

    run("7b — Brand exclusions on PMax", f"""
SELECT
  COUNT(DISTINCT c.campaign_id)   AS total_enabled_pmax,
  COUNT(DISTINCT css.campaign_id) AS pmax_with_shared_neg_lists,
  COUNT(DISTINCT nc.campaign_id)  AS pmax_with_campaign_negatives
FROM (
  SELECT campaign_id FROM {t("p_ads_Campaign")}
  WHERE campaign_advertising_channel_type = 'PERFORMANCE_MAX'
    AND campaign_status = 'ENABLED'
    AND {mp(t("p_ads_Campaign"))}
) c
LEFT JOIN {t("p_ads_CampaignSharedSet")} css ON c.campaign_id = css.campaign_id
LEFT JOIN (
  SELECT DISTINCT campaign_id FROM {t("p_ads_CampaignCriterion")}
  WHERE campaign_criterion_negative = TRUE
    AND {mp(t("p_ads_CampaignCriterion"))}
) nc ON c.campaign_id = nc.campaign_id
""")

    run("7c — Asset group ad strength", f"""
SELECT
  ad_group_ad_ad_strength AS ad_strength,
  ad_group_ad_status      AS status,
  COUNT(*)                AS asset_count
FROM {t("p_ads_Ad")}
WHERE ad_group_ad_ad_type IN ('RESPONSIVE_DISPLAY_AD','APP_AD','SHOPPING_PRODUCT_AD')
  AND {mp(t("p_ads_Ad"))}
GROUP BY ad_strength, status
""")


CATEGORIES = {
    "campaign_setup": campaign_setup,
    "audience_targeting": audience_targeting,
    "conversion_kpi": conversion_kpi,
    "feeds_catalogue": feeds_catalogue,
    "creative_content": creative_content,
    "keyword_strategy": keyword_strategy,
    "pmax_performance": pmax_performance,
}

if __name__ == "__main__":
    cat = sys.argv[1] if len(sys.argv) > 1 else "campaign_setup"
    if cat not in CATEGORIES:
        print(f"Unknown category '{cat}'. Choose from: {', '.join(CATEGORIES)}")
        sys.exit(1)
    print(f"\n>>> Validating: {cat.upper()}")
    CATEGORIES[cat]()
    print("\nDone.")
