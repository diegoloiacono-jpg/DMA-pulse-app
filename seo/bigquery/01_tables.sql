-- Raw tables written by the SEO n8n workflows (one row per check, never aggregated in n8n).
-- Replace YOUR_GCP_PROJECT. Every row carries audit_id (from the DMA Pulse app), client, market and domain.
-- market is one code ('NL') or, when one run covers several markets, a list ('NL,BE'; the first is the primary market).
-- Metrics are computed from these tables in 02_metric_views.sql, so a definition change can be re-run on old data.

CREATE SCHEMA IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw` OPTIONS (location = "EU");

-- Workflow seo_psi_agentic: PageSpeed Insights, category AGENTIC_BROWSING, one row per page type URL
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.psi_agentic` (
  audit_id STRING, client STRING, market STRING, domain STRING,
  page_type STRING, url STRING, strategy STRING,
  fetched_at TIMESTAMP, http_status INT64, lighthouse_version STRING, final_url STRING,
  category_score FLOAT64,                                   -- 'agentic-browsing' category (experimental)
  agent_accessibility_tree_score FLOAT64, agent_accessibility_tree_mode STRING,
  cls_score FLOAT64,
  llms_txt_score FLOAT64, llms_txt_mode STRING,              -- mode 'notApplicable' = no llms.txt
  ard_schema_score FLOAT64, ard_schema_mode STRING,          -- ai-catalog.json (Agent Resource Discovery)
  webmcp_form_coverage_score FLOAT64, webmcp_form_coverage_mode STRING,
  webmcp_registered_tools_score FLOAT64, webmcp_registered_tools_mode STRING,
  webmcp_schema_validity_score FLOAT64, webmcp_schema_validity_mode STRING,
  agent_tree_details STRING,                                 -- failing items, JSON (truncated)
  error STRING,
  -- CrUX field data of the origin (originLoadingExperience, p75; added 25 Nov 2026): NULL when the origin has none
  crux_origin_lcp_ms INT64, crux_origin_inp_ms INT64, crux_origin_cls FLOAT64
) PARTITION BY DATE(fetched_at) CLUSTER BY client, domain;
ALTER TABLE `YOUR_GCP_PROJECT.seo_raw.psi_agentic` ADD COLUMN IF NOT EXISTS crux_origin_lcp_ms INT64,
  ADD COLUMN IF NOT EXISTS crux_origin_inp_ms INT64, ADD COLUMN IF NOT EXISTS crux_origin_cls FLOAT64;

-- Site checks (every run): robots.txt (status after redirects, Sitemap: lines), a non-existent URL and URL variants of the
-- homepage and up to 4 key pages (first response, no redirects followed). One row per request.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.site_checks` (
  audit_id STRING, client STRING, market STRING, domain STRING, checked_at TIMESTAMP,
  kind STRING,               -- robots, nonexistent, variant
  page_url STRING,           -- variant: the preferred URL it should lead to
  variant STRING,            -- variant: http, www, slash, uppercase, index
  url STRING, http_status INT64, location STRING, canonical STRING,
  outcome STRING,            -- variant: ok, 200_no_canonical, chain_or_302, other, not_tested
  n_sitemap_lines INT64,     -- robots: Sitemap: lines
  error STRING
) PARTITION BY DATE(checked_at) CLUSTER BY client, domain;

-- Page facts (every run): what the HTML of up to 15 key pages of the form shows, read from the full page
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.page_facts` (
  audit_id STRING, client STRING, market STRING, domain STRING, fetched_at TIMESTAMP,
  url STRING, is_home BOOL, http_status INT64,
  has_main BOOL, has_article BOOL, list_or_table_in_main BOOL,
  is_editorial BOOL,         -- Article markup, or a blog/news/knowledge URL
  author_visible BOOL, author_link BOOL, article_author_markup BOOL,
  date_modified DATE, date_published DATE, visible_date DATE,
  has_data_nosnippet BOOL, max_snippet INT64, snippet_documented BOOL,
  org_markup BOOL, org_markup_valid BOOL, n_sameas INT64,
  error STRING
) PARTITION BY DATE(fetched_at) CLUSTER BY client, domain;

