-- Metrics for seo_criteria.py from the n8n raw tables, in long format: audit_id, topic, metric, value.
-- Metric names match SEO_TOPIC_METRICS / SEO_METRICS.md exactly; the DMA Pulse extractor pivots them into
-- metrics_by_topic. A metric that cannot be measured produces no row (= unknown), never a 0.
-- Re-runs within one audit: the latest row per key wins.

CREATE OR REPLACE VIEW `YOUR_GCP_PROJECT.seo_raw.v_topic_metrics_n8n` AS
WITH
psi AS (
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.psi_agentic`
  WHERE error IS NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY audit_id, url, strategy ORDER BY fetched_at DESC) = 1
),
files AS (
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.site_file_checks`
  WHERE error IS NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY audit_id, path ORDER BY fetched_at DESC) = 1
),
wd AS (
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.wikidata_items`
  WHERE error IS NULL
  QUALIFY DENSE_RANK() OVER (PARTITION BY audit_id ORDER BY fetched_at DESC) = 1
),
wp AS (
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.wikipedia_links`
  WHERE error IS NULL
  QUALIFY DENSE_RANK() OVER (PARTITION BY audit_id ORDER BY fetched_at DESC) = 1
),
llm AS (
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.llm_page_scores`
  WHERE error IS NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY audit_id, task, IFNULL(url, '') ORDER BY fetched_at DESC) = 1
),
agent AS (
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.verified_agent_tests`
  WHERE method = 'cloudflare_browser_run' AND browser_run_ok
  QUALIFY ROW_NUMBER() OVER (PARTITION BY audit_id, url ORDER BY tested_at DESC) = 1
),
ucp_profile AS (
  -- a network error is no measurement; a 404 is (no profile)
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.ucp_agent_tests`
  WHERE test = 'profile' AND error IS NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY audit_id ORDER BY tested_at DESC) = 1
),
ucp_search AS (
  -- searches that returned a response; failed searches and unreadable product pages are left out
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.ucp_agent_tests`
  WHERE test = 'search' AND error IS NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY audit_id, url ORDER BY tested_at DESC) = 1
),
ah AS (
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.ahrefs_authority`
  WHERE error IS NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY audit_id, call, target ORDER BY fetched_at DESC) = 1
),
ah_median AS (
  -- medians of the competitors (exact, also for an even number of competitors)
  SELECT DISTINCT audit_id, call,
         PERCENTILE_CONT(IF(call = 'batch', refdomains_dofollow, n_pages_10plus), 0.5) OVER (PARTITION BY audit_id, call) AS median
  FROM ah
  WHERE role = 'competitor' AND call IN ('batch', 'best_links')
    AND IF(call = 'batch', refdomains_dofollow, n_pages_10plus) IS NOT NULL
),
ah_cite AS (
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.ahrefs_citations`
  WHERE error IS NULL AND cites_dr50 IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY audit_id, url ORDER BY fetched_at DESC) = 1
)

-- Agent Accessibility Tree: key templates where the Lighthouse audit does not fully pass
SELECT audit_id, 'Agent Accessibility Tree' AS topic, 'n_templates_lighthouse_agent_failed' AS metric,
       CAST(COUNT(DISTINCT IF(agent_accessibility_tree_score < 1, page_type, NULL)) AS FLOAT64) AS value
FROM psi WHERE agent_accessibility_tree_mode != 'notApplicable' AND agent_accessibility_tree_score IS NOT NULL
GROUP BY audit_id

-- llms.txt & ai-catalog.json Hygiene: status codes (first response) ...
UNION ALL
SELECT audit_id, 'llms.txt & ai-catalog.json Hygiene',
       IF(path = '/llms.txt', 'llms_txt_status', 'ai_catalog_status'), CAST(status_code AS FLOAT64)
