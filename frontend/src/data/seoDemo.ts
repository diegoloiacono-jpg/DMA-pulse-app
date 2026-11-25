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
    "hasOnlineSales": true,
    "trainingBots": "allow",
    "snippetExceptions": []
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Parameters & Faceted Navigation",
    "category": "crawling_indexing",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_indexable_parameter_urls = 0.0, n_indexable_internal_search = 0.0, n_internal_links_with_tracking = 0.0; rule: pct_parameter_urls < 0.20.",
    "human_override": false,
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": true,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Core Web Vitals",
    "category": "performance_mobile",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_cwv_failed_mobile = 0.0, has_crux_origin = 1.0, is_cwv_from_lab = 0.0; rule: n_cwv_failed_mobile == 0.",
    "human_override": false,
    "not_applicable": false,
    "details": {
      "n_cwv_failed_mobile": 0.0,
      "has_crux_origin": 1.0,
      "is_cwv_from_lab": 0.0,
      "lcp_ms": 2100.0,
      "tbt_lab_ms": 120.0,
      "inp_ms": 140.0,
      "cls": 0.04,
      "performance_score": 64.0,
      "n_psi_pages": 180.0,
      "psi_render_blocking_ms": 1250.0,
      "psi_unused_js_ms": 820.0,
      "psi_js_execution_ms": 960.0,
      "psi_main_thread_ms": 1600.0,
      "psi_unused_css_ms": 140.0,
      "psi_image_delivery_kb": 340.0,
      "psi_cache_kb": 120.0,
      "psi_page_weight_kb": 2350.0,
      "psi_dom_size": 1400.0
    }
  },
  {
    "topic": "Mobile Parity",
    "category": "performance_mobile",
    "status": "pass",
    "level": "basic",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_pages_mobile_desktop_diff = 0.0, pct_pages_less_on_mobile = 0.03, n_pages_viewport_missing = 0.0; rule: pct_pages_mobile_desktop_diff <= 0.02 and n_pages_viewport_missing == 0.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Image Weight & Format",
    "category": "performance_mobile",
    "status": "warn",
    "level": "advanced",
    "source": "no_data_source",
    "action": "[demo] Measure this topic: its metrics are missing.",
    "explanation": "[demo] No metrics for this topic in the latest data.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Page Titles",
    "category": "onpage_content",
    "status": "pass",
    "level": "basic",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_indexable_missing_title = 0.0, pct_indexable_duplicate_title = 0.005, pct_indexable_title_over_561px = 0.005; rule: pct_indexable_duplicate_title <= 0.05 and pct_indexable_title_over_561px <= 0.20.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Meta Descriptions",
    "category": "onpage_content",
    "status": "warn",
    "level": "basic",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Meta Descriptions until the pass condition holds.",
    "explanation": "[demo] pct_impressions_missing_or_duplicate_meta = 0.12; rule: pass condition not met: pct_impressions_missing_or_duplicate_meta <= 0.10.",
    "human_override": false,
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Image Alt Text",
    "category": "onpage_content",
    "status": "pass",
    "level": "basic",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_content_images_missing_alt = 0.0; rule: pct_content_images_missing_alt <= 0.05.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Duplicate & Thin Content",
    "category": "onpage_content",
    "status": "warn",
    "level": "advanced",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Duplicate & Thin Content until the pass condition holds.",
    "explanation": "[demo] pct_indexable_duplicate_or_thin = 0.0, n_same_language_markets_unlinked = 1.0; rule: pass condition not met: n_same_language_markets_unlinked == 0.",
    "human_override": false,
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Content Hygiene",
    "category": "onpage_content",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_placeholder_pages = 0.0; rule: n_placeholder_pages == 0.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Structured Data",
    "category": "onpage_content",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_page_types_with_sd_errors = 0.0, pct_pages_expected_type = 0.97; rule: pct_pages_expected_type >= 0.90.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Content Freshness",
    "category": "onpage_content",
    "status": "fail",
    "level": "expert",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Content Freshness until the pass condition holds.",
    "explanation": "[demo] pct_key_pages_updated_12m = 0.5, pct_key_pages_fresh_and_dated = 1.0, n_date_refresh_without_change = 100.0; rule: n_date_refresh_without_change > 0.",
    "human_override": false,
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Source Citations",
    "category": "onpage_content",
    "status": "fail",
    "level": "expert",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Source Citations until the pass condition holds.",
    "explanation": "[demo] pct_info_pages_citing_dr50 = 0.005, pct_external_links_broken = 1.0; rule: pct_info_pages_citing_dr50 < 0.20.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Structured Formatting",
    "category": "onpage_content",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_content_pages_list_or_table = 1.0; rule: pct_content_pages_list_or_table >= 0.60.",
    "human_override": false,
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Author & E-E-A-T Signals",
    "category": "onpage_content",
    "status": "pass",
    "level": "expert",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_editorial_with_author = 0.5, pct_editorial_full_author = 0.97; rule: pct_editorial_full_author >= 0.80.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Accessibility",
    "category": "onpage_content",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] pct_pages_accessibility_good = 1.0, n_templates_high_violations = 0.0; rule: pct_pages_accessibility_good >= 0.90 and n_templates_high_violations == 0.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Referring Domain Strength",
    "category": "authority_entity",
    "status": "pass",
    "level": "champion",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] refdomains_vs_median_competitor = 3.0, refdomains_growth_12m = 100.0, domain_rating = 3.0; rule: refdomains_vs_median_competitor >= 1 and refdomains_growth_12m > 0.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Fresh Authoritative Links",
    "category": "authority_entity",
    "status": "warn",
    "level": "expert",
    "source": "no_data_source",
    "action": "[demo] Measure this topic: its metrics are missing.",
    "explanation": "[demo] No metrics for this topic in the latest data.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Link-Earning Pages",
    "category": "authority_entity",
    "status": "warn",
    "level": "champion",
    "source": "no_data_source",
    "action": "[demo] Measure this topic: its metrics are missing.",
    "explanation": "[demo] No metrics for this topic in the latest data.",
    "human_override": false,
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Broken Backlinks",
    "category": "authority_entity",
    "status": "pass",
    "level": "advanced",
    "source": "topic_results",
    "action": "None",
    "explanation": "[demo] n_refdomains_dr20_to_4xx = 3.0; rule: n_refdomains_dr20_to_4xx <= 5.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Organization Schema & sameAs",
    "category": "authority_entity",
    "status": "warn",
    "level": "advanced",
    "source": "no_data_source",
    "action": "[demo] Measure this topic: its metrics are missing.",
    "explanation": "[demo] No metrics for this topic in the latest data.",
    "human_override": false,
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Authority Pages",
    "category": "authority_entity",
    "status": "fail",
    "level": "basic",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Authority Pages until the pass condition holds.",
    "explanation": "[demo] has_about_page = 0.0, has_contact_page = 0.0, is_about_contact_linked = 1.0; rule: has_about_page == 0.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Wikipedia & Wikidata",
    "category": "authority_entity",
    "status": "warn",
    "level": "champion",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Wikipedia & Wikidata until the pass condition holds.",
    "explanation": "[demo] is_notable = 1.0, has_wikidata_item = 0.0, n_wikipedia_links = 3.0; rule: pass condition not met: has_wikidata_item == 1.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "AI Crawler Access",
    "category": "ai_search_readiness",
    "status": "warn",
    "level": "basic",
    "source": "no_data_source",
    "action": "[demo] Measure this topic: its metrics are missing.",
    "explanation": "[demo] No metrics for this topic in the latest data.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Snippet Directives",
    "category": "ai_search_readiness",
    "status": "warn",
    "level": "basic",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind Snippet Directives until the pass condition holds.",
    "explanation": "[demo] n_top_urls_nosnippet_undocumented = 0.0, n_top_urls_partial_snippet_undocumented = 100.0; rule: pass condition not met: n_top_urls_partial_snippet_undocumented == 0.",
    "human_override": false,
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "llms.txt & ai-catalog.json Hygiene",
    "category": "ai_search_readiness",
    "status": "fail",
    "level": "advanced",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind llms.txt & ai-catalog.json Hygiene until the pass condition holds.",
    "explanation": "[demo] llms_txt_status = 200.0, ai_catalog_status = 404.0, is_llms_txt_valid = 0.0; rule: llms_txt_status == 200 and is_llms_txt_valid == 0.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "WebMCP Readiness",
    "category": "ai_search_readiness",
    "status": "warn",
    "level": "champion",
    "source": "topic_results",
    "action": "[demo] Fix the issues behind WebMCP Readiness until the pass condition holds.",
    "explanation": "[demo] n_key_task_forms = 1.0, n_key_forms_webmcp = 100.0, n_webmcp_schema_failures = 0.0; rule: pass condition not met: n_key_forms_webmcp == n_key_task_forms.",
    "human_override": false,
    "not_applicable": false,
    "details": null
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
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Verified Agent Access",
    "category": "agentic_commerce",
    "status": "warn",
    "level": "expert",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false,
    "details": null
  },
  {
    "topic": "Agent Catalog Access (UCP)",
    "category": "agentic_commerce",
    "status": "warn",
    "level": "champion",
    "source": "no_data_source",
    "action": "Verify manually — this data is not in BigQuery yet",
    "explanation": "[demo] No data source for this topic yet.",
    "human_override": false,
    "not_applicable": false,
    "details": null
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
      "score": 77.7,
      "pass_rate": 64.3,
      "weight": 1.0
    },
    {
      "name": "authority_entity",
      "score": 75.0,
      "pass_rate": 50.0,
      "weight": 1.0
    },
    {
      "name": "ai_search_readiness",
      "score": 62.5,
      "pass_rate": 33.3,
      "weight": 1.0
    }
  ],
  "platform_score": 76.5,
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
      "topic": "Duplicate & Thin Content",
      "category": "onpage_content",
      "impact": 5.0,
      "confidence": 4.0,
      "ease": 3.0,
      "priority_score": 8.0,
      "action": "[demo] Fix the issues behind Duplicate & Thin Content until the pass condition holds.",
      "explanation": "[demo] pct_indexable_duplicate_or_thin = 0.0, n_same_language_markets_unlinked = 1.0; rule: pass condition not met: n_same_language_markets_unlinked == 0.",
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
      "topic": "Meta Descriptions",
      "category": "onpage_content",
      "impact": 4.0,
      "confidence": 3.0,
      "ease": 4.0,
      "priority_score": 7.33,
      "action": "[demo] Fix the issues behind Meta Descriptions until the pass condition holds.",
      "explanation": "[demo] pct_impressions_missing_or_duplicate_meta = 0.12; rule: pass condition not met: pct_impressions_missing_or_duplicate_meta <= 0.10.",
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
    },
    {
      "topic": "AI Crawler Access",
      "category": "ai_search_readiness",
      "impact": 5.0,
      "confidence": 2.0,
      "ease": 3.0,
      "priority_score": 6.67,
      "action": "[demo] Measure this topic: its metrics are missing.",
      "explanation": "[demo] No metrics for this topic in the latest data.",
      "human_override": false
    },
    {
      "topic": "Content Freshness",
      "category": "onpage_content",
      "impact": 3.0,
      "confidence": 3.0,
      "ease": 4.0,
      "priority_score": 6.67,
      "action": "[demo] Fix the issues behind Content Freshness until the pass condition holds.",
      "explanation": "[demo] pct_key_pages_updated_12m = 0.5, pct_key_pages_fresh_and_dated = 1.0, n_date_refresh_without_change = 100.0; rule: n_date_refresh_without_change > 0.",
      "human_override": false
    }
  ],
  "maturity": {
    "level": "Basic",
    "basic_complete": false,
    "tiers": {
      "Basic": {
        "pass": 9,
        "warn": 3,
        "fail": 3,
        "score": 0.7,
        "reached": false
      },
      "Advanced": {
        "pass": 13,
        "warn": 2,
        "fail": 2,
        "score": 0.824,
        "reached": false
      },
      "Expert": {
        "pass": 1,
        "warn": 1,
        "fail": 2,
        "score": 0.375,
        "reached": false
      },
      "Champion": {
        "pass": 2,
        "warn": 1,
        "fail": 0,
        "score": 0.833,
        "reached": false
      }
    },
    "threshold": 0.8,
    "warn_weight": 0.5
  }
};