-- Workflow seo_psi_agentic: status of /llms.txt and /.well-known/ai-catalog.json (first response, no redirects)
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.site_file_checks` (
  audit_id STRING, client STRING, market STRING, domain STRING,
  path STRING, url STRING, fetched_at TIMESTAMP,
  status_code INT64, content_type STRING, bytes INT64, location STRING, error STRING
) PARTITION BY DATE(fetched_at) CLUSTER BY client, domain;

-- Workflow seo_wikimedia: Wikidata items whose official website (P856) is the domain.
-- A row with item_id NULL means the query ran and found nothing.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.wikidata_items` (
  audit_id STRING, client STRING, market STRING, domain STRING, fetched_at TIMESTAMP,
  item_id STRING, item_label STRING, official_website STRING, wikipedia_sitelinks INT64, error STRING
) PARTITION BY DATE(fetched_at) CLUSTER BY client, domain;

-- Workflow seo_wikimedia: Wikipedia articles (namespace 0) linking to the domain, per language edition.
-- A row with page_title NULL means the query ran and found nothing.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.wikipedia_links` (
  audit_id STRING, client STRING, market STRING, domain STRING, fetched_at TIMESTAMP,
  wiki STRING, query STRING, page_id INT64, page_title STRING, link_url STRING, error STRING
) PARTITION BY DATE(fetched_at) CLUSTER BY client, domain;

-- Workflow seo_llm_page_scores: fixed-prompt LLM scoring of the raw HTML (no JavaScript), one row per page and task.
-- task: 'answer_first' | 'faq_coverage' | 'brand_consistency' (site level, url NULL)
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.llm_page_scores` (
  audit_id STRING, client STRING, market STRING, domain STRING,
  task STRING, url STRING, role STRING, fetched_at TIMESTAMP, http_status INT64,
  model STRING, prompt_version STRING, input_chars INT64,
  answers_first_paragraph BOOL, plain_language BOOL, follow_ups_covered BOOL, meets_rubric BOOL,
  has_faq_block BOOL, question_source STRING, questions_total INT64, questions_answered_in_faq INT64,
  questions_answered_on_page INT64, main_questions_answered BOOL,
  n_core_claims INT64, n_usps_contradicting INT64, n_claims_without_evidence INT64,
  result_json STRING, prompt_tokens INT64, output_tokens INT64, error STRING
) PARTITION BY DATE(fetched_at) CLUSTER BY client, domain;

-- AI bots: robots.txt per bot and a fetch of the tested URLs with each bot's user agent (one row per URL and bot).
-- bot_type: 'search' | 'user' (retrieval for answers) | 'training'. http_status NULL = robots.txt token only.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.ai_bot_tests` (
  audit_id STRING, client STRING, market STRING, domain STRING, tested_at TIMESTAMP,
  bot STRING, bot_type STRING, url STRING, robots_allowed BOOL, http_status INT64,
  blocked BOOL, block_signal STRING, error STRING
) PARTITION BY DATE(tested_at) CLUSTER BY client, domain;

-- Workflow seo_verified_agent: product, cart and checkout URLs requested as a signed agent (Cloudflare Browser Run)
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.verified_agent_tests` (
  audit_id STRING, client STRING, market STRING, domain STRING,
  role STRING, url STRING, tested_at TIMESTAMP, method STRING,
  browser_run_ok BOOL, html_chars INT64, page_title STRING,
  blocked BOOL, block_signal STRING,
  plain_status INT64, plain_blocked BOOL, error STRING
) PARTITION BY DATE(tested_at) CLUSTER BY client, domain;