FROM files WHERE status_code IS NOT NULL
-- ... and validity from Lighthouse (no row when the audit is not applicable, i.e. no file)
UNION ALL
SELECT audit_id, 'llms.txt & ai-catalog.json Hygiene', 'is_llms_txt_valid', IF(MIN(llms_txt_score) >= 1, 1.0, 0.0)
FROM psi WHERE llms_txt_mode NOT IN ('notApplicable', 'error') AND llms_txt_score IS NOT NULL
GROUP BY audit_id
UNION ALL
SELECT audit_id, 'llms.txt & ai-catalog.json Hygiene', 'is_ai_catalog_valid', IF(MIN(ard_schema_score) >= 1, 1.0, 0.0)
FROM psi WHERE ard_schema_mode NOT IN ('notApplicable', 'error') AND ard_schema_score IS NOT NULL
GROUP BY audit_id

-- WebMCP Readiness: schema failures (often not applicable in PSI while WebMCP is an origin trial)
UNION ALL
SELECT audit_id, 'WebMCP Readiness', 'n_webmcp_schema_failures',
       CAST(COUNT(DISTINCT IF(webmcp_schema_validity_score < 1, page_type, NULL)) AS FLOAT64)
FROM psi WHERE webmcp_schema_validity_mode NOT IN ('notApplicable', 'error') AND webmcp_schema_validity_score IS NOT NULL
GROUP BY audit_id

-- Wikipedia & Wikidata
UNION ALL
SELECT audit_id, 'Wikipedia & Wikidata', 'has_wikidata_item', IF(COUNTIF(item_id IS NOT NULL) > 0, 1.0, 0.0)
FROM wd GROUP BY audit_id
UNION ALL
SELECT audit_id, 'Wikipedia & Wikidata', 'n_wikipedia_links',
       CAST(COUNT(DISTINCT IF(page_title IS NOT NULL, CONCAT(wiki, ':', page_title), NULL)) AS FLOAT64)
FROM wp GROUP BY audit_id

-- Answer-First Content: share of the scored top landing pages that meet the rubric
UNION ALL
SELECT audit_id, 'Answer-First Content', 'pct_top20_meet_answer_rubric', AVG(IF(meets_rubric, 1.0, 0.0))
FROM llm WHERE task = 'answer_first' AND meets_rubric IS NOT NULL
GROUP BY audit_id

-- FAQ & Question Coverage: share of the scored landing pages that answer their main questions on the page (a FAQ block
-- is not required); the FAQ / customer service page counts when it answers them, brand questions included, in its FAQ
UNION ALL
SELECT audit_id, 'FAQ & Question Coverage', 'pct_top50_questions_answered', AVG(IF(main_questions_answered, 1.0, 0.0))
FROM llm WHERE task = 'faq_coverage' AND main_questions_answered IS NOT NULL
GROUP BY audit_id

-- Brand Consistency (one site-level row per audit)
UNION ALL
SELECT audit_id, 'Brand Consistency', 'n_usps_contradicting', CAST(n_usps_contradicting AS FLOAT64)
FROM llm WHERE task = 'brand_consistency' AND n_usps_contradicting IS NOT NULL
UNION ALL
SELECT audit_id, 'Brand Consistency', 'n_claims_without_evidence', CAST(n_claims_without_evidence AS FLOAT64)
FROM llm WHERE task = 'brand_consistency' AND n_claims_without_evidence IS NOT NULL

-- Verified Agent Access: product, cart and checkout URLs where the signed agent got a block or challenge
UNION ALL
SELECT audit_id, 'Verified Agent Access', 'n_verified_agent_blocks', CAST(COUNTIF(blocked) AS FLOAT64)
FROM agent GROUP BY audit_id

