// Demo data for the SEO tab: one audit made with the real SEO pipeline on fake BigQuery data and a
// fake model (explanations start with [demo]). Lets the tab be shown without a backend, e.g. in Lovable.
// Regenerate with make_seo_demo.py; not real client data.
import type { BrandContext } from "@/utils/brandContext";
import type { ScoringOutput, SpecialistResult } from "@/lib/apiClient";

export const SEO_DEMO_BRAND_CONTEXT: BrandContext = {
  "brandName": "Demo Client",
  "model": "B2C",
  "namingConvention": "",
  "demographics": "",
  "selectedPlatforms": [],
  "industry": "Retail",
  "hasCrmData": false,
  "hasProductFeed": false,
  "seo": {
    "siteUrl": "www.demo-client.nl",
    "brandTerms": [
      "demo client",
      "democlient"
    ],
    "competitors": [
      "competitor-a.nl",
      "competitor-b.nl"
    ],
    "pageTypes": {},
    "keywordMappingUrl": "",
    "keywordMappingDate": "",
    "hasOnlineSales": true,
    "lowSearchVolume": false,
    "locations": 0,
    "reviewPlatforms": [],
    "expectedProfiles": [],
    "aiBotPolicy": {},
    "snippetExceptions": [],
    "aiShoppingPlatforms": []
  }
};

export const SEO_DEMO_DOMAIN = "www.demo-client.nl";

