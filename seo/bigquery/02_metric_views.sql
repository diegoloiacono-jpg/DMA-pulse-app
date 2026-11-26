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
bots AS (
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.ai_bot_tests`
  WHERE error IS NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY audit_id, bot, url ORDER BY tested_at DESC) = 1
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
  SELECT DISTINCT audit_id, call, PERCENTILE_CONT(v, 0.5) OVER (PARTITION BY audit_id, call) AS median
  FROM (SELECT audit_id, call, CASE call WHEN 'batch' THEN refdomains_dofollow WHEN 'best_links' THEN n_pages_10plus
                                         WHEN 'refdomains' THEN n_new_refdomains_5k END AS v
        FROM ah WHERE role = 'competitor')
  WHERE v IS NOT NULL
),
ah_cite AS (
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.ahrefs_citations`
  WHERE error IS NULL AND cites_dr50 IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY audit_id, url ORDER BY fetched_at DESC) = 1
),
sc AS (
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.site_checks`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY audit_id, kind, IFNULL(url, '') ORDER BY checked_at DESC) = 1
),
pf AS (
  SELECT * FROM `YOUR_GCP_PROJECT.seo_raw.page_facts`
  WHERE error IS NULL AND http_status = 200
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

-- AI Crawler Access: search and retrieval bots (types search and user) disallowed in robots.txt for a tested URL, and
-- fetches with their user agent that got 401/403/429/503 or a challenge page
UNION ALL
SELECT audit_id, 'AI Crawler Access', 'n_retrieval_bots_blocked_robots',
       CAST(COUNT(DISTINCT IF(robots_allowed = FALSE, bot, NULL)) AS FLOAT64)
FROM bots WHERE bot_type IN ('search', 'user') AND robots_allowed IS NOT NULL
GROUP BY audit_id
UNION ALL
SELECT audit_id, 'AI Crawler Access', 'n_retrieval_bot_fetches_blocked', CAST(COUNTIF(blocked) AS FLOAT64)
FROM bots WHERE bot_type IN ('search', 'user') AND http_status IS NOT NULL
GROUP BY audit_id
-- training bots whose robots.txt rule differs from the training-bot policy of the pulse form (pulse_runs.training_bots)
UNION ALL
SELECT b.audit_id, 'AI Crawler Access', 'n_training_bot_policy_mismatches',
       CAST(COUNT(DISTINCT IF(b.robots_allowed != (r.training_bots = 'allow'), b.bot, NULL)) AS FLOAT64)
FROM bots AS b JOIN `YOUR_GCP_PROJECT.seo_raw.pulse_runs` AS r ON r.audit_id = b.audit_id
WHERE b.bot_type = 'training' AND b.robots_allowed IS NOT NULL AND r.training_bots IN ('allow', 'block')
GROUP BY b.audit_id

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
SELECT audit_id, 'Fresh Authoritative Links', 'median_competitor_new_refdomains_90d_5k', median
FROM ah_median WHERE call = 'refdomains'
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
FROM ah_cite GROUP BY audit_id

-- PageSpeed (LCP, INP, CLS, Performance Score): in v_sf_metrics (the CrUX of the origin from psi_agentic, else the pages' PageSpeed data of the crawl)

-- Robots.txt Configuration and Error Handling: the site checks of the run
UNION ALL
SELECT audit_id, 'Robots.txt Configuration', 'robots_status', CAST(http_status AS FLOAT64)
FROM sc WHERE kind = 'robots' AND http_status IS NOT NULL
UNION ALL
SELECT audit_id, 'Robots.txt Configuration', 'n_sitemap_lines', CAST(n_sitemap_lines AS FLOAT64)
FROM sc WHERE kind = 'robots' AND http_status = 200 AND n_sitemap_lines IS NOT NULL
UNION ALL
SELECT audit_id, 'Error Handling & Soft 404s', 'nonexistent_url_status', CAST(http_status AS FLOAT64)
FROM sc WHERE kind = 'nonexistent' AND http_status IS NOT NULL

-- Canonical Host & URL Variants: the variants of the homepage and up to 4 key pages (first response)
UNION ALL
SELECT audit_id, 'Canonical Host & URL Variants', 'n_variants_tested', CAST(COUNTIF(outcome != 'not_tested') AS FLOAT64)
FROM sc WHERE kind = 'variant' GROUP BY audit_id
UNION ALL
SELECT audit_id, 'Canonical Host & URL Variants', 'n_variants_ok', CAST(COUNTIF(outcome = 'ok') AS FLOAT64)
FROM sc WHERE kind = 'variant' GROUP BY audit_id HAVING COUNTIF(outcome != 'not_tested') > 0
UNION ALL
SELECT audit_id, 'Canonical Host & URL Variants', 'n_variants_200_no_canonical', CAST(COUNTIF(outcome = '200_no_canonical') AS FLOAT64)
FROM sc WHERE kind = 'variant' GROUP BY audit_id HAVING COUNTIF(outcome != 'not_tested') > 0
UNION ALL
SELECT audit_id, 'Canonical Host & URL Variants', 'n_variants_chain_or_302', CAST(COUNTIF(outcome = 'chain_or_302') AS FLOAT64)
FROM sc WHERE kind = 'variant' GROUP BY audit_id HAVING COUNTIF(outcome != 'not_tested') > 0

-- Organization Schema & sameAs: the homepage's markup
UNION ALL
SELECT audit_id, 'Organization Schema & sameAs', 'has_valid_org_markup_home', IF(LOGICAL_OR(org_markup_valid), 1.0, 0.0)
FROM pf WHERE is_home GROUP BY audit_id
UNION ALL
SELECT audit_id, 'Organization Schema & sameAs', 'n_sameas_profiles', CAST(MAX(IF(org_markup, n_sameas, 0)) AS FLOAT64)
FROM pf WHERE is_home GROUP BY audit_id

-- Semantic HTML and Structured Formatting: the key pages of the form
UNION ALL
SELECT audit_id, 'Semantic HTML', 'pct_indexable_main_or_article', AVG(IF(has_main OR has_article, 1.0, 0.0))
FROM pf GROUP BY audit_id
UNION ALL
SELECT audit_id, 'Structured Formatting', 'pct_content_pages_list_or_table', AVG(IF(list_or_table_in_main, 1.0, 0.0))
FROM pf WHERE NOT is_home GROUP BY audit_id

-- Author & E-E-A-T Signals: the editorial pages among them (no row without editorial pages)
UNION ALL
SELECT audit_id, 'Author & E-E-A-T Signals', 'pct_editorial_with_author', AVG(IF(author_visible OR article_author_markup, 1.0, 0.0))
FROM pf WHERE is_editorial GROUP BY audit_id
UNION ALL
SELECT audit_id, 'Author & E-E-A-T Signals', 'pct_editorial_full_author', AVG(IF(author_visible AND author_link AND article_author_markup, 1.0, 0.0))
FROM pf WHERE is_editorial GROUP BY audit_id

-- Content Freshness: content pages (not the homepage) updated within 12 months, and whose visible date matches dateModified
UNION ALL
SELECT audit_id, 'Content Freshness', 'pct_key_pages_updated_12m',
       AVG(IF(COALESCE(date_modified, visible_date, date_published) >= DATE_SUB(DATE(fetched_at), INTERVAL 12 MONTH), 1.0, 0.0))
FROM pf WHERE NOT is_home GROUP BY audit_id
UNION ALL
SELECT audit_id, 'Content Freshness', 'pct_key_pages_fresh_and_dated',
       AVG(IF(date_modified >= DATE_SUB(DATE(fetched_at), INTERVAL 12 MONTH) AND visible_date = date_modified, 1.0, 0.0))
FROM pf WHERE NOT is_home GROUP BY audit_id

-- Snippet Directives: key pages with data-nosnippet or a max-snippet limit that the pulse form does not list as intentional
UNION ALL
SELECT audit_id, 'Snippet Directives', 'n_top_urls_partial_snippet_undocumented',
       CAST(COUNTIF((has_data_nosnippet OR max_snippet > 0) AND NOT IFNULL(snippet_documented, FALSE)) AS FLOAT64)
FROM pf GROUP BY audit_id;
