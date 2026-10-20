-- What the DMA Pulse app reads for an SEO audit (backend/app/services/seo_pipeline.py), and the
-- tables behind it. Replace YOUR_GCP_PROJECT. Run after 01_tables.sql and 02_metric_views.sql.
--
-- The app reads three views. Each has `site`: the host in lower case without www., so
-- www.client.nl and client.nl match.
--   v_seo_metrics        site, market, measured_on, source, topic, metric, value
--   v_seo_crawl_summary  one row per Screaming Frog crawl
--   v_seo_issue_detail   Screaming Frog issues per crawl, mapped to pulse topics
-- Metric names are exactly those in seo_criteria.py / SEO_METRICS.md. A metric that cannot be
-- measured has no row (= unknown), never a 0.

-- ------------------------------------------------------------------ Screaming Frog
-- One row per crawl, written by the crawl load job.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_crawls` (
  crawl_id STRING, client STRING, market STRING, domain STRING, crawl_date DATE,
  user_agent STRING, js_rendering BOOL, internal_html INT64, indexable_html INT64,
  sf_version STRING, loaded_at TIMESTAMP
) PARTITION BY crawl_date CLUSTER BY client, domain;

-- The Issues overview export of that crawl, one row per issue. sf_category and issue_name are
-- split from the export's "Issue Name" ("Page Titles: Duplicate" -> "Page Titles", "Duplicate").
-- indexable_urls comes from joining the issue's URLs with the Internal export (may be NULL).
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_issues_overview` (
  crawl_id STRING, client STRING, market STRING, domain STRING, crawl_date DATE,
  sf_category STRING, issue_name STRING, issue_type STRING, issue_priority STRING,
  urls INT64, indexable_urls INT64, loaded_at TIMESTAMP
) PARTITION BY crawl_date CLUSTER BY client, domain;

-- Seed: Screaming Frog issue -> pulse topic. Load seo/sf_issue_map.csv into it (CSV with a header
-- row, replace the table on every pulse release).
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_issue_map` (
  sf_category STRING, issue_name STRING, issue_type STRING, issue_priority STRING,
  topic STRING, category STRING
);

-- ------------------------------------------------------------------ Metrics from other jobs
-- Landing table for metrics that a job computes outside n8n: SQL on the Screaming Frog exports,
-- the Search Console bulk export, Ahrefs, or intake answers. One row per metric value.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.metric_values` (
  client STRING, market STRING, domain STRING, measured_on DATE,
  source STRING,              -- e.g. 'sf_crawl', 'gsc', 'ahrefs', 'intake'
  topic STRING, metric STRING, value FLOAT64,
  crawl_id STRING,            -- set for metrics from a Screaming Frog crawl
  loaded_at TIMESTAMP
) PARTITION BY measured_on CLUSTER BY client, domain;

-- ------------------------------------------------------------------ Views read by the app
CREATE OR REPLACE VIEW `YOUR_GCP_PROJECT.seo_raw.v_seo_metrics` AS
WITH n8n_audits AS (
  -- client, market, site and date of each n8n run, from whichever raw tables it wrote
  SELECT audit_id, ANY_VALUE(client) AS client, ANY_VALUE(market) AS market,
         ANY_VALUE(domain) AS domain, DATE(MAX(ts)) AS measured_on
  FROM (
    SELECT audit_id, client, market, domain, fetched_at AS ts FROM `YOUR_GCP_PROJECT.seo_raw.psi_agentic`
    UNION ALL SELECT audit_id, client, market, domain, fetched_at FROM `YOUR_GCP_PROJECT.seo_raw.site_file_checks`
    UNION ALL SELECT audit_id, client, market, domain, fetched_at FROM `YOUR_GCP_PROJECT.seo_raw.wikidata_items`
    UNION ALL SELECT audit_id, client, market, domain, fetched_at FROM `YOUR_GCP_PROJECT.seo_raw.wikipedia_links`
    UNION ALL SELECT audit_id, client, market, domain, fetched_at FROM `YOUR_GCP_PROJECT.seo_raw.llm_page_scores`
    UNION ALL SELECT audit_id, client, market, domain, tested_at FROM `YOUR_GCP_PROJECT.seo_raw.verified_agent_tests`
  )
  GROUP BY audit_id
),
other AS (
  -- latest load wins when a job re-runs for the same day
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.metric_values`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY client, market, domain, measured_on, topic, metric
                             ORDER BY loaded_at DESC) = 1
)
SELECT a.client, a.market, REGEXP_REPLACE(LOWER(a.domain), r'^www\.', '') AS site, a.measured_on,
       'n8n' AS source, m.topic, m.metric, m.value
FROM `YOUR_GCP_PROJECT.seo_raw.v_topic_metrics_n8n` AS m
JOIN n8n_audits AS a USING (audit_id)
UNION ALL
SELECT client, market, REGEXP_REPLACE(LOWER(domain), r'^www\.', ''), measured_on,
       source, topic, metric, value
FROM other;

CREATE OR REPLACE VIEW `YOUR_GCP_PROJECT.seo_raw.v_seo_crawl_summary` AS
SELECT crawl_id, client, market, REGEXP_REPLACE(LOWER(domain), r'^www\.', '') AS site, crawl_date,
       user_agent, js_rendering, internal_html, indexable_html
FROM `YOUR_GCP_PROJECT.seo_raw.sf_crawls`
QUALIFY ROW_NUMBER() OVER (PARTITION BY crawl_id ORDER BY loaded_at DESC) = 1;

CREATE OR REPLACE VIEW `YOUR_GCP_PROJECT.seo_raw.v_seo_issue_detail` AS
SELECT i.crawl_id, REGEXP_REPLACE(LOWER(i.domain), r'^www\.', '') AS site, i.crawl_date,
       m.topic, i.sf_category, i.issue_name, i.issue_type, i.issue_priority, i.urls, i.indexable_urls
FROM `YOUR_GCP_PROJECT.seo_raw.sf_issues_overview` AS i
JOIN `YOUR_GCP_PROJECT.seo_raw.sf_issue_map` AS m
  ON m.sf_category = i.sf_category AND m.issue_name = i.issue_name
WHERE m.topic IS NOT NULL
QUALIFY ROW_NUMBER() OVER (PARTITION BY i.crawl_id, i.sf_category, i.issue_name, m.topic
                           ORDER BY i.loaded_at DESC) = 1;