export const SEO_DEMO_RESULTS: SpecialistResult[] = [
  {
    "topic": "Robots.txt Configuration",
    "category": "crawling_indexing",
    "status": "pass",
    "level": "basic",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] robots_status = 200.0, n_sitemap_lines = 10.0, n_blocked_key_urls = 0.0; rule: robots_status == 200 and n_sitemap_lines > 0 and n_blocked_key_urls == 0 and n_blocked_render_resources == 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "HTTPS & Mixed Content",
    "category": "crawling_indexing",
    "status": "fail",
    "level": "basic",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind HTTPS & Mixed Content until the pass condition holds.",
    "explanation": "[demo] n_http_urls = 0.0, n_http_not_single_301 = 3.0, n_mixed_content_pages = 100.0; rule: n_mixed_content_pages > 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Canonical Host & URL Variants",
    "category": "crawling_indexing",
    "status": "pass",
    "level": "basic",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_variants_tested = 100.0, n_variants_ok = 100.0, n_variants_200_no_canonical = 0.0; rule: n_variants_ok == n_variants_tested.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Server Stability",
    "category": "crawling_indexing",
    "status": "warn",
    "level": "basic",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Server Stability until the pass condition holds.",
    "explanation": "[demo] n_5xx_or_no_response = 0.0, n_5xx_key_urls = 0.0, median_response_time_s = 1.0; rule: pass condition not met: median_response_time_s < 0.6.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "XML Sitemap Quality",
    "category": "crawling_indexing",
    "status": "pass",
    "level": "basic",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] has_sitemap = 1.0, n_sitemap_errors_gsc = 0.0, n_sitemap_files_over_limit = 0.0; rule: n_sitemap_files_over_limit == 0 and pct_non_indexable_in_sitemap <= 0.01 and pct_indexable_in_sitemap >= 0.95.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Bing Webmaster Tools & IndexNow",
    "category": "crawling_indexing",
    "status": "warn",
    "level": "advanced",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Index Coverage",
    "category": "crawling_indexing",
    "status": "warn",
    "level": "basic",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Redirect Hygiene",
    "category": "crawling_indexing",
    "status": "warn",
    "level": "advanced",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Redirect Hygiene until the pass condition holds.",
    "explanation": "[demo] n_redirect_loops = 0.0, pct_redirects_in_chains = 0.03, n_client_side_redirects = 0.0; rule: pass condition not met: pct_redirects_in_chains <= 0.01.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Error Handling & Soft 404s",
    "category": "crawling_indexing",
    "status": "pass",
    "level": "basic",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] nonexistent_url_status = 404.0, n_soft_404_pages = 0.0, pct_pages_linking_4xx = 0.0; rule: nonexistent_url_status in (404, 410) and n_soft_404_pages == 0 and pct_pages_linking_4xx <= 0.005.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Canonical Tags",
    "category": "crawling_indexing",
    "status": "pass",
    "level": "basic",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_indexable_canonical_issue = 0.0, n_top100_canonical_issue = 0.0, n_top100_canonical_overridden = 0.0; rule: pct_indexable_canonical_issue <= 0.01 and n_top100_canonical_issue == 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Head Integrity & File Size",
    "category": "crawling_indexing",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_pages_elements_outside_head = 0.0, n_pages_invalid_head = 0.0, n_files_over_2mb = 0.0; rule: n_pages_invalid_head == 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Content Without JavaScript",
    "category": "crawling_indexing",
    "status": "fail",
    "level": "basic",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Content Without JavaScript until the pass condition holds.",
    "explanation": "[demo] pct_js_dependent_pages = 0.12, pct_pages_js_only_nav_links = 0.97, pct_core_elements_render_only = 1.0; rule: pct_pages_js_only_nav_links > 0.20.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Rendering Strategy",
    "category": "crawling_indexing",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_page_types_client_side_only = 0.0, pct_pages_click_loaded_text = 0.0, pct_pages_js_lazy_images = 0.005; rule: pct_pages_click_loaded_text <= 0.05 and pct_pages_js_lazy_images <= 0.05 and is_dynamic_rendering == 0 or pct_pages_bot_user_diff <= 0.02.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Parameters & Faceted Navigation",
    "category": "crawling_indexing",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_indexable_parameter_urls = 0.0, n_indexable_internal_search = 0.0, n_internal_links_with_tracking = 0.0; rule: pct_parameter_urls < 0.20 and n_demand_facets_static == n_demand_facets.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Pagination",
    "category": "crawling_indexing",
    "status": "warn",
    "level": "advanced",
    "source": "no_data_source",
    "action": "[demo] Measure this topic: its metrics are missing.",
    "explanation": "[demo] No metrics for this topic in the latest data.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Internationalisation",
    "category": "crawling_indexing",
    "status": "pass",
    "level": "basic",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] Not applicable: n_market_languages <= 1.",
    "human_override": false,
    "not_applicable": true
  },
  {
    "topic": "URL Structure",
    "category": "site_structure",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_indexable_url_issue = 0.005, n_session_id_urls = 0.0; rule: pct_indexable_url_issue <= 0.02.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Internal Link Health",
    "category": "site_structure",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_internal_links_to_3xx_4xx = 0.005, n_uncrawlable_nav_links = 0.0, n_links_to_localhost = 0.0; rule: pct_internal_links_to_3xx_4xx <= 0.02 and n_links_to_localhost == 0 and n_internal_nofollow == 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Click Depth of Key Pages",
    "category": "site_structure",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_top100_depth_over_3 = 0.0, n_top100_depth_over_4 = 0.0; rule: n_top100_depth_over_3 == 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Orphan Pages",
    "category": "site_structure",
    "status": "fail",
    "level": "advanced",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Orphan Pages until the pass condition holds.",
    "explanation": "[demo] pct_click_urls_orphaned = 1.0, pct_click_urls_weakly_linked = 0.5; rule: pct_click_urls_weakly_linked > 0.05.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Core Web Vitals",
    "category": "performance_mobile",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] has_crux_origin = 1.0, n_cwv_failed_mobile = 0.0; rule: n_cwv_failed_mobile == 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Mobile Parity",
    "category": "performance_mobile",
    "status": "warn",
    "level": "basic",
    "source": "no_data_source",
    "action": "[demo] Measure this topic: its metrics are missing.",
    "explanation": "[demo] No metrics for this topic in the latest data.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Image Weight & Format",
    "category": "performance_mobile",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_images_over_100kb = 0.03, n_unsized_lcp_images = 0.0, n_unsized_images_causing_cls = 0.0; rule: pct_images_over_100kb <= 0.10 and n_unsized_lcp_images == 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Page Titles",
    "category": "onpage_content",
    "status": "pass",
    "level": "basic",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_indexable_missing_title = 0.0, pct_indexable_duplicate_title = 0.03, pct_indexable_title_over_561px = 0.12; rule: pct_indexable_duplicate_title <= 0.05 and pct_indexable_title_over_561px <= 0.20.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Meta Descriptions",
    "category": "onpage_content",
    "status": "warn",
    "level": "basic",
    "source": "no_data_source",
    "action": "[demo] Measure this topic: its metrics are missing.",
    "explanation": "[demo] No metrics for this topic in the latest data.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Heading Structure",
    "category": "onpage_content",
    "status": "pass",
    "level": "basic",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_indexable_missing_h1 = 0.005, pct_indexable_duplicate_h1 = 0.005; rule: pct_indexable_missing_h1 <= 0.01 and pct_indexable_duplicate_h1 <= 0.05.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Image Alt Text",
    "category": "onpage_content",
    "status": "fail",
    "level": "basic",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Image Alt Text until the pass condition holds.",
    "explanation": "[demo] pct_content_images_missing_alt = 0.5; rule: pct_content_images_missing_alt > 0.20.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Duplicate & Thin Content",
    "category": "onpage_content",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_indexable_duplicate_or_thin = 0.0, n_same_language_markets_unlinked = 0.0; rule: pct_indexable_duplicate_or_thin <= 0.02 and n_same_language_markets_unlinked == 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Index Bloat",
    "category": "onpage_content",
    "status": "warn",
    "level": "advanced",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Content Hygiene",
    "category": "onpage_content",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_placeholder_pages = 0.0, pct_pages_spelling_grammar_errors = 0.0; rule: pct_pages_spelling_grammar_errors <= 0.05.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Structured Data",
    "category": "onpage_content",
    "status": "fail",
    "level": "advanced",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Structured Data until the pass condition holds.",
    "explanation": "[demo] n_page_types_with_sd_errors = 3.0, pct_pages_expected_type = 0.12; rule: n_page_types_with_sd_errors > 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Content Freshness",
    "category": "onpage_content",
    "status": "pass",
    "level": "expert",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_key_pages_updated_12m = 0.97, pct_key_pages_fresh_and_dated = 1.0, n_date_refresh_without_change = 0.0; rule: pct_key_pages_fresh_and_dated >= 0.70.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Answer-First Content",
    "category": "onpage_content",
    "status": "warn",
    "level": "expert",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Answer-First Content until the pass condition holds.",
    "explanation": "[demo] pct_top20_meet_answer_rubric = 0.5; rule: pass condition not met: pct_top20_meet_answer_rubric >= 0.80.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "FAQ & Question Coverage",
    "category": "onpage_content",
    "status": "warn",
    "level": "expert",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Topic Clusters",
    "category": "onpage_content",
    "status": "warn",
    "level": "expert",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Source Citations",
    "category": "onpage_content",
    "status": "warn",
    "level": "expert",
    "source": "no_data_source",
    "action": "[demo] Measure this topic: its metrics are missing.",
    "explanation": "[demo] No metrics for this topic in the latest data.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Structured Formatting",
    "category": "onpage_content",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_content_pages_list_or_table = 0.97; rule: pct_content_pages_list_or_table >= 0.60.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Semantic HTML",
    "category": "onpage_content",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_indexable_main_or_article = 0.97; rule: pct_indexable_main_or_article >= 0.90.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Author & E-E-A-T Signals",
    "category": "onpage_content",
    "status": "fail",
    "level": "expert",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Author & E-E-A-T Signals until the pass condition holds.",
    "explanation": "[demo] pct_editorial_with_author = 0.0, pct_editorial_full_author = 0.12; rule: pct_editorial_with_author < 0.40.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Accessibility",
    "category": "onpage_content",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_pages_accessibility_good = 0.97, n_templates_high_violations = 0.0; rule: pct_pages_accessibility_good >= 0.90 and n_templates_high_violations == 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Referring Domain Strength",
    "category": "authority_entity",
    "status": "warn",
    "level": "champion",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Referring Domain Strength until the pass condition holds.",
    "explanation": "[demo] refdomains_vs_median_competitor = 3.0, refdomains_growth_12m = 0.0, domain_rating = 1.0; rule: pass condition not met: refdomains_growth_12m > 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Fresh Authoritative Links",
    "category": "authority_entity",
    "status": "pass",
    "level": "expert",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_new_refdomains_90d_5k = 10.0, target_new_refdomains = 1.0; rule: n_new_refdomains_90d_5k >= target_new_refdomains.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Link-Earning Pages",
    "category": "authority_entity",
    "status": "pass",
    "level": "champion",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_pages_10plus_refdomains = 10.0, median_competitor_pages_10plus = 3.0; rule: n_pages_10plus_refdomains >= 10 and n_pages_10plus_refdomains >= median_competitor_pages_10plus.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Anchor Text Profile",
    "category": "authority_entity",
    "status": "warn",
    "level": "advanced",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Broken Backlinks",
    "category": "authority_entity",
    "status": "warn",
    "level": "advanced",
    "source": "no_data_source",
    "action": "[demo] Measure this topic: its metrics are missing.",
    "explanation": "[demo] No metrics for this topic in the latest data.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Organization Schema & sameAs",
    "category": "authority_entity",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] has_valid_org_markup_home = 1.0, n_sameas_profiles = 10.0; rule: n_sameas_profiles >= 3.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "External Profiles",
    "category": "authority_entity",
    "status": "warn",
    "level": "advanced",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Community Mentions",
    "category": "authority_entity",
    "status": "warn",
    "level": "expert",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Presence on AI-Cited Domains",
    "category": "authority_entity",
    "status": "warn",
    "level": "champion",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Brand Consistency",
    "category": "authority_entity",
    "status": "warn",
    "level": "expert",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Authority Pages",
    "category": "authority_entity",
    "status": "pass",
    "level": "basic",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] has_about_page = 1.0, has_contact_page = 1.0, is_about_contact_linked = 1.0; rule: n_authority_pages_missing == 0 and n_authority_pages_not_in_footer == 0 and n_authority_pages_stale == 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Wikipedia & Wikidata",
    "category": "authority_entity",
    "status": "pass",
    "level": "champion",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] is_notable = 1.0, has_wikidata_item = 1.0, n_wikipedia_links = 10.0; rule: has_wikidata_item == 1 and n_wikipedia_links >= 1.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Google Business Profile",
    "category": "reputation_local",
    "status": "warn",
    "level": "basic",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Review Collection",
    "category": "reputation_local",
    "status": "warn",
    "level": "expert",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "AI Crawler Access",
    "category": "ai_search_readiness",
    "status": "warn",
    "level": "basic",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind AI Crawler Access until the pass condition holds.",
    "explanation": "[demo] n_retrieval_bots_blocked_robots = 0.0, n_retrieval_bot_fetches_blocked = 0.0, is_waf_result_confirmed = 0.0; rule: is_waf_result_confirmed == 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Snippet Directives",
    "category": "ai_search_readiness",
    "status": "warn",
    "level": "basic",
    "source": "no_data_source",
    "action": "[demo] Measure this topic: its metrics are missing.",
    "explanation": "[demo] No metrics for this topic in the latest data.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Agent Accessibility Tree",
    "category": "ai_search_readiness",
    "status": "pass",
    "level": "champion",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_pages_no_agent_violation = 1.0, n_templates_unnamed_controls = 0.0, n_templates_lighthouse_agent_failed = 0.0; rule: pct_pages_no_agent_violation >= 0.95 and n_templates_lighthouse_agent_failed == 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "llms.txt & ai-catalog.json Hygiene",
    "category": "ai_search_readiness",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] llms_txt_status = 200.0, ai_catalog_status = 404.0, is_llms_txt_valid = 1.0; rule: llms_txt_status in (200, 404, 410) and ai_catalog_status in (200, 404, 410).",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "WebMCP Readiness",
    "category": "ai_search_readiness",
    "status": "fail",
    "level": "champion",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind WebMCP Readiness until the pass condition holds.",
    "explanation": "[demo] n_key_task_forms = 10.0, n_key_forms_webmcp = 10.0, n_webmcp_schema_failures = 100.0; rule: n_webmcp_schema_failures > 0.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Merchant Center Feed & Free Listings",
    "category": "agentic_commerce",
    "status": "warn",
    "level": "basic",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Product Data Consistency",
    "category": "agentic_commerce",
    "status": "warn",
    "level": "advanced",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "AI Shopping Feed Distribution",
    "category": "agentic_commerce",
    "status": "warn",
    "level": "champion",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Agentic Checkout Readiness",
    "category": "agentic_commerce",
    "status": "warn",
    "level": "champion",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false
  },
  {
    "topic": "Verified Agent Access",
    "category": "agentic_commerce",
    "status": "warn",
    "level": "expert",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Verified Agent Access until the pass condition holds.",
    "explanation": "[demo] n_verified_agent_blocks = 0.0, is_agent_policy_documented = 0.0; rule: pass condition not met: is_agent_policy_documented == 1.",
    "human_override": false,
    "not_applicable": false
  }
];

