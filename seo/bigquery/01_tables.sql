-- Raw tables written by the SEO n8n workflows (one row per check, never aggregated in n8n).
-- Replace YOUR_GCP_PROJECT. Every row carries audit_id (from the DMA Pulse app), client, market and domain.
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
  main_questions_answered BOOL,
  n_core_claims INT64, n_usps_contradicting INT64, n_claims_without_evidence INT64,
  result_json STRING, prompt_tokens INT64, output_tokens INT64, error STRING
) PARTITION BY DATE(fetched_at) CLUSTER BY client, domain;

-- Workflow seo_verified_agent: product, cart and checkout URLs requested as a signed agent (Cloudflare Browser Run)
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.seo_raw.verified_agent_tests` (
  audit_id STRING, client STRING, market STRING, domain STRING,
  role STRING, url STRING, tested_at TIMESTAMP, method STRING,
  browser_run_ok BOOL, html_chars INT64, page_title STRING,
  blocked BOOL, block_signal STRING,
  plain_status INT64, plain_blocked BOOL, error STRING
) PARTITION BY DATE(tested_at) CLUSTER BY client, domain;
