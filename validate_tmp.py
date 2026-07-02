from google.cloud import bigquery
client = bigquery.Client(project="coi-innovation-testing-8166")
P, D, S = "coi-innovation-testing-8166", "bwj_google_ads", "6600502562"

def t(n): return f"`{P}.{D}.{n}_{S}`"
def mp(tbl): return f"_PARTITIONTIME = (SELECT MAX(_PARTITIONTIME) FROM {tbl})"

# ── ai_readiness / 1: PMax campaign adoption ──────────────────────────────────
print("=== 1 — PMax campaign adoption ===")
sql = f"""
SELECT
  campaign_status                                                AS status,
  campaign_bidding_strategy_type,
  COUNT(*)                                                       AS campaign_count,
  COUNTIF(campaign_maximize_conversion_value_target_roas > 0)   AS with_target_roas
FROM {t("p_ads_Campaign")}
WHERE campaign_advertising_channel_type = 'PERFORMANCE_MAX'
  AND {mp(t("p_ads_Campaign"))}
GROUP BY 1, 2
ORDER BY campaign_count DESC
"""
rows = list(client.query(sql).result())
if rows:
    for r in rows:
        print(f"  status={r['status']} bidding={r['campaign_bidding_strategy_type']} "
              f"count={r['campaign_count']} with_target_roas={r['with_target_roas']}")
    enabled = sum(r['campaign_count'] for r in rows if r['status'] == 'ENABLED')
    print(f"  => ENABLED PMax: {enabled}  |  expected: {'pass' if enabled > 0 else 'fail'}")
else:
    print("  No PMax campaigns => fail")

# ── ai_readiness / 2: Asset group strength ────────────────────────────────────
print("\n=== 2 — Asset group strength (proxy from p_ads_Ad) ===")
sql = f"""
SELECT
  ad_group_ad_ad_type     AS type,
  ad_group_ad_ad_strength AS ad_strength,
  ad_group_ad_status      AS status,
  COUNT(*)                AS asset_count
FROM {t("p_ads_Ad")}
WHERE ad_group_ad_ad_type IN ('RESPONSIVE_DISPLAY_AD', 'APP_AD', 'SHOPPING_PRODUCT_AD')
  AND {mp(t("p_ads_Ad"))}
GROUP BY 1, 2, 3
ORDER BY asset_count DESC
"""
rows = list(client.query(sql).result())
if rows:
    for r in rows:
        print(f"  type={r['type']} strength={r['ad_strength']} "
              f"status={r['status']} count={r['asset_count']}")
    enabled = [r for r in rows if r['status'] == 'ENABLED']
    good_ex = sum(r['asset_count'] for r in enabled if r['ad_strength'] in ('GOOD', 'EXCELLENT'))
    poor_av = sum(r['asset_count'] for r in enabled if r['ad_strength'] in ('POOR', 'AVERAGE'))
    unspec  = sum(r['asset_count'] for r in enabled if r['ad_strength'] not in ('GOOD','EXCELLENT','POOR','AVERAGE'))
    print(f"  => ENABLED: good_excellent={good_ex}  poor_average={poor_av}  unspecified/null={unspec}")
    if poor_av == 0 and good_ex > 0:
        verdict = "pass"
    elif poor_av > good_ex:
        verdict = "fail"
    else:
        verdict = "warn"
    print(f"  => Expected verdict: {verdict}")
else:
    print("  No proxy assets => warn (data unavailable)")

# ── ai_readiness / 3: Audience signal quality ─────────────────────────────────
print("\n=== 3 — Audience signal quality ===")
sql_agav = f"""
SELECT
  campaign_id,
  COUNT(DISTINCT asset_group_id)                           AS asset_groups_with_signals,
  COUNT(DISTINCT audience_view_user_list_user_list)         AS audience_signal_count
FROM {t("p_ads_AssetGroupAudienceView")}
WHERE {mp(t("p_ads_AssetGroupAudienceView"))}
GROUP BY campaign_id
"""
try:
    rows = list(client.query(sql_agav).result())
    print("  Source: p_ads_AssetGroupAudienceView")
    if rows:
        for r in rows:
            print(f"  campaign={r['campaign_id']} signals={r['audience_signal_count']} "
                  f"asset_groups={r['asset_groups_with_signals']}")
        zeros = [r for r in rows if r['audience_signal_count'] == 0]
        print(f"  => Campaigns with 0 signals: {len(zeros)}/{len(rows)}")
        print(f"  => Expected: {'fail' if zeros else 'pass'}")
    else:
        print("  => Empty (0 rows) => warn / data gap")
