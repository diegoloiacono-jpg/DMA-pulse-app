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
  sf_version STRING, loaded_at TIMESTAMP
) PARTITION BY crawl_date CLUSTER BY client, domain;

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
  canonical STRING, loaded_at TIMESTAMP
) PARTITION BY crawl_date CLUSTER BY client, domain;

-- The URLs per issue (every URL): which pages have which issue.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_issue_urls` (
  crawl_id STRING, client STRING, market STRING, domain STRING, crawl_date DATE,
  sf_category STRING, issue_name STRING, url STRING, indexable BOOL, loaded_at TIMESTAMP
) PARTITION BY crawl_date CLUSTER BY client, domain;

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
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_issues_overview_stage`
PARTITION BY DATE(loaded_at) OPTIONS (partition_expiration_days = 3)
AS SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.sf_issues_overview` WHERE FALSE;
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_pages_stage`
PARTITION BY DATE(loaded_at) OPTIONS (partition_expiration_days = 3)
AS SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.sf_pages` WHERE FALSE;
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.sf_issue_urls_stage`
PARTITION BY DATE(loaded_at) OPTIONS (partition_expiration_days = 3)
AS SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.sf_issue_urls` WHERE FALSE;
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
-- The Screaming Frog crawl metrics of the pulse that the exports of the form give (55 of 80: the
-- others need All Outlinks, All Redirects, the sitemaps, Search Console or a custom extraction). One row per crawl, topic
-- and metric; the last upload counts when a crawl is uploaded again. A metric the crawl cannot tell is left out.
CREATE OR REPLACE VIEW `YOUR_GCP_PROJECT.seo_raw.v_sf_metrics` AS
WITH crawl AS (
  SELECT crawl_id, client, market, domain, crawl_date, internal_html, indexable_html, external_urls, js_rendering
  FROM `YOUR_GCP_PROJECT.seo_raw.sf_crawls`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY REGEXP_REPLACE(LOWER(domain), r'^www\.', ''), market, crawl_date ORDER BY loaded_at DESC) = 1
),
iss AS (
  SELECT crawl_id, sf_category, CONCAT(sf_category, ': ', issue_name) AS issue, urls, indexable_urls, source_pages
  FROM `YOUR_GCP_PROJECT.seo_raw.sf_issues_overview`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY crawl_id, sf_category, issue_name ORDER BY loaded_at DESC) = 1
),
iu AS (   -- the issue URLs (not "url": that would be the row, not the column)
  SELECT DISTINCT u.crawl_id, CONCAT(u.sf_category, ': ', u.issue_name) AS issue, u.url, u.indexable, m.topic
  FROM `YOUR_GCP_PROJECT.seo_raw.sf_issue_urls` AS u
  LEFT JOIN `YOUR_GCP_PROJECT.seo_raw.sf_issue_map` AS m ON m.sf_category = u.sf_category AND m.issue_name = u.issue_name
),
pg AS (
  SELECT crawl_id, url, REGEXP_EXTRACT(LOWER(url), r'^https?://[^/]+(/[^?#]*)') AS path, status, indexability, depth,
         unique_inlinks, response_time
  FROM `YOUR_GCP_PROJECT.seo_raw.sf_pages`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY crawl_id, url ORDER BY loaded_at DESC) = 1
),
iagg AS (
  SELECT crawl_id, COUNT(*) AS n_issue_rows,
    LOGICAL_OR(sf_category = 'Sitemaps') AS has_d3a81c54,
    SUM(IF(issue = 'Response Codes: Internal Blocked Resource', urls, 0)) AS u_b506724c,
    SUM(IF(issue = 'Security: HTTP URLs', urls, 0)) AS u_bb9947bc,
    SUM(IF(issue = 'Security: Mixed Content', urls, 0)) AS u_ac3762c3,
    SUM(IF(issue = 'Security: Missing HSTS Header', urls, 0)) AS u_aeb146e4,
    SUM(IF(issue = 'Sitemaps: XML Sitemap With Over 50k URLs', urls, 0)) AS u_3a2f2fcc,
    SUM(IF(issue = 'Sitemaps: XML Sitemap Over 50mb', urls, 0)) AS u_22ce3111,
    IF(LOGICAL_OR(issue = 'Sitemaps: URLs Not In Sitemap' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'Sitemaps: URLs Not In Sitemap', indexable_urls, 0))) AS x_9304b5d8,
    SUM(IF(issue = 'Response Codes: Internal Redirect Loop', urls, 0)) AS u_eef3ecd3,
    SUM(IF(issue = 'Response Codes: Internal Redirection (3XX)', urls, 0)) AS u_33c4c217,
    SUM(IF(issue = 'Response Codes: Internal Redirect Chain', urls, 0)) AS u_1c92f7e8,
    SUM(IF(issue = 'Content: Soft 404 Pages', urls, 0)) AS u_7c3db80a,
    IF(LOGICAL_OR(issue = 'Response Codes: Internal Client Error (4XX)'), MAX(IF(issue = 'Response Codes: Internal Client Error (4XX)', source_pages, NULL)), 0) AS s_01135e13,
    SUM(IF(issue = 'Validation: HTML Document Over 2MB', urls, 0)) AS u_c76edf5c,
    SUM(IF(issue = 'Validation: Resource Over 2MB', urls, 0)) AS u_2461fd2f,
    IF(LOGICAL_OR(issue = 'JavaScript: Contains JavaScript Content' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'JavaScript: Contains JavaScript Content', indexable_urls, 0))) AS x_d5529adb,
    IF(LOGICAL_OR(issue = 'URL: Parameters' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'URL: Parameters', indexable_urls, 0))) AS x_ea37ca54,
    IF(LOGICAL_OR(issue = 'URL: Internal Search' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'URL: Internal Search', indexable_urls, 0))) AS x_0463825c,
    SUM(IF(issue = 'URL: GA Tracking Parameters', urls, 0)) AS u_80f3eeeb,
    SUM(IF(issue = 'URL: Parameters', urls, 0)) AS u_ea37ca54,
    LOGICAL_OR(sf_category = 'Pagination') AS has_cbb81506,
    SUM(IF(issue = 'Pagination: Pagination URL Not In Anchor Tag', urls, 0)) AS u_38c2702c,
    SUM(IF(issue = 'Pagination: Non-200 Pagination URLs', urls, 0)) AS u_aff9b804,
    SUM(IF(issue = 'Hreflang: Missing X-Default', urls, 0)) AS u_4688f680,
    LOGICAL_OR(sf_category = 'Hreflang') AS has_703bbc0f,
    SUM(IF(issue = 'Links: Outlinks To Localhost', urls, 0)) AS u_a2bf9f12,
    SUM(IF(issue = 'Links: Internal Nofollow Outlinks', urls, 0)) AS u_452578a8,
    SUM(IF(issue = 'Links: Pages With Uncrawlable Internal Outlinks', urls, 0)) AS u_bd5c7e6d,
    SUM(IF(issue = 'Mobile: Viewport Not Set', urls, 0)) AS u_7e24dd67,
    LOGICAL_OR(sf_category = 'Mobile') AS has_87d17f46,
    IF(LOGICAL_OR(issue = 'Page Titles: Missing' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'Page Titles: Missing', indexable_urls, 0))) AS x_aa971d69,
    IF(LOGICAL_OR(issue = 'Page Titles: Duplicate' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'Page Titles: Duplicate', indexable_urls, 0))) AS x_d505380c,
    IF(LOGICAL_OR(issue = 'Page Titles: Over 561 Pixels' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'Page Titles: Over 561 Pixels', indexable_urls, 0))) AS x_b23b16bb,
    IF(LOGICAL_OR(issue = 'H1: Missing' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'H1: Missing', indexable_urls, 0))) AS x_61e739e8,
    IF(LOGICAL_OR(issue = 'H1: Duplicate' AND indexable_urls IS NULL), NULL, SUM(IF(issue = 'H1: Duplicate', indexable_urls, 0))) AS x_c31b76b6,
    SUM(IF(issue = 'Content: Lorem Ipsum Placeholder', urls, 0)) AS u_e1d7df99,
    LOGICAL_OR(issue IN ('Content: Spelling Errors', 'Content: Grammar Errors')) AS hasi_0399c847,
    SUM(IF(issue = 'Content: Low Relevance Content', urls, 0)) AS u_f791fda9,
    LOGICAL_OR(issue IN ('Content: Low Relevance Content')) AS hasi_f791fda9
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
    COUNT(DISTINCT IF(issue IN ('JavaScript: Page Title Only in Rendered HTML', 'JavaScript: Meta Description Only in Rendered HTML', 'JavaScript: Canonical Only in Rendered HTML', 'JavaScript: H1 Only in Rendered HTML') AND indexable, url, NULL)) AS d_6a0d9322,
    COUNT(DISTINCT IF(issue IN ('JavaScript: Noindex Only in Original HTML', 'JavaScript: Nofollow Only in Original HTML'), url, NULL)) AS d_a0a9a34a,
    COUNT(DISTINCT IF(issue IN ('Pagination: Unlinked Pagination URLs', 'Pagination: Pagination Loop', 'Pagination: Multiple Pagination URLs', 'Pagination: Sequence Error'), url, NULL)) AS d_50f833d0,
    COUNT(DISTINCT IF(topic = 'Internationalisation', url, NULL)) AS t_e2403213,
    COUNT(DISTINCT IF(topic = 'URL Structure' AND indexable AND issue NOT IN ('URL: Uppercase', 'URL: Underscores'), url, NULL)) AS t_79361c2e,
    COUNT(DISTINCT IF(issue IN ('Content: Exact Duplicates', 'Content: Near Duplicates', 'Content: Low Content Pages') AND indexable, url, NULL)) AS d_5ef2a5f4,
    COUNT(DISTINCT IF(issue IN ('Content: Spelling Errors', 'Content: Grammar Errors') AND indexable, url, NULL)) AS d_0a46721a,
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
    COUNTIF(status = 200 AND REGEXP_CONTAINS(path, r'/(mission|missie|our-mission|onze-missie|purpose|values|our-values|waarden|our-story|ons-verhaal|vision|visie)(/|$)')) AS n_mission
  FROM pg GROUP BY crawl_id
),
-- the top 100 key pages without Search Console: indexable pages (in the sitemaps, when the crawl read them) by unique inlinks
key_pages AS (
  SELECT p.crawl_id, p.url, p.depth
  FROM pg AS p
  LEFT JOIN (SELECT DISTINCT crawl_id, url FROM iu WHERE issue = 'Sitemaps: URLs Not In Sitemap') AS ns
    ON ns.crawl_id = p.crawl_id AND ns.url = p.url
  WHERE p.status = 200 AND p.indexability = 'Indexable' AND ns.url IS NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY p.crawl_id ORDER BY p.unique_inlinks DESC, p.url) <= 100
),
kagg AS (
  SELECT k.crawl_id, COUNTIF(k.depth > 3) AS n_top100_depth_over_3, COUNTIF(k.depth > 4) AS n_top100_depth_over_4,
    COUNT(DISTINCT IF(c.url IS NOT NULL, k.url, NULL)) AS n_top100_canonical_issue
  FROM key_pages AS k
  LEFT JOIN (SELECT DISTINCT crawl_id, url FROM iu WHERE topic = 'Canonical Tags') AS c ON c.crawl_id = k.crawl_id AND c.url = k.url
  GROUP BY k.crawl_id
),
-- sitemap URLs with noindex, none or unavailable_after
blocked AS (
  SELECT a.crawl_id, COUNT(DISTINCT a.url) AS n_key_urls_blocked_from_index
  FROM iu AS a JOIN iu AS b ON b.crawl_id = a.crawl_id AND b.url = a.url
  WHERE a.issue = 'Sitemaps: Non-Indexable URLs In Sitemap' AND b.issue IN ('Directives: Noindex', 'Directives: None', 'Directives: Unavailable_After')
  GROUP BY a.crawl_id
),
w AS (
  SELECT * FROM crawl
  LEFT JOIN iagg USING (crawl_id) LEFT JOIN dagg USING (crawl_id) LEFT JOIN pagg USING (crawl_id)
  LEFT JOIN kagg USING (crawl_id) LEFT JOIN blocked USING (crawl_id)
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
    STRUCT('XML Sitemap Quality' AS topic, 'n_sitemap_files_over_limit' AS metric, IF(n_issue_rows > 0 AND has_d3a81c54, CAST(u_3a2f2fcc + u_22ce3111 AS FLOAT64), NULL) AS value),
    STRUCT('XML Sitemap Quality' AS topic, 'pct_indexable_in_sitemap' AS metric, IF(n_issue_rows > 0 AND has_d3a81c54, CAST(SAFE_DIVIDE(indexable_html - x_9304b5d8, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Index Coverage' AS topic, 'n_key_urls_blocked_from_index' AS metric, IF(n_issue_rows > 0 AND has_d3a81c54, CAST(IFNULL(n_key_urls_blocked_from_index, 0) AS FLOAT64), NULL) AS value),
    STRUCT('Redirect Hygiene' AS topic, 'n_redirect_loops' AS metric, IF(n_issue_rows > 0, CAST(u_eef3ecd3 AS FLOAT64), NULL) AS value),
    STRUCT('Redirect Hygiene' AS topic, 'pct_redirects_in_chains' AS metric, IF(n_issue_rows > 0, CAST(IF(u_33c4c217 = 0, 0, SAFE_DIVIDE(u_1c92f7e8, u_33c4c217)) AS FLOAT64), NULL) AS value),
    STRUCT('Redirect Hygiene' AS topic, 'n_client_side_redirects' AS metric, IF(n_issue_rows > 0, CAST(d_148a40ae AS FLOAT64), NULL) AS value),
    STRUCT('Error Handling & Soft 404s' AS topic, 'n_soft_404_pages' AS metric, IF(n_issue_rows > 0, CAST(u_7c3db80a AS FLOAT64), NULL) AS value),
    STRUCT('Error Handling & Soft 404s' AS topic, 'pct_pages_linking_4xx' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(s_01135e13, internal_html) AS FLOAT64), NULL) AS value),
    STRUCT('Canonical Tags' AS topic, 'pct_indexable_canonical_issue' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(t_92606498, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Canonical Tags' AS topic, 'n_top100_canonical_issue' AS metric, IF(n_issue_rows > 0 AND n_pages > 0 AND n_pages_with_inlinks > 0, CAST(IFNULL(n_top100_canonical_issue, 0) AS FLOAT64), NULL) AS value),
    STRUCT('Head Integrity & File Size' AS topic, 'n_pages_elements_outside_head' AS metric, IF(n_issue_rows > 0, CAST(d_ff3af04b AS FLOAT64), NULL) AS value),
    STRUCT('Head Integrity & File Size' AS topic, 'n_pages_invalid_head' AS metric, IF(n_issue_rows > 0, CAST(d_0088d26d AS FLOAT64), NULL) AS value),
    STRUCT('Head Integrity & File Size' AS topic, 'n_files_over_2mb' AS metric, IF(n_issue_rows > 0, CAST(u_c76edf5c + u_2461fd2f AS FLOAT64), NULL) AS value),
    STRUCT('Content Without JavaScript' AS topic, 'pct_js_dependent_pages' AS metric, IF(n_issue_rows > 0 AND js_rendering IS TRUE, CAST(SAFE_DIVIDE(x_d5529adb, indexable_html) AS FLOAT64), NULL) AS value),
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
    STRUCT('Internationalisation' AS topic, 'pct_urls_hreflang_errors' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(t_e2403213, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Internationalisation' AS topic, 'has_x_default' AS metric, IF(n_issue_rows > 0 AND has_703bbc0f, CAST(IF(u_4688f680 > 0, 0, 1) AS FLOAT64), NULL) AS value),
    STRUCT('URL Structure' AS topic, 'pct_indexable_url_issue' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(t_79361c2e, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('URL Structure' AS topic, 'n_session_id_urls' AS metric, IF(n_pages > 0, CAST(n_session_id_urls AS FLOAT64), NULL) AS value),
    STRUCT('Internal Link Health' AS topic, 'n_links_to_localhost' AS metric, IF(n_issue_rows > 0, CAST(u_a2bf9f12 AS FLOAT64), NULL) AS value),
    STRUCT('Internal Link Health' AS topic, 'n_internal_nofollow' AS metric, IF(n_issue_rows > 0, CAST(u_452578a8 AS FLOAT64), NULL) AS value),
    STRUCT('Internal Link Health' AS topic, 'n_uncrawlable_nav_links' AS metric, IF(n_issue_rows > 0, CAST(u_bd5c7e6d AS FLOAT64), NULL) AS value),
    STRUCT('Click Depth of Key Pages' AS topic, 'n_top100_depth_over_3' AS metric, IF(n_pages > 0 AND n_pages_with_inlinks > 0 AND n_pages_with_depth > 0, CAST(n_top100_depth_over_3 AS FLOAT64), NULL) AS value),
    STRUCT('Click Depth of Key Pages' AS topic, 'n_top100_depth_over_4' AS metric, IF(n_pages > 0 AND n_pages_with_inlinks > 0 AND n_pages_with_depth > 0, CAST(n_top100_depth_over_4 AS FLOAT64), NULL) AS value),
    STRUCT('Mobile Parity' AS topic, 'n_pages_viewport_missing' AS metric, IF(n_issue_rows > 0 AND has_87d17f46, CAST(u_7e24dd67 AS FLOAT64), NULL) AS value),
    STRUCT('Page Titles' AS topic, 'n_indexable_missing_title' AS metric, IF(n_issue_rows > 0, CAST(x_aa971d69 AS FLOAT64), NULL) AS value),
    STRUCT('Page Titles' AS topic, 'pct_indexable_duplicate_title' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(x_d505380c, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Page Titles' AS topic, 'pct_indexable_title_over_561px' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(x_b23b16bb, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Heading Structure' AS topic, 'pct_indexable_missing_h1' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(x_61e739e8, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Heading Structure' AS topic, 'pct_indexable_duplicate_h1' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(x_c31b76b6, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Duplicate & Thin Content' AS topic, 'pct_indexable_duplicate_or_thin' AS metric, IF(n_issue_rows > 0, CAST(SAFE_DIVIDE(d_5ef2a5f4, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Content Hygiene' AS topic, 'n_placeholder_pages' AS metric, IF(n_issue_rows > 0, CAST(u_e1d7df99 AS FLOAT64), NULL) AS value),
    STRUCT('Content Hygiene' AS topic, 'pct_pages_spelling_grammar_errors' AS metric, IF(n_issue_rows > 0 AND hasi_0399c847, CAST(SAFE_DIVIDE(d_0a46721a, indexable_html) AS FLOAT64), NULL) AS value),
    STRUCT('Topic Clusters' AS topic, 'n_low_relevance_pages' AS metric, IF(n_issue_rows > 0 AND hasi_f791fda9, CAST(u_f791fda9 AS FLOAT64), NULL) AS value),
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
       user_agent, js_rendering, internal_html, indexable_html, external_urls, loaded_at
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
  UNION ALL SELECT audit_id, client, market, domain, tested_at, 'Verified agent access' FROM `YOUR_GCP_PROJECT.seo_raw.ai_bot_tests`
  UNION ALL SELECT audit_id, client, market, domain, tested_at, 'UCP agent test' FROM `YOUR_GCP_PROJECT.seo_raw.ucp_agent_tests`
  UNION ALL SELECT audit_id, client, market, domain, fetched_at, 'Ahrefs authority' FROM `YOUR_GCP_PROJECT.seo_raw.ahrefs_authority`
  UNION ALL SELECT audit_id, client, market, domain, fetched_at, 'Ahrefs authority' FROM `YOUR_GCP_PROJECT.seo_raw.ahrefs_citations`
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
