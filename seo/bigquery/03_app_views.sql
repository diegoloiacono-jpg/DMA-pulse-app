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
-- One row per crawl. Written by the n8n form upload (webhook seo-pulse-crawl: Internal export + Bulk Export >
-- Issues > All); a scheduled crawl can later write the same tables. The upload comes in parts (max. 4 MB each) that go
-- to the staging tables below; the last part moves the whole crawl into these tables, each row once. A crawl is here
-- only when it arrived completely. The exports do not say how the crawl ran: user_agent is NULL, and
-- js_rendering is TRUE when the issues include JavaScript issues (only reported with JavaScript rendering), else NULL.
-- Without TRUE, the JavaScript issues are not measured (not zero). external_urls = the distinct URLs of the External
-- export (tab External, filter All), the base of the broken external links; NULL without that export.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_crawls` (
  crawl_id STRING, client STRING, market STRING, domain STRING, crawl_date DATE,
  user_agent STRING, js_rendering BOOL, internal_html INT64, indexable_html INT64, external_urls INT64,
  sf_version STRING, loaded_at TIMESTAMP,
  search_console BOOL,       -- TRUE: Screaming Frog's Search Console connection gave data (Clicks or Impressions filled in)
  images INT64,              -- internal images in the Internal export (filter All); NULL for an HTML-only export
  images_modern INT64,       -- of those, WebP and AVIF
  page_columns STRING        -- the page columns the Internal export had, as ",url,clicks,meta_robots,"
) PARTITION BY crawl_date CLUSTER BY client, domain;
-- Added on 3 Nov 2026, for a table made before
ALTER TABLE `YOUR_GCP_PROJECT.seo_raw.sf_crawls` ADD COLUMN IF NOT EXISTS search_console BOOL;
-- Added on 25 Nov 2026
ALTER TABLE `YOUR_GCP_PROJECT.seo_raw.sf_crawls` ADD COLUMN IF NOT EXISTS images INT64, ADD COLUMN IF NOT EXISTS images_modern INT64,
  ADD COLUMN IF NOT EXISTS page_columns STRING;

-- One row per issue of that crawl, from the Bulk Export > Issues > All folder (one CSV per issue): urls and
-- indexable_urls are counted per file; sf_category, issue_name, type and priority come from sf_issue_map
-- (matched on the file name). indexable_urls is NULL when neither the issue file nor the Internal export says.
-- source_pages = distinct pages linking to the issue's URLs, from the issue's Inlinks export in the same folder
-- ("…_inlinks.csv", e.g. pct_pages_linking_4xx); NULL without that file.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_issues_overview` (
  crawl_id STRING, client STRING, market STRING, domain STRING, crawl_date DATE,
  sf_category STRING, issue_name STRING, issue_type STRING, issue_priority STRING,
  urls INT64, indexable_urls INT64, source_pages INT64, loaded_at TIMESTAMP
) PARTITION BY crawl_date CLUSTER BY client, domain;

-- The Internal export of that crawl (HTML pages), a fixed set of columns per page.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_pages` (
  crawl_id STRING, client STRING, market STRING, domain STRING, crawl_date DATE,
  url STRING, status INT64, indexability STRING, indexability_status STRING, depth INT64, unique_inlinks INT64,
  word_count INT64, response_time FLOAT64, title_length INT64, meta_description_length INT64, h1_length INT64,
  canonical STRING, loaded_at TIMESTAMP,
  -- Search Console and URL Inspection through Screaming Frog's API connection, directives, segment, links (25 Nov 2026)
  clicks INT64, impressions INT64, inspection_summary STRING, coverage STRING, google_canonical STRING, user_canonical STRING,
  meta_robots STRING, x_robots STRING, segment STRING, unique_outlinks INT64,
  -- PageSpeed through Screaming Frog: Lighthouse lab data, CrUX field data (p75) and the opportunities as JSON (25 Nov 2026)
  perf_score FLOAT64, lab_fcp_ms FLOAT64, lab_si_ms FLOAT64, lab_lcp_ms FLOAT64, lab_tbt_ms FLOAT64, lab_cls FLOAT64,
  crux_lcp_ms FLOAT64, crux_inp_ms FLOAT64, crux_cls FLOAT64, cwv_assessment STRING, psi_savings STRING
) PARTITION BY crawl_date CLUSTER BY client, domain;
ALTER TABLE `YOUR_GCP_PROJECT.seo_raw.sf_pages` ADD COLUMN IF NOT EXISTS clicks INT64, ADD COLUMN IF NOT EXISTS impressions INT64,
  ADD COLUMN IF NOT EXISTS inspection_summary STRING, ADD COLUMN IF NOT EXISTS coverage STRING, ADD COLUMN IF NOT EXISTS google_canonical STRING,
  ADD COLUMN IF NOT EXISTS user_canonical STRING, ADD COLUMN IF NOT EXISTS meta_robots STRING, ADD COLUMN IF NOT EXISTS x_robots STRING,
  ADD COLUMN IF NOT EXISTS segment STRING, ADD COLUMN IF NOT EXISTS unique_outlinks INT64;
ALTER TABLE `YOUR_GCP_PROJECT.seo_raw.sf_pages` ADD COLUMN IF NOT EXISTS perf_score FLOAT64, ADD COLUMN IF NOT EXISTS lab_fcp_ms FLOAT64,
  ADD COLUMN IF NOT EXISTS lab_si_ms FLOAT64, ADD COLUMN IF NOT EXISTS lab_lcp_ms FLOAT64, ADD COLUMN IF NOT EXISTS lab_tbt_ms FLOAT64,
  ADD COLUMN IF NOT EXISTS lab_cls FLOAT64, ADD COLUMN IF NOT EXISTS crux_lcp_ms FLOAT64, ADD COLUMN IF NOT EXISTS crux_inp_ms FLOAT64,
  ADD COLUMN IF NOT EXISTS crux_cls FLOAT64, ADD COLUMN IF NOT EXISTS cwv_assessment STRING, ADD COLUMN IF NOT EXISTS psi_savings STRING;

-- The URLs per issue (every URL): which pages have which issue.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_issue_urls` (
  crawl_id STRING, client STRING, market STRING, domain STRING, crawl_date DATE,
  sf_category STRING, issue_name STRING, url STRING, indexable BOOL, loaded_at TIMESTAMP,
  js_word_pct FLOAT64        -- JS Word Count % of the issue file (JavaScript: Contains JavaScript Content), else NULL
) PARTITION BY crawl_date CLUSTER BY client, domain;
-- Added on 19 Nov 2026, for a table made before
ALTER TABLE `YOUR_GCP_PROJECT.seo_raw.sf_issue_urls` ADD COLUMN IF NOT EXISTS js_word_pct FLOAT64;

