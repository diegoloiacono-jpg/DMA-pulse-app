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

-- FAQ & Question Coverage: share of the scored landing pages whose main questions are answered in a FAQ block
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
FROM agent GROUP BY audit_id;
