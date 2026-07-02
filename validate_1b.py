from google.cloud import bigquery
client = bigquery.Client(project="coi-innovation-testing-8166")
sql = """
SELECT
  campaign_id,
  SUM(metrics_impressions) AS impressions_30d,
  SUM(CASE WHEN DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
           THEN metrics_impressions ELSE 0 END) AS impressions_7d,
  SUM(metrics_conversions) AS conversions_30d,
  ROUND(SUM(metrics_cost_micros) / 1e6, 2) AS cost_30d_usd
FROM `coi-innovation-testing-8166.bwj_google_ads.p_ads_CampaignBasicStats_6600502562`
WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY campaign_id
ORDER BY impressions_30d DESC
LIMIT 30
"""
rows = list(client.query(sql).result())
print("campaign_id | impressions_30d | impressions_7d | conversions_30d | cost_30d_usd")
print("-" * 80)
for r in rows:
    cid = r["campaign_id"]
    i30 = r["impressions_30d"]
    i7  = r["impressions_7d"]
    c30 = r["conversions_30d"]
    usd = r["cost_30d_usd"]
    print(f"{cid} | {i30} | {i7} | {c30} | {usd}")