-- The links to an issue's URLs, from the issue's Inlinks export ("…_inlinks.csv", every link): which page
-- links where, the fix list for development.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_issue_inlinks` (
  crawl_id STRING, client STRING, market STRING, domain STRING, crawl_date DATE,
  sf_category STRING, issue_name STRING, source STRING, destination STRING, anchor STRING, link_position STRING,
  loaded_at TIMESTAMP
) PARTITION BY crawl_date CLUSTER BY client, domain;

-- Staging for the crawl upload: every part of an upload is appended here (a part sent twice gives copies here, never in
-- the tables above). The last part moves the crawl into the tables above with one INSERT per table: each row once (by
-- its key, the latest copy), and only when the crawl is not there yet. Rows expire after 3 days.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_crawls_stage`
PARTITION BY DATE(loaded_at) OPTIONS (partition_expiration_days = 3)
AS SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.sf_crawls` WHERE FALSE;
ALTER TABLE `YOUR_GCP_PROJECT.seo_raw.sf_crawls_stage` ADD COLUMN IF NOT EXISTS search_console BOOL;
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_issues_overview_stage`
PARTITION BY DATE(loaded_at) OPTIONS (partition_expiration_days = 3)
AS SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.sf_issues_overview` WHERE FALSE;
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_pages_stage`
PARTITION BY DATE(loaded_at) OPTIONS (partition_expiration_days = 3)
AS SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.sf_pages` WHERE FALSE;
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_issue_urls_stage`
PARTITION BY DATE(loaded_at) OPTIONS (partition_expiration_days = 3)
AS SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.sf_issue_urls` WHERE FALSE;
ALTER TABLE `YOUR_GCP_PROJECT.seo_raw.sf_issue_urls_stage` ADD COLUMN IF NOT EXISTS js_word_pct FLOAT64;
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_issue_inlinks_stage`
PARTITION BY DATE(loaded_at) OPTIONS (partition_expiration_days = 3)
AS SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.sf_issue_inlinks` WHERE FALSE;

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

-- >>> v_sf_metrics: generated by build/build_sf_metrics.py, do not edit by hand
-- The Screaming Frog crawl metrics of the pulse that the exports of the form give (91 of 107, with the
-- Search Console and URL Inspection data of Screaming Frog's API connection; the others need All Outlinks, All Redirects, the
-- mobile crawl, a custom extraction or a check outside the crawl). One row per crawl, topic
-- and metric; the last upload counts when a crawl is uploaded again. A metric the crawl cannot tell is left out.
CREATE OR REPLACE VIEW `YOUR_GCP_PROJECT.seo_raw.v_sf_metrics` AS
WITH crawl AS (
  SELECT crawl_id, client, market, domain, crawl_date, internal_html, indexable_html, external_urls, js_rendering,
         images, images_modern, page_columns
  FROM `YOUR_GCP_PROJECT.seo_raw.sf_crawls`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY REGEXP_REPLACE(LOWER(domain), r'^www\.', ''), market, crawl_date ORDER BY loaded_at DESC) = 1
),
iss AS (
  SELECT crawl_id, sf_category, CONCAT(sf_category, ': ', issue_name) AS issue, urls, indexable_urls, source_pages
  FROM `YOUR_GCP_PROJECT.seo_raw.sf_issues_overview`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY crawl_id, sf_category, issue_name ORDER BY loaded_at DESC) = 1
),
iu AS (   -- the issue URLs (not "url": that would be the row, not the column)
  SELECT DISTINCT u.crawl_id, CONCAT(u.sf_category, ': ', u.issue_name) AS issue, u.url, u.indexable, u.js_word_pct, m.topic
  FROM `YOUR_GCP_PROJECT.seo_raw.sf_issue_urls` AS u
  LEFT JOIN `YOUR_GCP_PROJECT.seo_raw.sf_issue_map` AS m ON m.sf_category = u.sf_category AND m.issue_name = u.issue_name
),
pg AS (
  SELECT crawl_id, url, REGEXP_EXTRACT(LOWER(url), r'^https?://[^/]+(/[^?#]*)') AS path, status, indexability, depth,
         unique_inlinks, response_time, canonical, clicks, impressions, inspection_summary, google_canonical, user_canonical,
         meta_robots, x_robots, segment, unique_outlinks, perf_score, lab_lcp_ms, lab_tbt_ms, lab_cls, crux_lcp_ms, crux_inp_ms,
         crux_cls, psi_savings
  FROM `YOUR_GCP_PROJECT.seo_raw.sf_pages`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY crawl_id, url ORDER BY loaded_at DESC) = 1
),
iagg AS (
  SELECT crawl_id, COUNT(*) AS n_issue_rows,
    LOGICAL_OR(sf_category = 'Sitemaps') AS has_d3a81c54,
    IF(LOGICAL_OR(issue = 'Sitemaps: URLs Not In Sitemap' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'Sitemaps: URLs Not In Sitemap', indexable_urls, 0))) AS x_9304b5d8,
    SUM(IF(issue = 'Sitemaps: Non-Indexable URLs In Sitemap', urls, 0)) AS u_0fa7071d,
    SUM(IF(issue = 'Response Codes: Internal Blocked Resource', urls, 0)) AS u_b506724c,
    SUM(IF(issue = 'Security: HTTP URLs', urls, 0)) AS u_bb9947bc,
    SUM(IF(issue = 'Security: Mixed Content', urls, 0)) AS u_ac3762c3,
    SUM(IF(issue = 'Security: Missing HSTS Header', urls, 0)) AS u_aeb146e4,
    SUM(IF(issue = 'Sitemaps: XML Sitemap With Over 50k URLs', urls, 0)) AS u_3a2f2fcc,
    SUM(IF(issue = 'Sitemaps: XML Sitemap Over 50mb', urls, 0)) AS u_22ce3111,
    SUM(IF(issue = 'Response Codes: Internal Redirect Loop', urls, 0)) AS u_eef3ecd3,
    SUM(IF(issue = 'Response Codes: Internal Redirection (3XX)', urls, 0)) AS u_33c4c217,
    SUM(IF(issue = 'Response Codes: Internal Redirect Chain', urls, 0)) AS u_1c92f7e8,
    SUM(IF(issue = 'Content: Soft 404 Pages', urls, 0)) AS u_7c3db80a,
    IF(LOGICAL_OR(issue = 'Response Codes: Internal Client Error (4XX)'), MAX(IF(issue = 'Response Codes: Internal Client Error (4XX)', source_pages, NULL)), 0) AS s_01135e13,
    SUM(IF(issue = 'Validation: HTML Document Over 2MB', urls, 0)) AS u_c76edf5c,
    SUM(IF(issue = 'Validation: Resource Over 2MB', urls, 0)) AS u_2461fd2f,
    IF(LOGICAL_OR(issue = 'URL: Parameters' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'URL: Parameters', indexable_urls, 0))) AS x_ea37ca54,
    IF(LOGICAL_OR(issue = 'URL: Internal Search' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'URL: Internal Search', indexable_urls, 0))) AS x_0463825c,
    SUM(IF(issue = 'URL: GA Tracking Parameters', urls, 0)) AS u_80f3eeeb,
    SUM(IF(issue = 'URL: Parameters', urls, 0)) AS u_ea37ca54,
    LOGICAL_OR(sf_category = 'Pagination') AS has_cbb81506,
    SUM(IF(issue = 'Pagination: Pagination URL Not In Anchor Tag', urls, 0)) AS u_38c2702c,
    SUM(IF(issue = 'Pagination: Non-200 Pagination URLs', urls, 0)) AS u_aff9b804,
    LOGICAL_OR(sf_category = 'Hreflang') AS has_703bbc0f,
    SUM(IF(issue = 'Hreflang: Missing X-Default', urls, 0)) AS u_4688f680,
    SUM(IF(issue = 'Links: Outlinks To Localhost', urls, 0)) AS u_a2bf9f12,
    SUM(IF(issue = 'Links: Internal Nofollow Outlinks', urls, 0)) AS u_452578a8,
    SUM(IF(issue = 'Links: Pages With Uncrawlable Internal Outlinks', urls, 0)) AS u_bd5c7e6d,
    IF(LOGICAL_OR(issue = 'Response Codes: Internal Redirection (3XX)'), MAX(IF(issue = 'Response Codes: Internal Redirection (3XX)', source_pages, NULL)), 0) AS s_33c4c217,
    SUM(IF(issue = 'Sitemaps: Orphan URLs', urls, 0)) AS u_9fd4094e,
    SUM(IF(issue = 'Mobile: Viewport Not Set', urls, 0)) AS u_7e24dd67,
    LOGICAL_OR(sf_category = 'Mobile') AS has_87d17f46,
    IF(LOGICAL_OR(issue = 'Page Titles: Missing' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'Page Titles: Missing', indexable_urls, 0))) AS x_aa971d69,
    IF(LOGICAL_OR(issue = 'Page Titles: Duplicate' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'Page Titles: Duplicate', indexable_urls, 0))) AS x_d505380c,
    IF(LOGICAL_OR(issue = 'Page Titles: Over 561 Pixels' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'Page Titles: Over 561 Pixels', indexable_urls, 0))) AS x_b23b16bb,
    IF(LOGICAL_OR(issue = 'H1: Missing' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'H1: Missing', indexable_urls, 0))) AS x_61e739e8,
    IF(LOGICAL_OR(issue = 'H1: Duplicate' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'H1: Duplicate', indexable_urls, 0))) AS x_c31b76b6,
    SUM(IF(issue = 'Images: Over 100 kb', urls, 0)) AS u_33e4de20,
    LOGICAL_OR(sf_category = 'Structured Data') AS has_ee098833,
    SUM(IF(issue = 'Content: Lorem Ipsum Placeholder', urls, 0)) AS u_e1d7df99
  FROM iss GROUP BY crawl_id
),
dagg AS (
  SELECT crawl_id,
    COUNT(DISTINCT IF(issue IN ('Security: Form URL Insecure', 'Security: Form On HTTP URL'), url, NULL)) AS d_c2d7e24e,
    COUNT(DISTINCT IF(issue IN ('Response Codes: Internal Server Error (5XX)', 'Response Codes: Internal No Response'), url, NULL)) AS d_803ec852,
    COUNT(DISTINCT IF(issue IN ('Response Codes: Internal Redirection (Meta Refresh)', 'Response Codes: Internal Redirection (HTTP Refresh)', 'Response Codes: Internal Redirection (JavaScript)'), url, NULL)) AS d_148a40ae,
    COUNT(DISTINCT IF(topic = 'Canonical Tags' AND indexable, url, NULL)) AS t_92606498,
    COUNT(DISTINCT IF(issue IN ('Page Titles: Outside <head>', 'Meta Description: Outside <head>', 'Canonicals: Outside <head>', 'Directives: Outside <head>', 'Hreflang: Outside <head>'), url, NULL)) AS d_ff3af04b,
    COUNT(DISTINCT IF(issue IN ('Validation: Missing <head> Tag', 'Validation: Multiple <head> Tags', 'Validation: <head> Not First In <html> Element', 'Validation: <body> Element Preceding <html>', 'Validation: Invalid HTML Elements In <head>', 'Validation: Missing <body> Tag', 'Validation: Multiple <body> Tags'), url, NULL)) AS d_0088d26d,
    IF(COUNTIF(issue = 'JavaScript: Contains JavaScript Content') = 0, 0, IF(LOGICAL_OR(issue = 'JavaScript: Contains JavaScript Content' AND js_word_pct IS NOT NULL), COUNT(DISTINCT IF(issue = 'JavaScript: Contains JavaScript Content' AND indexable AND js_word_pct > 10, url, NULL)), NULL)) AS jsw_db5726c1,
    COUNT(DISTINCT IF(issue IN ('JavaScript: Page Title Only in Rendered HTML', 'JavaScript: Meta Description Only in Rendered HTML', 'JavaScript: Canonical Only in Rendered HTML', 'JavaScript: H1 Only in Rendered HTML') AND indexable, url, NULL)) AS d_6a0d9322,
    COUNT(DISTINCT IF(issue IN ('JavaScript: Noindex Only in Original HTML', 'JavaScript: Nofollow Only in Original HTML'), url, NULL)) AS d_a0a9a34a,
    COUNT(DISTINCT IF(issue IN ('Pagination: Unlinked Pagination URLs', 'Pagination: Pagination Loop', 'Pagination: Multiple Pagination URLs', 'Pagination: Sequence Error'), url, NULL)) AS d_50f833d0,
    COUNT(DISTINCT IF(topic = 'Internationalisation', url, NULL)) AS t_e2403213,
    COUNT(DISTINCT IF(topic = 'URL Structure' AND indexable AND issue NOT IN ('URL: Uppercase', 'URL: Underscores'), url, NULL)) AS t_79361c2e,
    COUNT(DISTINCT IF(issue IN ('Sitemaps: Orphan URLs', 'Links: Non-Indexable Page Inlinks Only'), url, NULL)) AS d_9c1e294d,
    COUNT(DISTINCT IF(issue IN ('Images: Missing Alt Text', 'Images: Missing Alt Attribute'), url, NULL)) AS d_b61e330d,
    COUNT(DISTINCT IF(issue IN ('Content: Exact Duplicates', 'Content: Near Duplicates', 'Content: Low Content Pages') AND indexable, url, NULL)) AS d_5ef2a5f4,
    COUNT(DISTINCT IF(issue IN ('Response Codes: External Client Error (4XX)', 'Response Codes: External Server Error (5XX)', 'Response Codes: External No Response'), url, NULL)) AS d_503dafbc
  FROM iu GROUP BY crawl_id
),
pagg AS (
  SELECT crawl_id, COUNT(*) AS n_pages, COUNTIF(unique_inlinks IS NOT NULL) AS n_pages_with_inlinks,
    COUNTIF(depth IS NOT NULL) AS n_pages_with_depth,
    APPROX_QUANTILES(response_time, 100)[SAFE_OFFSET(50)] AS median_response_time_s,
    COUNTIF(REGEXP_CONTAINS(LOWER(url), r'[?&;](sid|sessionid|jsessionid|phpsessid)=')) AS n_session_id_urls,
    COUNTIF(status = 200 AND REGEXP_CONTAINS(path, r'/(about|about-us|over-ons|ueber-uns|uber-uns|a-propos|qui-sommes-nous|chi-siamo|sobre-nosotros|quienes-somos|om-oss|om-os|o-nas|company|our-company)(/|$)')) AS n_about,
    COUNTIF(status = 200 AND REGEXP_CONTAINS(path, r'/(about|about-us|over-ons|ueber-uns|uber-uns|a-propos|qui-sommes-nous|chi-siamo|sobre-nosotros|quienes-somos|om-oss|om-os|o-nas|company|our-company)(/|$)') AND unique_inlinks > 0) AS n_about_linked,
    COUNTIF(status = 200 AND REGEXP_CONTAINS(path, r'/(team|our-team|ons-team|leadership|management|equipe|mitarbeiter|people)(/|$)')) AS n_team,
    COUNTIF(status = 200 AND REGEXP_CONTAINS(path, r'/(contact|contact-us|contacteer-ons|kontakt|contacto|contatti|contactez-nous|nous-contacter|klantenservice|customer-service)(/|$)')) AS n_contact,
    COUNTIF(status = 200 AND REGEXP_CONTAINS(path, r'/(contact|contact-us|contacteer-ons|kontakt|contacto|contatti|contactez-nous|nous-contacter|klantenservice|customer-service)(/|$)') AND unique_inlinks > 0) AS n_contact_linked,
    COUNTIF(status = 200 AND REGEXP_CONTAINS(path, r'/(mission|missie|our-mission|onze-missie|purpose|values|our-values|waarden|our-story|ons-verhaal|vision|visie)(/|$)')) AS n_mission,
    -- Search Console and URL Inspection through Screaming Frog (empty columns = no data, not 0)
    COUNTIF(clicks IS NOT NULL OR impressions IS NOT NULL) AS n_pages_with_gsc,
    COUNTIF(status = 200 AND indexability = 'Indexable') AS n_idx_pages,
    COUNTIF(status = 200 AND indexability = 'Indexable' AND IFNULL(impressions, 0) = 0) AS n_idx_zero_impr,
    COUNTIF(status = 200 AND indexability = 'Indexable' AND inspection_summary IS NOT NULL) AS n_inspected,
    COUNTIF(status = 200 AND indexability = 'Indexable' AND STARTS_WITH(LOWER(inspection_summary), 'url is on google')) AS n_inspected_indexed,
    COUNTIF(IFNULL(indexability, '') != 'Indexable' AND clicks > 0) AS n_non_indexable_with_clicks,
    SUM(IF(status = 200, unique_outlinks, NULL)) AS sum_unique_outlinks
  FROM pg GROUP BY crawl_id
),
-- Meta Descriptions: impressions on indexable pages with a missing or duplicate meta description, and the same as a count over
-- the indexable sitemap pages (without Search Console data)
meta AS (
  SELECT p.crawl_id,
    SUM(IF(p.status = 200 AND p.indexability = 'Indexable', p.impressions, 0)) AS impr_idx,
    SUM(IF(p.status = 200 AND p.indexability = 'Indexable' AND md.url IS NOT NULL, p.impressions, 0)) AS impr_idx_bad_meta,
    COUNTIF(p.status = 200 AND p.indexability = 'Indexable' AND ns.url IS NULL) AS n_sitemap_idx,
    COUNTIF(p.status = 200 AND p.indexability = 'Indexable' AND ns.url IS NULL AND md.url IS NOT NULL) AS n_sitemap_idx_bad_meta
  FROM pg AS p
  LEFT JOIN (SELECT DISTINCT crawl_id, url FROM iu WHERE issue IN ('Meta Description: Missing', 'Meta Description: Duplicate')) AS md
    ON md.crawl_id = p.crawl_id AND md.url = p.url
  LEFT JOIN (SELECT DISTINCT crawl_id, url FROM iu WHERE issue = 'Sitemaps: URLs Not In Sitemap') AS ns
    ON ns.crawl_id = p.crawl_id AND ns.url = p.url
  GROUP BY p.crawl_id
),
-- Orphan Pages: pages with clicks that have no internal inlinks, are in an Orphan URLs issue, or are only linked from
-- non-indexable pages
orph AS (
  SELECT p.crawl_id, COUNTIF(p.clicks > 0) AS n_click_urls,
    COUNTIF(p.clicks > 0 AND (o.url IS NOT NULL OR p.unique_inlinks = 0)) AS n_click_orphaned,
    COUNTIF(p.clicks > 0 AND (o.url IS NOT NULL OR p.unique_inlinks = 0 OR nl.url IS NOT NULL)) AS n_click_weak
  FROM pg AS p
  LEFT JOIN (SELECT DISTINCT crawl_id, url FROM iu WHERE issue IN ('Sitemaps: Orphan URLs', 'Search Console: Orphan URLs', 'Analytics: Orphan URLs')) AS o
    ON o.crawl_id = p.crawl_id AND o.url = p.url
  LEFT JOIN (SELECT DISTINCT crawl_id, url FROM iu WHERE issue = 'Links: Non-Indexable Page Inlinks Only') AS nl
    ON nl.crawl_id = p.crawl_id AND nl.url = p.url
  GROUP BY p.crawl_id
),
-- Server Stability: 5xx or no response on a URL in a sitemap or with clicks
k5 AS (
  SELECT a.crawl_id, COUNT(DISTINCT a.url) AS n_5xx_key_urls
  FROM iu AS a
  LEFT JOIN (SELECT DISTINCT crawl_id, url FROM iu WHERE issue = 'Sitemaps: Non-Indexable URLs In Sitemap') AS sm
    ON sm.crawl_id = a.crawl_id AND sm.url = a.url
  LEFT JOIN pg AS p ON p.crawl_id = a.crawl_id AND p.url = a.url
  WHERE a.issue IN ('Response Codes: Internal Server Error (5XX)', 'Response Codes: Internal No Response') AND (sm.url IS NOT NULL OR p.clicks > 0)
  GROUP BY a.crawl_id
),
-- Internal Link Health: links (source and destination once) to 3xx and 4xx URLs, from the issues' Inlinks exports
il AS (
  SELECT crawl_id, COUNT(DISTINCT CONCAT(source, ' ', destination)) AS n_links_to_3xx_4xx
  FROM (SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.sf_issue_inlinks`
        QUALIFY ROW_NUMBER() OVER (PARTITION BY crawl_id, sf_category, issue_name, source, destination, anchor, link_position ORDER BY loaded_at DESC) = 1)
  WHERE CONCAT(sf_category, ': ', issue_name) IN ('Response Codes: Internal Redirection (3XX)', 'Response Codes: Internal Client Error (4XX)')
  GROUP BY crawl_id
),
-- Structured Data: page types (segments) of the pages with structured data errors
sdt AS (
  SELECT p.crawl_id, COUNT(DISTINCT IFNULL(p.segment, '(no segment)')) AS n_page_types_with_sd_errors
  FROM pg AS p
  JOIN (SELECT DISTINCT crawl_id, url FROM iu WHERE issue IN ('Structured Data: Validation Errors', 'Structured Data: Rich Result Validation Errors',
                                                             'Structured Data: Parse Errors')) AS e
    ON e.crawl_id = p.crawl_id AND e.url = p.url
  GROUP BY p.crawl_id
),
-- Core Web Vitals: the PageSpeed data of the indexable pages (Screaming Frog PageSpeed integration), as medians
psiagg AS (
  SELECT crawl_id, COUNTIF(lab_lcp_ms IS NOT NULL) AS n_psi_pages,
    APPROX_QUANTILES(lab_lcp_ms, 100)[SAFE_OFFSET(50)] AS med_lab_lcp, APPROX_QUANTILES(lab_tbt_ms, 100)[SAFE_OFFSET(50)] AS med_lab_tbt, APPROX_QUANTILES(lab_cls, 100)[SAFE_OFFSET(50)] AS med_lab_cls,
    APPROX_QUANTILES(perf_score, 100)[SAFE_OFFSET(50)] AS med_perf, APPROX_QUANTILES(crux_lcp_ms, 100)[SAFE_OFFSET(50)] AS med_crux_lcp, APPROX_QUANTILES(crux_inp_ms, 100)[SAFE_OFFSET(50)] AS med_crux_inp,
    APPROX_QUANTILES(crux_cls, 100)[SAFE_OFFSET(50)] AS med_crux_cls,
    APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(psi_savings, '$.render_blocking_ms') AS FLOAT64), 100)[SAFE_OFFSET(50)] / 1 AS med_psi_render_blocking_ms,
    APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(psi_savings, '$.unused_js_ms') AS FLOAT64), 100)[SAFE_OFFSET(50)] / 1 AS med_psi_unused_js_ms,
    APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(psi_savings, '$.unused_css_ms') AS FLOAT64), 100)[SAFE_OFFSET(50)] / 1 AS med_psi_unused_css_ms,
    APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(psi_savings, '$.js_execution_ms') AS FLOAT64), 100)[SAFE_OFFSET(50)] / 1 AS med_psi_js_execution_ms,
    APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(psi_savings, '$.main_thread_ms') AS FLOAT64), 100)[SAFE_OFFSET(50)] / 1 AS med_psi_main_thread_ms,
    APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(psi_savings, '$.font_display_ms') AS FLOAT64), 100)[SAFE_OFFSET(50)] / 1 AS med_psi_font_display_ms,
    APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(psi_savings, '$.image_delivery_bytes') AS FLOAT64), 100)[SAFE_OFFSET(50)] / 1024 AS med_psi_image_delivery_kb,
    APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(psi_savings, '$.cache_bytes') AS FLOAT64), 100)[SAFE_OFFSET(50)] / 1024 AS med_psi_cache_kb,
    APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(psi_savings, '$.legacy_js_bytes') AS FLOAT64), 100)[SAFE_OFFSET(50)] / 1024 AS med_psi_legacy_js_kb,
    APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(psi_savings, '$.page_bytes') AS FLOAT64), 100)[SAFE_OFFSET(50)] / 1024 AS med_psi_page_weight_kb,
    APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(psi_savings, '$.dom_size') AS FLOAT64), 100)[SAFE_OFFSET(50)] / 1 AS med_psi_dom_size
  FROM pg WHERE status = 200 AND indexability = 'Indexable' AND (lab_lcp_ms IS NOT NULL OR crux_lcp_ms IS NOT NULL)
  GROUP BY crawl_id
),
-- the CrUX of the origin from the n8n PageSpeed check of the run that uploaded this crawl (pulse_runs)
origin AS (
  SELECT r.crawl_id, MAX(p.crux_origin_lcp_ms) AS o_lcp, MAX(p.crux_origin_inp_ms) AS o_inp, MAX(p.crux_origin_cls) AS o_cls,
    LOGICAL_OR(p.http_status = 200) AS o_psi_ok
  FROM `YOUR_GCP_PROJECT.seo_raw.pulse_runs` AS r JOIN `YOUR_GCP_PROJECT.seo_raw.psi_agentic` AS p ON p.audit_id = r.audit_id
  WHERE r.crawl_id IS NOT NULL
  GROUP BY r.crawl_id
),
-- the pages where the pulse form says nosnippet is intentional (pulse_runs.nosnippet_pages: URLs or paths, one per line)
doc AS (
  SELECT crawl_id, ARRAY_AGG(DISTINCT TRIM(x)) AS pats
  FROM `YOUR_GCP_PROJECT.seo_raw.pulse_runs`, UNNEST(SPLIT(IFNULL(nosnippet_pages, ''), '\n')) AS x
  WHERE crawl_id IS NOT NULL AND TRIM(x) != ''
  GROUP BY crawl_id
),
-- locale folders of the indexable pages (nl_NL and nl-nl are one), with the number of pages in each
locs AS (   -- not "loc": that would be the row, not the column
  SELECT crawl_id, IF(SUBSTR(seg, 1, 2) IN ('en', 'nl', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'sv', 'da', 'no', 'nb', 'nn', 'fi', 'cs', 'sk', 'hu', 'ro', 'bg', 'el', 'tr', 'ru', 'uk', 'ja', 'zh', 'ko', 'ar', 'he', 'hr', 'sl', 'sr', 'bs', 'mk', 'sq', 'et', 'lv', 'lt', 'ca', 'eu', 'gl', 'is', 'ga', 'mt', 'lb', 'id', 'ms', 'th', 'vi', 'hi'), REPLACE(seg, '_', '-'), NULL) AS loc, COUNT(*) AS n
  FROM (SELECT crawl_id, REGEXP_EXTRACT(path, r'^/([a-z]{2}(?:[-_][a-z]{2})?)(?:/|$)') AS seg
        FROM pg WHERE status = 200 AND indexability = 'Indexable')
  GROUP BY 1, 2
),
lagg AS (
  SELECT crawl_id, COUNTIF(loc IS NOT NULL AND n >= 2) AS n_locales,
    COUNT(DISTINCT IF(loc IS NOT NULL AND n >= 2, SUBSTR(loc, 1, 2), NULL)) AS n_locale_languages,
    SAFE_DIVIDE(SUM(IF(loc IS NULL OR n < 2, n, 0)), SUM(n)) AS share_outside_locales
  FROM locs GROUP BY crawl_id
),
-- the top 100 key pages: indexable pages by Search Console clicks; without Search Console data, the indexable pages in the
-- sitemaps (when the crawl read them) by unique inlinks
key_pages AS (
  SELECT p.crawl_id, p.url, p.path, p.depth, p.canonical, p.google_canonical, p.user_canonical, p.meta_robots, p.x_robots
  FROM pg AS p
  JOIN pagg AS a ON a.crawl_id = p.crawl_id
  LEFT JOIN (SELECT DISTINCT crawl_id, url FROM iu WHERE issue = 'Sitemaps: URLs Not In Sitemap') AS ns
    ON ns.crawl_id = p.crawl_id AND ns.url = p.url
  WHERE p.status = 200 AND p.indexability = 'Indexable' AND (a.n_pages_with_gsc > 0 OR ns.url IS NULL)
  QUALIFY ROW_NUMBER() OVER (PARTITION BY p.crawl_id ORDER BY IF(a.n_pages_with_gsc > 0, p.clicks, NULL) DESC, p.unique_inlinks DESC, p.url) <= 100
),
kflags AS (
  SELECT k.*,
    REGEXP_CONTAINS(LOWER(CONCAT(IFNULL(k.meta_robots, ''), ',', IFNULL(k.x_robots, ''))), r'(^|[\s,])(nosnippet|max-snippet\s*:\s*0)([\s,]|$)') AS nosnippet,
    EXISTS(SELECT 1 FROM UNNEST(d.pats) AS pat WHERE k.url = pat OR STARTS_WITH(k.url, pat) OR STARTS_WITH(k.path, pat)) AS documented
  FROM key_pages AS k LEFT JOIN doc AS d ON d.crawl_id = k.crawl_id
),
kagg AS (
  SELECT k.crawl_id, COUNTIF(k.depth > 3) AS n_top100_depth_over_3, COUNTIF(k.depth > 4) AS n_top100_depth_over_4,
    COUNT(DISTINCT IF(c.url IS NOT NULL, k.url, NULL)) AS n_top100_canonical_issue,
    COUNTIF(k.nosnippet AND NOT k.documented) AS n_top100_nosnippet_undoc,
    COUNTIF(k.google_canonical IS NOT NULL) AS n_top100_inspected,
    COUNTIF(k.google_canonical IS NOT NULL AND COALESCE(k.user_canonical, k.canonical) IS NOT NULL
            AND LOWER(REGEXP_REPLACE(k.google_canonical, r'/+$', '')) != LOWER(REGEXP_REPLACE(COALESCE(k.user_canonical, k.canonical), r'/+$', ''))) AS n_top100_canonical_overridden
  FROM kflags AS k
  LEFT JOIN (SELECT DISTINCT crawl_id, url FROM iu WHERE topic = 'Canonical Tags') AS c ON c.crawl_id = k.crawl_id AND c.url = k.url
  GROUP BY k.crawl_id
),
-- URLs in a sitemap or with clicks that carry noindex, none or unavailable_after
blocked AS (
  SELECT b.crawl_id, COUNT(DISTINCT b.url) AS n_key_urls_blocked_from_index
  FROM iu AS b
  LEFT JOIN (SELECT DISTINCT crawl_id, url FROM iu WHERE issue = 'Sitemaps: Non-Indexable URLs In Sitemap') AS a
    ON a.crawl_id = b.crawl_id AND a.url = b.url
  LEFT JOIN pg AS p ON p.crawl_id = b.crawl_id AND p.url = b.url
  WHERE b.issue IN ('Directives: Noindex', 'Directives: None', 'Directives: Unavailable_After') AND (a.url IS NOT NULL OR p.clicks > 0)
  GROUP BY b.crawl_id
),
w AS (
  SELECT * FROM crawl
  LEFT JOIN iagg USING (crawl_id) LEFT JOIN dagg USING (crawl_id) LEFT JOIN pagg USING (crawl_id)
  LEFT JOIN kagg USING (crawl_id) LEFT JOIN blocked USING (crawl_id) LEFT JOIN lagg USING (crawl_id)
  LEFT JOIN meta USING (crawl_id) LEFT JOIN orph USING (crawl_id) LEFT JOIN k5 USING (crawl_id) LEFT JOIN il USING (crawl_id)
  LEFT JOIN sdt USING (crawl_id) LEFT JOIN psiagg USING (crawl_id) LEFT JOIN origin USING (crawl_id)
)
SELECT crawl_id, client, market, domain, crawl_date, m.topic, m.metric, m.value
FROM w, UNNEST([
    STRUCT('Robots.txt Configuration' AS topic, 'n_blocked_render_resources' AS metric, IF(n_issue_rows > 0, CAST(u_b506724c AS FLOAT64), NULL) AS value),
    STRUCT('HTTPS & Mixed Content' AS topic, 'n_http_urls' AS metric, IF(n_issue_rows > 0, CAST(u_bb9947bc AS FLOAT64), NULL) AS value),
    STRUCT('HTTPS & Mixed Content' AS topic, 'n_mixed_content_pages' AS metric, IF(n_issue_rows > 0, CAST(u_ac3762c3 AS FLOAT64), NULL) AS value),
    STRUCT('HTTPS & Mixed Content' AS topic, 'n_insecure_form_pages' AS metric, IF(n_issue_rows > 0, CAST(d_c2d7e24e AS FLOAT64), NULL) AS value),
    STRUCT('HTTPS & Mixed Content' AS topic, 'has_hsts' AS metric, IF(n_issue_rows > 0, CAST(IF(u_aeb146e4 > 0, 0, 1) AS FLOAT64), NULL) AS value),
    STRUCT('Server Stability' AS topic, 'n_5xx_or_no_response' AS metric, IF(n_issue_rows > 0, CAST(d_803ec852 AS FLOAT64), NULL) AS value),
    STRUCT('Server Stability' AS topic, 'median_response_time_s' AS metric, IF(n_pages > 0, CAST(median_response_time_s AS FLOAT64), NULL) AS value),
    STRUCT('Server Stability' AS topic, 'n_5xx_key_urls' AS metric, IF(n_issue_rows > 0 AND (has_d3a81c54 OR n_pages_with_gsc > 0), CAST(IFNULL(n_5xx_key_urls, 0) AS FLOAT64), NULL) AS value),
    STRUCT('XML Sitemap Quality' AS topic, 'has_sitemap' AS metric, IF(n_issue_rows > 0 AND has_d3a81c54, CAST(1 AS FLOAT64), NULL) AS value),
    STRUCT('XML Sitemap Quality' AS topic, 'n_sitemap_files_over_limit' AS metric, IF(n_issue_rows > 0 AND has_d3a81c54, CAST(u_3a2f2fcc + u_22ce3111 AS FLOAT64), NULL) AS value),
    STRUCT('XML Sitemap Quality' AS topic, 'pct_non_indexable_in_sitemap' AS metric, IF(n_issue_rows > 0 AND has_d3a81c54, CAST(SAFE_DIVIDE(u_0fa7071d, indexable_html - x_9304b5d8 + u_0fa7071d) AS FLOAT64), NULL) AS value),
    STRUCT('XML Sitemap Quality' AS topic, 'pct_indexable_in_sitemap' AS metric, IF(n_issue_rows > 0 AND has_d3a81c54, CAST(SAFE_DIVIDE(indexable_html - x_9304b5d8, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Index Coverage' AS topic, 'n_key_urls_blocked_from_index' AS metric, IF(n_issue_rows > 0 AND (has_d3a81c54 OR n_pages_with_gsc > 0), CAST(IFNULL(n_key_urls_blocked_from_index, 0) AS FLOAT64), NULL) AS value),
    STRUCT('Index Coverage' AS topic, 'pct_inspected_indexed' AS metric, IF(n_inspected > 0, CAST(SAFE_DIVIDE(n_inspected_indexed, n_inspected) AS FLOAT64), NULL) AS value),
    STRUCT('Index Coverage' AS topic, 'n_non_indexable_with_clicks' AS metric, IF(n_pages_with_gsc > 0, CAST(n_non_indexable_with_clicks AS FLOAT64), NULL) AS value),
    STRUCT('Redirect Hygiene' AS topic, 'n_redirect_loops' AS metric, IF(n_issue_rows > 0, CAST(u_eef3ecd3 AS FLOAT64), NULL) AS value),
    STRUCT('Redirect Hygiene' AS topic, 'pct_redirects_in_chains' AS metric, IF(n_issue_rows > 0, CAST(IF(u_33c4c217 = 0, 0, SAFE_DIVIDE(u_1c92f7e8, u_33c4c217)) AS FLOAT64), NULL) AS value),
    STRUCT('Redirect Hygiene' AS topic, 'n_client_side_redirects' AS metric, IF(n_issue_rows > 0, CAST(d_148a40ae AS FLOAT64), NULL) AS value),
    STRUCT('Error Handling & Soft 404s' AS topic, 'n_soft_404_pages' AS metric, IF(n_issue_rows > 0, CAST(u_7c3db80a AS FLOAT64), NULL) AS value),
    STRUCT('Error Handling & Soft 404s' AS topic, 'pct_pages_linking_4xx' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(s_01135e13, internal_html) AS FLOAT64), NULL) AS value),
    STRUCT('Canonical Tags' AS topic, 'pct_indexable_canonical_issue' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(t_92606498, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Canonical Tags' AS topic, 'n_top100_canonical_issue' AS metric, IF(n_issue_rows > 0 AND n_pages > 0 AND (n_pages_with_gsc > 0 OR n_pages_with_inlinks > 0), CAST(IFNULL(n_top100_canonical_issue, 0) AS FLOAT64), NULL) AS value),
    STRUCT('Canonical Tags' AS topic, 'n_top100_canonical_overridden' AS metric, IF(n_top100_inspected > 0, CAST(n_top100_canonical_overridden AS FLOAT64), NULL) AS value),
    STRUCT('Head Integrity & File Size' AS topic, 'n_pages_elements_outside_head' AS metric, IF(n_issue_rows > 0, CAST(d_ff3af04b AS FLOAT64), NULL) AS value),
    STRUCT('Head Integrity & File Size' AS topic, 'n_pages_invalid_head' AS metric, IF(n_issue_rows > 0, CAST(d_0088d26d AS FLOAT64), NULL) AS value),
    STRUCT('Head Integrity & File Size' AS topic, 'n_files_over_2mb' AS metric, IF(n_issue_rows > 0, CAST(u_c76edf5c + u_2461fd2f AS FLOAT64), NULL) AS value),
    STRUCT('Content Without JavaScript' AS topic, 'pct_js_dependent_pages' AS metric, IF(n_issue_rows > 0 AND js_rendering IS TRUE, CAST(SAFE_DIVIDE(jsw_db5726c1, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Content Without JavaScript' AS topic, 'pct_core_elements_render_only' AS metric, IF(n_issue_rows > 0 AND js_rendering IS TRUE, CAST(SAFE_DIVIDE(d_6a0d9322, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Content Without JavaScript' AS topic, 'n_directive_conflicts' AS metric, IF(n_issue_rows > 0 AND js_rendering IS TRUE, CAST(d_a0a9a34a AS FLOAT64), NULL) AS value),
    STRUCT('Parameters & Faceted Navigation' AS topic, 'n_indexable_parameter_urls' AS metric, IF(n_issue_rows > 0, CAST(x_ea37ca54 AS FLOAT64), NULL) AS value),
    STRUCT('Parameters & Faceted Navigation' AS topic, 'n_indexable_internal_search' AS metric, IF(n_issue_rows > 0, CAST(x_0463825c AS FLOAT64), NULL) AS value),
    STRUCT('Parameters & Faceted Navigation' AS topic, 'n_internal_links_with_tracking' AS metric, IF(n_issue_rows > 0, CAST(u_80f3eeeb AS FLOAT64), NULL) AS value),
    STRUCT('Parameters & Faceted Navigation' AS topic, 'pct_parameter_urls' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(u_ea37ca54, internal_html) AS FLOAT64), NULL) AS value),
    STRUCT('Pagination' AS topic, 'has_pagination' AS metric, IF(n_issue_rows > 0, CAST(IF(has_cbb81506, 1, NULL) AS FLOAT64), NULL) AS value),
    STRUCT('Pagination' AS topic, 'n_pagination_not_in_anchor' AS metric, IF(n_issue_rows > 0, CAST(u_38c2702c AS FLOAT64), NULL) AS value),
    STRUCT('Pagination' AS topic, 'n_pagination_non200' AS metric, IF(n_issue_rows > 0, CAST(u_aff9b804 AS FLOAT64), NULL) AS value),
    STRUCT('Pagination' AS topic, 'n_pagination_other_issues' AS metric, IF(n_issue_rows > 0, CAST(d_50f833d0 AS FLOAT64), NULL) AS value),
    STRUCT('Internationalisation' AS topic, 'n_market_languages' AS metric, IF(n_pages > 0, CAST(IF(n_locales > 0, n_locales + IF(share_outside_locales >= 0.05, 1, 0), IF(n_issue_rows > 0 AND NOT has_703bbc0f, 1, NULL)) AS FLOAT64), NULL) AS value),
    STRUCT('Internationalisation' AS topic, 'pct_urls_hreflang_errors' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(t_e2403213, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Internationalisation' AS topic, 'has_x_default' AS metric, IF(n_issue_rows > 0 AND has_703bbc0f, CAST(IF(u_4688f680 > 0, 0, 1) AS FLOAT64), NULL) AS value),
    STRUCT('URL Structure' AS topic, 'pct_indexable_url_issue' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(t_79361c2e, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('URL Structure' AS topic, 'n_session_id_urls' AS metric, IF(n_pages > 0, CAST(n_session_id_urls AS FLOAT64), NULL) AS value),
    STRUCT('Internal Link Health' AS topic, 'n_links_to_localhost' AS metric, IF(n_issue_rows > 0, CAST(u_a2bf9f12 AS FLOAT64), NULL) AS value),
    STRUCT('Internal Link Health' AS topic, 'n_internal_nofollow' AS metric, IF(n_issue_rows > 0, CAST(u_452578a8 AS FLOAT64), NULL) AS value),
    STRUCT('Internal Link Health' AS topic, 'n_uncrawlable_nav_links' AS metric, IF(n_issue_rows > 0, CAST(u_bd5c7e6d AS FLOAT64), NULL) AS value),
    STRUCT('Internal Link Health' AS topic, 'pct_internal_links_to_3xx_4xx' AS metric, IF(n_issue_rows > 0 AND STRPOS(IFNULL(page_columns, ''), ',unique_outlinks,') > 0 AND sum_unique_outlinks > 0 AND s_33c4c217 IS NOT NULL AND s_01135e13 IS NOT NULL, CAST(SAFE_DIVIDE(IFNULL(n_links_to_3xx_4xx, 0), sum_unique_outlinks) AS FLOAT64), NULL) AS value),
    STRUCT('Orphan Pages' AS topic, 'pct_click_urls_orphaned' AS metric, IF(n_issue_rows > 0 AND n_pages > 0, CAST(IF(n_pages_with_gsc > 0, SAFE_DIVIDE(n_click_orphaned, n_click_urls), IF(has_d3a81c54, SAFE_DIVIDE(u_9fd4094e, (indexable_html - x_9304b5d8 + u_0fa7071d)), NULL)) AS FLOAT64), NULL) AS value),
    STRUCT('Orphan Pages' AS topic, 'pct_click_urls_weakly_linked' AS metric, IF(n_issue_rows > 0 AND n_pages > 0, CAST(IF(n_pages_with_gsc > 0, SAFE_DIVIDE(n_click_weak, n_click_urls), IF(has_d3a81c54, SAFE_DIVIDE(d_9c1e294d, (indexable_html - x_9304b5d8 + u_0fa7071d)), NULL)) AS FLOAT64), NULL) AS value),
    STRUCT('Click Depth of Key Pages' AS topic, 'n_top100_depth_over_3' AS metric, IF(n_pages > 0 AND (n_pages_with_gsc > 0 OR n_pages_with_inlinks > 0) AND n_pages_with_depth > 0, CAST(n_top100_depth_over_3 AS FLOAT64), NULL) AS value),
    STRUCT('Click Depth of Key Pages' AS topic, 'n_top100_depth_over_4' AS metric, IF(n_pages > 0 AND (n_pages_with_gsc > 0 OR n_pages_with_inlinks > 0) AND n_pages_with_depth > 0, CAST(n_top100_depth_over_4 AS FLOAT64), NULL) AS value),
    STRUCT('Mobile Parity' AS topic, 'n_pages_viewport_missing' AS metric, IF(n_issue_rows > 0 AND has_87d17f46, CAST(u_7e24dd67 AS FLOAT64), NULL) AS value),
    STRUCT('Page Titles' AS topic, 'n_indexable_missing_title' AS metric, IF(n_issue_rows > 0, CAST(x_aa971d69 AS FLOAT64), NULL) AS value),
    STRUCT('Page Titles' AS topic, 'pct_indexable_duplicate_title' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(x_d505380c, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Page Titles' AS topic, 'pct_indexable_title_over_561px' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(x_b23b16bb, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Heading Structure' AS topic, 'pct_indexable_missing_h1' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(x_61e739e8, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Heading Structure' AS topic, 'pct_indexable_duplicate_h1' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(x_c31b76b6, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Meta Descriptions' AS topic, 'pct_impressions_missing_or_duplicate_meta' AS metric, IF(n_issue_rows > 0 AND n_pages > 0, CAST(IF(n_pages_with_gsc > 0, SAFE_DIVIDE(impr_idx_bad_meta, impr_idx), IF(has_d3a81c54, SAFE_DIVIDE(n_sitemap_idx_bad_meta, n_sitemap_idx), NULL)) AS FLOAT64), NULL) AS value),
    STRUCT('Index Bloat' AS topic, 'pct_indexable_zero_impressions_90d' AS metric, IF(n_pages_with_gsc > 0, CAST(SAFE_DIVIDE(n_idx_zero_impr, n_idx_pages) AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'n_cwv_failed_mobile' AS metric, IF(TRUE, CAST(IF(COALESCE(o_lcp, med_crux_lcp, med_lab_lcp) IS NULL OR COALESCE(o_cls, med_crux_cls, med_lab_cls) IS NULL OR COALESCE(COALESCE(o_inp, med_crux_inp), med_lab_tbt) IS NULL, NULL, IF(COALESCE(o_lcp, med_crux_lcp, med_lab_lcp) > 2500, 1, 0) + IF(IF(COALESCE(o_inp, med_crux_inp) IS NOT NULL, COALESCE(o_inp, med_crux_inp) > 200, med_lab_tbt > 200), 1, 0) + IF(COALESCE(o_cls, med_crux_cls, med_lab_cls) > 0.1, 1, 0)) AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'has_crux_origin' AS metric, IF(o_psi_ok IS TRUE, CAST(IF(o_lcp IS NOT NULL OR o_inp IS NOT NULL OR o_cls IS NOT NULL, 1, 0) AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'is_cwv_from_lab' AS metric, IF(TRUE, CAST(IF(COALESCE(o_lcp, med_crux_lcp) IS NOT NULL, 0, IF(med_lab_lcp IS NOT NULL, 1, NULL)) AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'lcp_ms' AS metric, IF(TRUE, CAST(COALESCE(o_lcp, med_crux_lcp, med_lab_lcp) AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'inp_ms' AS metric, IF(TRUE, CAST(COALESCE(o_inp, med_crux_inp) AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'cls' AS metric, IF(TRUE, CAST(COALESCE(o_cls, med_crux_cls, med_lab_cls) AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'tbt_lab_ms' AS metric, IF(TRUE, CAST(med_lab_tbt AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'performance_score' AS metric, IF(TRUE, CAST(med_perf AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'n_psi_pages' AS metric, IF(n_psi_pages > 0, CAST(n_psi_pages AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'psi_render_blocking_ms' AS metric, IF(TRUE, CAST(med_psi_render_blocking_ms AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'psi_unused_js_ms' AS metric, IF(TRUE, CAST(med_psi_unused_js_ms AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'psi_unused_css_ms' AS metric, IF(TRUE, CAST(med_psi_unused_css_ms AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'psi_js_execution_ms' AS metric, IF(TRUE, CAST(med_psi_js_execution_ms AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'psi_main_thread_ms' AS metric, IF(TRUE, CAST(med_psi_main_thread_ms AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'psi_font_display_ms' AS metric, IF(TRUE, CAST(med_psi_font_display_ms AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'psi_image_delivery_kb' AS metric, IF(TRUE, CAST(med_psi_image_delivery_kb AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'psi_cache_kb' AS metric, IF(TRUE, CAST(med_psi_cache_kb AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'psi_legacy_js_kb' AS metric, IF(TRUE, CAST(med_psi_legacy_js_kb AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'psi_page_weight_kb' AS metric, IF(TRUE, CAST(med_psi_page_weight_kb AS FLOAT64), NULL) AS value),
    STRUCT('Core Web Vitals' AS topic, 'psi_dom_size' AS metric, IF(TRUE, CAST(med_psi_dom_size AS FLOAT64), NULL) AS value),
    STRUCT('Image Alt Text' AS topic, 'pct_content_images_missing_alt' AS metric, IF(n_issue_rows > 0 AND images > 0, CAST(SAFE_DIVIDE(d_b61e330d, images) AS FLOAT64), NULL) AS value),
    STRUCT('Image Weight & Format' AS topic, 'pct_images_over_100kb' AS metric, IF(n_issue_rows > 0 AND images > 0, CAST(SAFE_DIVIDE(u_33e4de20, images) AS FLOAT64), NULL) AS value),
    STRUCT('Image Weight & Format' AS topic, 'pct_images_modern_format' AS metric, IF(images > 0, CAST(SAFE_DIVIDE(images_modern, images) AS FLOAT64), NULL) AS value),
    STRUCT('Structured Data' AS topic, 'n_page_types_with_sd_errors' AS metric, IF(n_issue_rows > 0 AND has_ee098833 AND STRPOS(IFNULL(page_columns, ''), ',segment,') > 0, CAST(IFNULL(n_page_types_with_sd_errors, 0) AS FLOAT64), NULL) AS value),
    STRUCT('Snippet Directives' AS topic, 'n_top_urls_nosnippet_undocumented' AS metric, IF(n_pages > 0 AND (n_pages_with_gsc > 0 OR n_pages_with_inlinks > 0) AND STRPOS(IFNULL(page_columns, ''), ',meta_robots,') > 0, CAST(IFNULL(n_top100_nosnippet_undoc, 0) AS FLOAT64), NULL) AS value),
    STRUCT('Duplicate & Thin Content' AS topic, 'n_same_language_markets_unlinked' AS metric, IF(n_pages > 0, CAST(IF(n_locales > 0, IF(n_locale_languages = n_locales, 0, NULL), IF(n_issue_rows > 0 AND NOT has_703bbc0f, 0, NULL)) AS FLOAT64), NULL) AS value),
    STRUCT('Duplicate & Thin Content' AS topic, 'pct_indexable_duplicate_or_thin' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(d_5ef2a5f4, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Content Hygiene' AS topic, 'n_placeholder_pages' AS metric, IF(n_issue_rows > 0, CAST(u_e1d7df99 AS FLOAT64), NULL) AS value),
    STRUCT('Source Citations' AS topic, 'pct_external_links_broken' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(d_503dafbc, external_urls) AS FLOAT64), NULL) AS value),
    STRUCT('Authority Pages' AS topic, 'has_about_page' AS metric, IF(n_pages > 0, CAST(IF(n_about > 0, 1, 0) AS FLOAT64), NULL) AS value),
    STRUCT('Authority Pages' AS topic, 'has_contact_page' AS metric, IF(n_pages > 0, CAST(IF(n_contact > 0, 1, 0) AS FLOAT64), NULL) AS value),
    STRUCT('Authority Pages' AS topic, 'is_about_contact_linked' AS metric, IF(n_pages > 0 AND n_pages_with_inlinks > 0, CAST(IF(n_about_linked > 0 AND n_contact_linked > 0, 1, 0) AS FLOAT64), NULL) AS value),
    STRUCT('Authority Pages' AS topic, 'n_authority_pages_missing' AS metric, IF(n_pages > 0, CAST(IF(n_about > 0, 0, 1) + IF(n_team > 0, 0, 1) + IF(n_contact > 0, 0, 1) + IF(n_mission > 0, 0, 1) AS FLOAT64), NULL) AS value)
]) AS m
WHERE m.value IS NOT NULL;
-- <<< v_sf_metrics

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
    UNION ALL SELECT audit_id, client, market, domain, tested_at FROM `YOUR_GCP_PROJECT.seo_raw.ai_bot_tests`
    UNION ALL SELECT audit_id, client, market, domain, tested_at FROM `YOUR_GCP_PROJECT.seo_raw.ucp_agent_tests`
    UNION ALL SELECT audit_id, client, market, domain, fetched_at FROM `YOUR_GCP_PROJECT.seo_raw.ahrefs_authority`
    UNION ALL SELECT audit_id, client, market, domain, fetched_at FROM `YOUR_GCP_PROJECT.seo_raw.ahrefs_citations`
    UNION ALL SELECT audit_id, client, market, domain, checked_at FROM `YOUR_GCP_PROJECT.seo_raw.site_checks`
    UNION ALL SELECT audit_id, client, market, domain, fetched_at FROM `YOUR_GCP_PROJECT.seo_raw.page_facts`
  )
  GROUP BY audit_id
),
other AS (
  -- latest load wins when a job re-runs for the same day
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.metric_values`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY client, market, domain, measured_on, topic, metric
                             ORDER BY loaded_at DESC) = 1
)
-- source_id: the n8n audit_id or the Screaming Frog crawl_id the value comes from (the app can pick one run or crawl)
SELECT a.client, a.market, REGEXP_REPLACE(LOWER(a.domain), r'^www\.', '') AS site, a.measured_on,
       'n8n' AS source, m.topic, m.metric, m.value, a.audit_id AS source_id
FROM `YOUR_GCP_PROJECT.seo_raw.v_topic_metrics_n8n` AS m
JOIN n8n_audits AS a USING (audit_id)
UNION ALL
SELECT client, market, REGEXP_REPLACE(LOWER(domain), r'^www\.', ''), measured_on,
       source, topic, metric, value, crawl_id
FROM other
UNION ALL
SELECT client, market, REGEXP_REPLACE(LOWER(domain), r'^www\.', ''), crawl_date,
       'sf_crawl', topic, metric, value, crawl_id
FROM `YOUR_GCP_PROJECT.seo_raw.v_sf_metrics`;

CREATE OR REPLACE VIEW `YOUR_GCP_PROJECT.seo_raw.v_seo_crawl_summary` AS
SELECT crawl_id, client, market, REGEXP_REPLACE(LOWER(domain), r'^www\.', '') AS site, crawl_date,
       user_agent, js_rendering, internal_html, indexable_html, external_urls, loaded_at, search_console
FROM `YOUR_GCP_PROJECT.seo_raw.sf_crawls`
QUALIFY ROW_NUMBER() OVER (PARTITION BY crawl_id ORDER BY loaded_at DESC) = 1;

-- The n8n runs per site, for the app's choice of the run an audit reads: date, the checks that wrote rows, metrics
CREATE OR REPLACE VIEW `YOUR_GCP_PROJECT.seo_raw.v_seo_n8n_runs` AS
WITH written AS (
  SELECT audit_id, client, market, domain, fetched_at AS ts, 'PageSpeed agentic browsing' AS check_name FROM `YOUR_GCP_PROJECT.seo_raw.psi_agentic`
  UNION ALL SELECT audit_id, client, market, domain, fetched_at, 'PageSpeed agentic browsing' FROM `YOUR_GCP_PROJECT.seo_raw.site_file_checks`
  UNION ALL SELECT audit_id, client, market, domain, fetched_at, 'Wikidata & Wikipedia' FROM `YOUR_GCP_PROJECT.seo_raw.wikidata_items`
  UNION ALL SELECT audit_id, client, market, domain, fetched_at, 'Wikidata & Wikipedia' FROM `YOUR_GCP_PROJECT.seo_raw.wikipedia_links`
  UNION ALL SELECT audit_id, client, market, domain, fetched_at, 'LLM page scores' FROM `YOUR_GCP_PROJECT.seo_raw.llm_page_scores`
  UNION ALL SELECT audit_id, client, market, domain, tested_at, 'Verified agent access' FROM `YOUR_GCP_PROJECT.seo_raw.verified_agent_tests`
  UNION ALL SELECT audit_id, client, market, domain, tested_at, 'AI bot test' FROM `YOUR_GCP_PROJECT.seo_raw.ai_bot_tests`
  UNION ALL SELECT audit_id, client, market, domain, tested_at, 'UCP agent test' FROM `YOUR_GCP_PROJECT.seo_raw.ucp_agent_tests`
  UNION ALL SELECT audit_id, client, market, domain, fetched_at, 'Ahrefs authority' FROM `YOUR_GCP_PROJECT.seo_raw.ahrefs_authority`
  UNION ALL SELECT audit_id, client, market, domain, fetched_at, 'Ahrefs authority' FROM `YOUR_GCP_PROJECT.seo_raw.ahrefs_citations`
  UNION ALL SELECT audit_id, client, market, domain, checked_at, 'Site checks' FROM `YOUR_GCP_PROJECT.seo_raw.site_checks`
  UNION ALL SELECT audit_id, client, market, domain, fetched_at, 'Site checks' FROM `YOUR_GCP_PROJECT.seo_raw.page_facts`
),
metrics AS (
  SELECT audit_id, COUNT(*) AS n_metrics FROM `YOUR_GCP_PROJECT.seo_raw.v_topic_metrics_n8n` WHERE value IS NOT NULL GROUP BY audit_id
)
SELECT w.audit_id, ANY_VALUE(w.client) AS client, ANY_VALUE(w.market) AS market,
       REGEXP_REPLACE(LOWER(ANY_VALUE(w.domain)), r'^www\.', '') AS site, DATE(MAX(w.ts)) AS run_date, MAX(w.ts) AS last_write,
       MIN(w.ts) AS first_write,
       STRING_AGG(DISTINCT w.check_name, ', ' ORDER BY w.check_name) AS checks, IFNULL(ANY_VALUE(m.n_metrics), 0) AS n_metrics
FROM written AS w
LEFT JOIN metrics AS m USING (audit_id)
GROUP BY w.audit_id;

CREATE OR REPLACE VIEW `YOUR_GCP_PROJECT.seo_raw.v_seo_issue_detail` AS
SELECT i.crawl_id, REGEXP_REPLACE(LOWER(i.domain), r'^www\.', '') AS site, i.crawl_date,
       m.topic, i.sf_category, i.issue_name, i.issue_type, i.issue_priority, i.urls, i.indexable_urls, i.source_pages
FROM `YOUR_GCP_PROJECT.seo_raw.sf_issues_overview` AS i
JOIN `YOUR_GCP_PROJECT.seo_raw.sf_issue_map` AS m
  ON m.sf_category = i.sf_category AND m.issue_name = i.issue_name
WHERE m.topic IS NOT NULL
QUALIFY ROW_NUMBER() OVER (PARTITION BY i.crawl_id, i.sf_category, i.issue_name, m.topic
                           ORDER BY i.loaded_at DESC) = 1;