export const SEO_DEMO_SCORING: ScoringOutput = {
  "platform_id": "seo",
  "category_scores": [
    {
      "name": "crawling_indexing",
      "score": 72.2,
      "pass_rate": 66.7,
      "weight": 1.0
    },
    {
      "name": "site_structure",
      "score": 71.4,
      "pass_rate": 75.0,
      "weight": 1.0
    },
    {
      "name": "performance_mobile",
      "score": 100.0,
      "pass_rate": 100.0,
      "weight": 1.0
    },
    {
      "name": "onpage_content",
      "score": 70.7,
      "pass_rate": 66.7,
      "weight": 1.0
    },
    {
      "name": "authority_entity",
      "score": 86.8,
      "pass_rate": 83.3,
      "weight": 1.0
    },
    {
      "name": "ai_search_readiness",
      "score": 77.3,
      "pass_rate": 66.7,
      "weight": 1.0
    },
    {
      "name": "agentic_commerce",
      "score": 50.0,
      "pass_rate": 0.0,
      "weight": 1.0
    }
  ],
  "platform_score": 75.5,
  "omnichannel_score": null,
  "maturity_label": "Basic",
  "quick_wins": [
    {
      "topic": "Server Stability",
      "category": "crawling_indexing",
      "impact": 5.0,
      "confidence": 5.0,
      "ease": 3.0,
      "priority_score": 8.67,
      "action": "[demo] Fix the issues behind Server Stability until the pass condition holds.",
      "explanation": "[demo] n_5xx_or_no_response = 0.0, n_5xx_key_urls = 0.0, median_response_time_s = 1.0; rule: pass condition not met: median_response_time_s < 0.6.",
      "human_override": false
    },
    {
      "topic": "Redirect Hygiene",
      "category": "crawling_indexing",
      "impact": 5.0,
      "confidence": 4.0,
      "ease": 4.0,
      "priority_score": 8.67,
      "action": "[demo] Fix the issues behind Redirect Hygiene until the pass condition holds.",
      "explanation": "[demo] n_redirect_loops = 0.0, pct_redirects_in_chains = 0.03, n_client_side_redirects = 0.0; rule: pass condition not met: pct_redirects_in_chains <= 0.01.",
      "human_override": false
    },
    {
      "topic": "AI Crawler Access",
      "category": "ai_search_readiness",
      "impact": 5.0,
      "confidence": 5.0,
      "ease": 3.0,
      "priority_score": 8.67,
      "action": "[demo] Fix the issues behind AI Crawler Access until the pass condition holds.",
      "explanation": "[demo] n_retrieval_bots_blocked_robots = 0.0, n_retrieval_bot_fetches_blocked = 0.0, is_waf_result_confirmed = 0.0; rule: is_waf_result_confirmed == 0.",
      "human_override": false
    },
    {
      "topic": "HTTPS & Mixed Content",
      "category": "crawling_indexing",
      "impact": 5.0,
      "confidence": 4.0,
      "ease": 3.0,
      "priority_score": 8.0,
      "action": "[demo] Fix the issues behind HTTPS & Mixed Content until the pass condition holds.",
      "explanation": "[demo] n_http_urls = 0.0, n_http_not_single_301 = 3.0, n_mixed_content_pages = 100.0; rule: n_mixed_content_pages > 0.",
      "human_override": false
    },
    {
      "topic": "Structured Data",
      "category": "onpage_content",
      "impact": 5.0,
      "confidence": 4.0,
      "ease": 3.0,
      "priority_score": 8.0,
      "action": "[demo] Fix the issues behind Structured Data until the pass condition holds.",
      "explanation": "[demo] n_page_types_with_sd_errors = 3.0, pct_pages_expected_type = 0.12; rule: n_page_types_with_sd_errors > 0.",
      "human_override": false
    },
    {
      "topic": "Content Without JavaScript",
      "category": "crawling_indexing",
      "impact": 5.0,
      "confidence": 4.0,
      "ease": 2.0,
      "priority_score": 7.33,
      "action": "[demo] Fix the issues behind Content Without JavaScript until the pass condition holds.",
      "explanation": "[demo] pct_js_dependent_pages = 0.12, pct_pages_js_only_nav_links = 0.97, pct_core_elements_render_only = 1.0; rule: pct_pages_js_only_nav_links > 0.20.",
      "human_override": false
    },
    {
      "topic": "Orphan Pages",
      "category": "site_structure",
      "impact": 4.0,
      "confidence": 3.0,
      "ease": 4.0,
      "priority_score": 7.33,
      "action": "[demo] Fix the issues behind Orphan Pages until the pass condition holds.",
      "explanation": "[demo] pct_click_urls_orphaned = 1.0, pct_click_urls_weakly_linked = 0.5; rule: pct_click_urls_weakly_linked > 0.05.",
      "human_override": false
    },
    {
      "topic": "Google Business Profile",
      "category": "reputation_local",
      "impact": 4.0,
      "confidence": 2.0,
      "ease": 5.0,
      "priority_score": 7.33,
      "action": "Verify manually — this data is not in BigQuery yet",
      "explanation": "[demo] No data source for this topic yet.",
      "human_override": false
    },
    {
      "topic": "Image Alt Text",
      "category": "onpage_content",
      "impact": 3.0,
      "confidence": 4.0,
      "ease": 4.0,
      "priority_score": 7.33,
      "action": "[demo] Fix the issues behind Image Alt Text until the pass condition holds.",
      "explanation": "[demo] pct_content_images_missing_alt = 0.5; rule: pct_content_images_missing_alt > 0.20.",
      "human_override": false
    },
    {
      "topic": "Pagination",
      "category": "crawling_indexing",
      "impact": 5.0,
      "confidence": 2.0,
      "ease": 3.0,
      "priority_score": 6.67,
      "action": "[demo] Measure this topic: its metrics are missing.",
      "explanation": "[demo] No metrics for this topic in the latest data.",
      "human_override": false
    }
  ],
  "maturity": {
    "level": "Basic",
    "basic_complete": false,
    "tiers": {
      "Basic": {
        "pass": 8,
        "warn": 2,
        "fail": 3,
        "score": 0.692,
        "reached": false
      },
      "Advanced": {
        "pass": 15,
        "warn": 1,
        "fail": 2,
        "score": 0.861,
        "reached": false
      },
      "Expert": {
        "pass": 2,
        "warn": 2,
        "fail": 1,
        "score": 0.6,
        "reached": false
      },
      "Champion": {
        "pass": 3,
        "warn": 1,
        "fail": 0,
        "score": 0.875,
        "reached": false
      }
    },
    "threshold": 0.8,
    "warn_weight": 0.5
  }
};