-- UCP agent test (Agent Catalog Access (UCP)): one 'profile' row (/.well-known/ucp) and one 'search' row per test product,
-- searched as Artefact's read-only audit agent (UCP-Agent profile in agent_profile). Prices in major units (19.99).
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.ucp_agent_tests` (
  audit_id STRING, client STRING, market STRING, domain STRING,
  test STRING, tested_at TIMESTAMP, agent_profile STRING, url STRING, http_status INT64,
  ucp_version STRING, transports STRING, endpoint STRING,
  has_catalog_search BOOL, has_catalog_lookup BOOL, has_checkout BOOL,
  query STRING, n_results INT64, found BOOL, matched_by STRING,
  page_price FLOAT64, ucp_price FLOAT64, page_currency STRING, ucp_currency STRING,
  page_available BOOL, ucp_available BOOL, price_mismatch BOOL, availability_mismatch BOOL,
  messages STRING, error STRING
) PARTITION BY DATE(tested_at) CLUSTER BY client, domain;

-- Ahrefs authority: one row per Ahrefs request (call 'batch' has one row per site: client and competitors).
-- Only the columns of that call are filled. units_estimate = max(50, cost per row x rows), for cost tracking.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.ahrefs_authority` (
  audit_id STRING, client STRING, market STRING, domain STRING, fetched_at TIMESTAMP,
  call STRING,                 -- batch | history | refdomains | best_links | anchors | broken
  target STRING, role STRING,  -- role: client | competitor
  http_status INT64, n_rows INT64, capped BOOL, units_estimate INT64,
  domain_rating FLOAT64, refdomains INT64, refdomains_dofollow INT64, refdomains_12m_ago INT64,
  n_new_refdomains_5k INT64, n_pages_10plus INT64, n_refdomains_dr20_to_4xx INT64,
  anchor_refdomains_total INT64, anchor_refdomains_keyword INT64, anchor_refdomains_brand INT64,
  anchor_refdomains_url INT64, anchor_refdomains_generic INT64,
  details STRING, error STRING
) PARTITION BY DATE(fetched_at) CLUSTER BY client, domain;

-- Source Citations: per informational page, the external domains in the main content and their Domain Rating.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.ahrefs_citations` (
  audit_id STRING, client STRING, market STRING, domain STRING, fetched_at TIMESTAMP,
  url STRING, http_status INT64, n_external_links INT64, n_external_domains INT64,
  max_cited_dr FLOAT64, cites_dr50 BOOL, cited_domains STRING, units_estimate INT64, error STRING
) PARTITION BY DATE(fetched_at) CLUSTER BY client, domain;

-- One row per run of the SEO pulse checks, written first: the crawl uploaded with it in the same form (crawl_id, NULL
-- without a crawl), the checks selected, the brand terms and competitors of the form and the intake about the site
-- (section "About the site"; NULL = unknown). The DMA Pulse app offers a run and its crawl as one choice and builds the
-- brand context of the audit from that run: it has no brand context form for SEO.
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.pulse_runs` (
  audit_id STRING, crawl_id STRING, client STRING, market STRING, domain STRING, checks STRING, started_at TIMESTAMP,
  brand_terms STRING, competitors STRING,
  business_model STRING,      -- B2B, B2C or D2C
  online_sales BOOL, wikipedia_notable BOOL,
  training_bots STRING,       -- intended policy for AI training bots: allow or block
  nosnippet_pages STRING,     -- URLs or paths where nosnippet/max-snippet is intentional, one per line
  view_key STRING,            -- the random key of the results page link: the page shows the progress while the run is busy
  site_reachable BOOL,        -- did the homepage answer n8n at the start? FALSE = n8n's own requests to the site were skipped
  site_error STRING           -- why not (timeout, connection refused, DNS)
) PARTITION BY DATE(started_at) CLUSTER BY domain;
-- Added on 3 Nov 2026, for a table made before
ALTER TABLE `YOUR_GCP_PROJECT.seo_raw.pulse_runs` ADD COLUMN IF NOT EXISTS brand_terms STRING, ADD COLUMN IF NOT EXISTS competitors STRING;
ALTER TABLE `YOUR_GCP_PROJECT.seo_raw.pulse_runs` ADD COLUMN IF NOT EXISTS business_model STRING, ADD COLUMN IF NOT EXISTS online_sales BOOL,
  ADD COLUMN IF NOT EXISTS wikipedia_notable BOOL,
  ADD COLUMN IF NOT EXISTS training_bots STRING, ADD COLUMN IF NOT EXISTS nosnippet_pages STRING;
-- Added on 25 Nov 2026: the progress on the results page
ALTER TABLE `YOUR_GCP_PROJECT.seo_raw.pulse_runs` ADD COLUMN IF NOT EXISTS view_key STRING;
-- Added on 25 Nov 2026: the reachability check at the start of a run
ALTER TABLE `YOUR_GCP_PROJECT.seo_raw.pulse_runs` ADD COLUMN IF NOT EXISTS site_reachable BOOL, ADD COLUMN IF NOT EXISTS site_error STRING;