-- Agent Catalog Access (UCP): profile, catalog search, and the agent search for the test products
UNION ALL
SELECT audit_id, 'Agent Catalog Access (UCP)', 'has_ucp_profile', IF(http_status = 200 AND ucp_version IS NOT NULL, 1.0, 0.0)
FROM ucp_profile
UNION ALL
SELECT audit_id, 'Agent Catalog Access (UCP)', 'has_ucp_catalog_search', IF(IFNULL(has_catalog_search, FALSE), 1.0, 0.0)
FROM ucp_profile
UNION ALL
SELECT audit_id, 'Agent Catalog Access (UCP)', 'has_ucp_catalog_rest', IF(IFNULL(has_catalog_search, FALSE) AND endpoint IS NOT NULL, 1.0, 0.0)
FROM ucp_profile WHERE http_status = 200 AND ucp_version IS NOT NULL
UNION ALL
SELECT audit_id, 'Agent Catalog Access (UCP)', 'pct_test_products_found', AVG(IF(IFNULL(found, FALSE), 1.0, 0.0))
FROM ucp_search GROUP BY audit_id
UNION ALL
SELECT audit_id, 'Agent Catalog Access (UCP)', 'n_ucp_price_availability_mismatches',
       CAST(COUNTIF(IFNULL(found, FALSE) AND (IFNULL(price_mismatch, FALSE) OR IFNULL(availability_mismatch, FALSE))) AS FLOAT64)
FROM ucp_search GROUP BY audit_id

-- Ahrefs authority: client values, and ratios against the median competitor
UNION ALL
SELECT c.audit_id, 'Referring Domain Strength', 'refdomains_vs_median_competitor', SAFE_DIVIDE(c.refdomains_dofollow, m.median)
FROM ah AS c JOIN ah_median AS m ON m.audit_id = c.audit_id AND m.call = 'batch'
WHERE c.call = 'batch' AND c.role = 'client' AND c.refdomains_dofollow IS NOT NULL AND m.median > 0
UNION ALL
SELECT audit_id, 'Referring Domain Strength', 'refdomains_growth_12m', SAFE_DIVIDE(refdomains - refdomains_12m_ago, refdomains_12m_ago)
FROM ah WHERE call = 'history' AND role = 'client' AND refdomains IS NOT NULL AND refdomains_12m_ago > 0
UNION ALL
SELECT audit_id, 'Referring Domain Strength', 'domain_rating', domain_rating
FROM ah WHERE call = 'batch' AND role = 'client' AND domain_rating IS NOT NULL
UNION ALL
SELECT audit_id, 'Fresh Authoritative Links', 'n_new_refdomains_90d_5k', CAST(n_new_refdomains_5k AS FLOAT64)
FROM ah WHERE call = 'refdomains' AND role = 'client' AND n_new_refdomains_5k IS NOT NULL
UNION ALL
SELECT audit_id, 'Link-Earning Pages', 'n_pages_10plus_refdomains', CAST(n_pages_10plus AS FLOAT64)
FROM ah WHERE call = 'best_links' AND role = 'client' AND n_pages_10plus IS NOT NULL
UNION ALL
SELECT audit_id, 'Link-Earning Pages', 'median_competitor_pages_10plus', median
FROM ah_median WHERE call = 'best_links'
UNION ALL
SELECT audit_id, 'Anchor Text Profile', 'pct_refdomains_exact_match_anchor', SAFE_DIVIDE(anchor_refdomains_keyword, anchor_refdomains_total)
FROM ah WHERE call = 'anchors' AND role = 'client' AND anchor_refdomains_total > 0
UNION ALL
SELECT audit_id, 'Broken Backlinks', 'n_refdomains_dr20_to_4xx', CAST(n_refdomains_dr20_to_4xx AS FLOAT64)
FROM ah WHERE call = 'broken' AND role = 'client' AND n_refdomains_dr20_to_4xx IS NOT NULL
UNION ALL
SELECT audit_id, 'Source Citations', 'pct_info_pages_citing_dr50', AVG(IF(cites_dr50, 1.0, 0.0))
FROM ah_cite GROUP BY audit_id;