except Exception as e:
    print(f"  AssetGroupAudienceView NOT FOUND: {type(e).__name__}")
    sql_fallback = f"""
    SELECT
      a.campaign_id,
      COUNT(DISTINCT a.campaign_criterion_criterion_id) AS audience_signal_count
    FROM {t("p_ads_CampaignAudience")} a
    INNER JOIN (
        SELECT campaign_id FROM {t("p_ads_Campaign")}
        WHERE campaign_advertising_channel_type = 'PERFORMANCE_MAX'
          AND {mp(t("p_ads_Campaign"))}
    ) pmax USING (campaign_id)
    WHERE {mp(t("p_ads_CampaignAudience"))}
    GROUP BY a.campaign_id
    """
    try:
        rows = list(client.query(sql_fallback).result())
        print("  Source: p_ads_CampaignAudience (fallback)")
        if rows:
            for r in rows:
                print(f"  campaign={r['campaign_id']} signals={r['audience_signal_count']}")
            zeros = [r for r in rows if r['audience_signal_count'] == 0]
            print(f"  => Expected: {'fail' if zeros else 'pass'}")
        else:
            print("  => 0 rows => warn / data gap")
    except Exception as e2:
        print(f"  Fallback also failed: {type(e2).__name__} => warn / data gap")

# ── ai_readiness / 4: Smart bidding configuration ─────────────────────────────
print("\n=== 4 — Smart bidding configuration ===")
sql = f"""
SELECT
  campaign_bidding_strategy_type,
  COUNT(*)                                                       AS campaign_count,
  COUNTIF(campaign_maximize_conversion_value_target_roas > 0)   AS with_target_roas
FROM {t("p_ads_Campaign")}
WHERE campaign_advertising_channel_type = 'PERFORMANCE_MAX'
  AND campaign_status = 'ENABLED'
  AND {mp(t("p_ads_Campaign"))}
GROUP BY 1
"""
rows = list(client.query(sql).result())
if rows:
    total = sum(r['campaign_count'] for r in rows)
    constrained = sum(r['with_target_roas'] for r in rows)
    for r in rows:
        print(f"  bidding={r['campaign_bidding_strategy_type']}  count={r['campaign_count']}  "
              f"with_target_roas={r['with_target_roas']}")
    print(f"  => Total ENABLED: {total}  constrained (tROAS): {constrained}  unconstrained: {total-constrained}")
    if constrained == 0:
        verdict = "fail"
    elif constrained < total:
        verdict = "warn"
    else:
        verdict = "pass"
    print(f"  => Expected verdict: {verdict}")
else:
    print("  No ENABLED PMax => fail")

# ── ai_readiness / 5: PMax vs. standard campaign balance ──────────────────────
print("\n=== 5 — PMax vs. standard campaign balance (brand exclusions) ===")
sql = f"""
SELECT
  COUNT(DISTINCT c.campaign_id)   AS total_enabled_pmax,
  0                               AS pmax_with_shared_neg_lists,
  COUNT(DISTINCT nc.campaign_id)  AS pmax_with_campaign_negatives
FROM (
    SELECT campaign_id FROM {t("p_ads_Campaign")}
    WHERE campaign_advertising_channel_type = 'PERFORMANCE_MAX'
      AND campaign_status = 'ENABLED'
      AND {mp(t("p_ads_Campaign"))}
) c
LEFT JOIN (
    SELECT DISTINCT campaign_id FROM {t("p_ads_CampaignCriterion")}
    WHERE campaign_criterion_negative = TRUE
      AND {mp(t("p_ads_CampaignCriterion"))}
) nc ON c.campaign_id = nc.campaign_id
"""
rows = list(client.query(sql).result())
if rows:
    r = rows[0]
    total  = r['total_enabled_pmax']
    with_neg = r['pmax_with_campaign_negatives']
    print(f"  total_enabled_pmax          : {total}")
    print(f"  pmax_with_shared_neg_lists  : {r['pmax_with_shared_neg_lists']}  (always 0 — table unavailable)")
    print(f"  pmax_with_campaign_negatives: {with_neg}")
    if with_neg == 0:
        verdict = "fail"
    elif with_neg < total:
        verdict = "warn"
    else:
        verdict = "pass"
    print(f"  => Expected verdict: {verdict}")
else:
    print("  No data => warn")

print("\n=== Done ===")
