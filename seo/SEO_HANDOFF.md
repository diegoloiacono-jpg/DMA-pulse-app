# SEO in DMA Pulse — handoff

From: Wouter Visser (SEO, Artefact Benelux) · 6 October 2026, updated 20 October 2026 · for: Diego

This adds **SEO & AI for SEO** as a second platform next to Google Ads. The criteria are the 2026 SEO DMA pulse (59 criteria, 7 sections, same house format as the Paid Search pulse). Everything here except this handoff is generated from that sheet. To change a criterion, I change the sheet and regenerate. Please don't edit the generated files by hand.

**Checked against master `055c951` (15 October).** That covers your `criteria_ice.py` with `get_ice()`, `ice_priority()`, the ICE overrides and `SpecialistResult.not_applicable`. The module now uses all four, so SEO needs fewer app changes than in the first version of this handoff.

## Status on branch `SEO-feature` (20 October 2026)

Wouter builds the SEO integration on this branch himself, without touching master. Google Ads keeps working exactly as before. Built and tested so far:
- **Backend.** `POST /api/audit/run` with `platform: "seo"` and `seo: {domain, market, as_of, max_age_days, search_console}` runs `services/seo_pipeline.py`. It reads three BigQuery views (`seo/bigquery/03_app_views.sql`), makes one Gemini call per category with the SEO prompt, and then calls `seo_finalise_results()`. Scoring routes `platform_id == "seo"` to `seo_scoring()`. The changes to `specialist.py`, `scoring.py`, the models and `config.py` are optional parameters and fields only.
- **Frontend.** A separate SEO tab (`/seo`, `pages/SeoAudit.tsx`) with the site (`GET /api/audit/seo/sites`: the sites in BigQuery), the SEO pulse the audit runs on, the shared review screens (with per-topic N/A and the fixed tier) and a results page with the maturity staircase. The overview gets a fourth group, "Organic", that shows the last SEO audit and links to the tab. Labels and tiers come from the generated `frontend/src/data/seoPulse.ts`. A **Demo** button on the SEO tab loads a sample audit (`frontend/src/data/seoDemo.ts`, fake data) that runs entirely in the browser, so the tab can be shown without a backend (e.g. in Lovable). The runner first calls `GET /api/audit/seo/support` and stays disabled on a backend without it: an older backend ignores `platform` and would start a Google Ads audit instead.
- **Tests.** End to end through the FastAPI app with fake BigQuery and Gemini, including the Google Ads path unchanged; type check, lint and production build of the frontend.

Still open: Search Console and Ahrefs (authority only) into `metric_values`; the 25 Screaming Frog metrics that need exports the form does not upload yet (All Outlinks, All Redirects, sitemaps, custom extraction); a test environment for the branch (it is not deployed to dev). Done on 3 November 2026: dataset `seo_raw` (EU) in paid-media-2a86 with the n8n writes, the Screaming Frog metrics view and a first local run of this branch against the real BigQuery and Gemini (a large multi-market client site). The numbered steps below are what this branch implements.

## What's in this branch

| File | What it is | Use |
|---|---|---|
| `backend/app/services/seo_criteria.py` | Drop-in module: topics, ICE, weights, data gaps, metric contract, threshold rules + evaluator, frame builder, prompts, scoring | imported by specialist / scoring |
| `seo/sf_issue_map.csv` | 325 Screaming Frog issues → topic → category | BigQuery seed table `sf_issue_map` |
| `seo/SEO_METRICS.md` | Data contract: every metric per topic, its source, definition and rule | reference for the extractor |
| `seo/bigquery/01_tables.sql`, `02_metric_views.sql` | Dataset `seo_raw`: the raw tables the n8n workflow writes, and the view `v_topic_metrics_n8n` | run once in the GCP project (replace `YOUR_GCP_PROJECT`) |
| `seo/SEO_HANDOFF.md` | This file | |

## How it maps onto your pipeline

| Google Ads (yours) | SEO (this module) |
|---|---|
| `_CATEGORY_TOPICS` | `SEO_CATEGORY_TOPICS` (7 categories, 59 topics) |
| `CRITERIA_ICE` / `get_ice()` in `criteria_ice.py` | `SEO_CRITERIA_ICE`: same `category::topic` keys, same (impact, confidence, ease) tuples. The values per dimension are also in `SEO_TOPIC_IMPACT`, `SEO_TOPIC_CONFIDENCE` and `SEO_TOPIC_EASE` |
| `_BASE_WEIGHTS`, multipliers | `SEO_BASE_WEIGHTS`, `SEO_B2B_MULTIPLIERS`, `SEO_B2C_D2C_MULTIPLIERS` |
| `DATA_GAPS` | `SEO_DATA_GAPS` (all topics outside phase 1) |
| per-topic criteria in `_SYSTEM_PROMPT` | `SEO_CATEGORY_CRITERIA[category]`, built with `seo_system_prompt(category)` |
| `qs_status_computed` pre-computed in Python | **every** topic: `evaluate_topic(topic, metrics)` → `status_computed` |
| `_source`-tagged frames per category | `seo_category_frame(category, metrics_by_topic, issue_detail, crawl_summary)` |
| `level` judged per topic by Gemini | `level` = the topic's fixed maturity tier (`SEO_TOPIC_TIER`), set by `seo_finalise_results()` |
| `_not_applicable_stubs()` for a whole category (feeds for B2B) | per topic: `seo_finalise_results()` sets `not_applicable = True` where `status_computed` is `"na"` |
| `_compute_python` (pass rate = level ≥ advanced, label from the platform score) | `seo_scoring(results, brand_model)`: same output fields and the same quick-win formula, maturity label from the staircase in `seo_maturity()` |

The main design choice follows what you learned on Quality Score: **Python decides the status, Gemini explains it**. Each topic has named metrics, such as `pct_indexable_canonical_issue`. The pulse thresholds are written as conditions on those metrics, for example `fail if pct_indexable_canonical_issue > 0.05`. `evaluate_topic()` returns pass/warn/fail, or `"na"` when the topic does not apply. When a metric is missing it returns `None`, and then Gemini falls back to the written criteria. The prompt tells Gemini never to override `status_computed`, and `seo_finalise_results()` enforces it after the call.

## Changes needed in the app

1. **Platform switch.** Add `platform: Literal["sea-google", "seo"] = "sea-google"` to `AuditRunRequest`. SEO audits are scoped by `client`, `market` and `crawl_date` instead of `account_id`. `_run_pipeline` then calls an SEO extractor and passes the platform on to the specialist and the scorer.
2. **Specialist.** `_call_gemini` currently reads module-level `_SYSTEM_PROMPT` and `DATA_GAPS`. For SEO, pass in three things:
   - `seo_system_prompt(category)` as the system prompt (1.6k–5.6k tokens per category, versus about 10.7k for the full Google Ads prompt),
   - `SEO_DATA_GAPS`,
   - `SEO_CATEGORY_TOPICS[category]` as the topics.

   Also call `_summarise_df(df, max_rows=200)`. With the default 50, the 19 On-page & Content topics are cut to 16. I tested this against your function.
3. **Not applicable per topic, via your `not_applicable` field.** Examples are hreflang on a single-market site, or Merchant Center for a site without online sales. No new status value is needed:
   - `_build_response_schema`: add an optional `"not_applicable": BOOLEAN` property (not in `required`). `SpecialistResult(**item)` already accepts it.
   - After `_call_gemini` for an SEO category, call `seo_finalise_results(results, frame)` with the frame from `seo_category_frame()`. It sets the fixed level, enforces `status_computed`, and marks `"na"` topics `not_applicable = True` with status `"pass"`, like your B2B stubs. Your scoring already drops those.
   - UI: N/A is now shown only when a whole category is not applicable. For SEO a single topic can be N/A, so `SpecialistReview` could show "N/A" for a topic with `not_applicable`.
4. **ICE.** Add `CRITERIA_ICE.update(SEO_CRITERIA_ICE)` to `criteria_ice.py`. The SEO category keys don't overlap with Google Ads; I tested this. `get_ice()` and the ICE overrides in `validation.py` then work for SEO unchanged.
5. **Report-only topics.** `SEO_REPORT_ONLY` (WebMCP Readiness) is evaluated and shown, but stays out of the category score and the quick wins while those standards mature.
6. **Scoring for SEO.** Call `seo_scoring(results, brand_model)` instead of `_compute_python` and wrap it as `ScoringOutput(**result)`. It returns the `ScoringOutput` fields (checked against your model) plus `maturity` with the staircase detail. Pydantic ignores that extra key unless you add it to the model, which the UI needs for "Basic (not yet complete)". The rules:
   - **Category score.** The impact-weighted average of pass = 1, warn = 0.5 and fail = 0.
   - **Excluded from scores.** `not_applicable` topics, report-only topics, and topics without data (`source` = no_data_source, parse_error or missing).
   - **Maturity label.** Every topic has a fixed tier (Basic, Advanced, Expert, Champion). A tier is reached when at least 80% of its topics pass (a warn counts half), and every lower tier is reached as well. The label is the highest tier reached. When Basic itself isn't reached, the label is still "Basic" with `basic_complete = False`, so the UI can show "Basic (not yet complete)". The threshold and warn weight come from the Maturity sheet.
   - **Quick wins.** The same as your `_compute_python`: warn and fail topics, priority = `ice_priority(impact, confidence, ease)`, and confidence capped at 2 when the topic had no data. N/A and report-only topics are left out.
7. **Brand context.** SEO has no brand context form: `apply_pulse_context()` builds it from the SEO pulse the audit runs on (table `pulse_runs`, written by the n8n form): client name, business model, brand terms, competitors and the intake (hasOnlineSales, isNotable, trainingBots, snippetExceptions), as a nested `seo` object on `BrandContext` (fields in `SEO_METRICS.md`). Unknown stays None, never false.
8. **Data access instead of a measurement section.** Search Console and GA4 access are checked with `seo_preconditions(metrics)`, but neither is required and neither is scored. The first pulse usually runs without the client's Search Console. In that case, set `search_console = False` in `crawl_summary` and use `seo_data_gaps(search_console=False)` instead of `SEO_DATA_GAPS`. Then:
   - 9 topics run on their fallback (`SEO_GSC_FALLBACK`), mostly the key pages from the XML sitemaps (ranked by Screaming Frog Unique Inlinks) instead of the pages with the most clicks. The extractor fills the same metric names from that source.
   - Index Coverage and Index Bloat (`SEO_GSC_ONLY`) are reported as no data, and stay out of the score until access is granted.
9. **Anonymizer.** SEO data contains client names in URLs, domains and Search Console queries. If dev should read anonymized data, the same term replacement needs to cover the SEO dataset.

## Data: what the extractor needs to produce

Per category, the extractor builds three inputs and passes them to `seo_category_frame()`:

- **`crawl_summary`**: crawl_date, crawl_age_days, user_agent, js_rendering, internal_html, indexable_html, search_console (true/false).
- **`metrics_by_topic`**: `{topic: {metric: value}}`, exactly the metrics in `SEO_TOPIC_METRICS` / `SEO_METRICS.md`. Percentages are fractions, flags are 1/0. For the sources outside Screaming Frog, the SEO team runs one n8n workflow in Artefact's n8n (`artefact-nl.app.n8n.cloud`); it is not part of this repo. It has one branch per check: the agentic PageSpeed audits, Wikidata/Wikipedia, the LLM scores (OpenAI), the verified-agent test, the UCP agent test and Ahrefs authority (backlinks and Domain Rating for the six authority topics). A consultant starts a run from a web form on `https://artefact-nl.app.n8n.cloud/webhook/seo-pulse`. The workflow writes raw tables to the BigQuery dataset `seo_raw` (definitions in `seo/bigquery/`), and the view `seo_raw.v_topic_metrics_n8n` already returns `audit_id, topic, metric, value` with the same metric names. Merge those rows into this dict. To find the run: the `audit_id` (for example `client-nl-202610091415`) is shown on the form and in the summary email. The raw tables also hold `client`, `market` and `domain`, so you can take the latest `audit_id` for a domain. One run can cover several markets: `market` is then a list such as `NL,BE` (first = primary market), and `seo_pipeline._MARKET_FILTER` counts such a row for each market in it. For now the app does not trigger the workflow itself. If you want that later, it is one extra webhook node (with a header key) in front of the existing validation step.
- **`issue_detail`**: Screaming Frog issues per topic (sf_category, issue_name, issue_type, issue_priority, urls, indexable_urls). This comes from `sf_issues_overview` joined with `sf_issue_map`. Join on sf_category + issue_name, because names like "Missing" repeat across categories.

Proposed raw tables in BigQuery, each with `crawl_date`, `client` and `market` columns:
- `sf_internal_all`
- `sf_issues_overview`
- `sf_issue_urls` (bulk export Issues > All)
- `sf_all_outlinks`
- `sf_redirects`
- `sf_sitemaps`
- `sf_hreflang`
- `sf_structured_data`
- `sf_list_checks`
- the native Search Console bulk export (`searchdata_url_impression`)
- PSI/CrUX results

For now the consultant uploads the Screaming Frog crawl through the n8n form (see the decision of 29 October below). A scheduled headless crawl with fixed exports can later write the same tables.

**Rollout phases** (topics outside phase 1 start in `SEO_DATA_GAPS`):

| Phase | Sources | Topics |
|---|---|---|
| 1 | Screaming Frog crawl (+ list mode, JS rendering, custom extraction, accessibility), Search Console bulk export & API, PageSpeed Insights / CrUX, Ahrefs API (authority: backlinks and Domain Rating) | 47 |
| 2 | GA4 export & Admin API, Merchant Center transfer, SEO intake form | 5 |
| 3 | Fixed-prompt LLM steps, Brand Radar, Business Profile, Bing Webmaster, review platforms, Wikidata, verified-agent tests, UCP agent test | 13 |

## Agreed

- **No measurement and tooling section** (Wouter, 6 October 2026). The pulse measures the site, not the tooling. AI referral tracking moves to the Web Analytics DMA. Rank tracking, crawl monitoring and AI visibility monitoring are dropped, because they check the agency's tooling. Search Console and GA4 access become preconditions. Bing Webmaster Tools & IndexNow moves to Crawling & Indexing. This also removes the proposed Visibility Tracking thresholds.
- **Maturity tiers.** Agreed by Wouter on 6 October 2026, with a threshold of 80% per tier and a warn weight of 0.5. With Rendering Strategy (added 9 October, Advanced) the totals are 18 Basic, 25 Advanced, 9 Expert, 7 Champion (after the keyword topics left and Agent Catalog Access (UCP) joined on 20 October, and six topics left on 3 November).
- **First pulse without Search Console** (Wouter, 9 October 2026). Search Console access is recommended, not required. The topics that use it have a fallback from the sitemap and the crawl (since 20 October; before that Ahrefs).
- **Keyword research is a separate, later track** (Wouter, 20 October 2026). Keyword Mapping Coverage and Keyword Cannibalisation left the pulse. FAQ & Question Coverage stays, with the main questions chosen by the LLM step from the page itself plus the brand questions from the intake. Without Search Console, "top N pages" are the key pages from the XML sitemaps ranked by Screaming Frog Unique Inlinks, so the pulse needs Ahrefs only for authority (backlinks and Domain Rating). The SF issue Content: Semantically Similar now counts for Duplicate & Thin Content.
- **Ahrefs only for authority, intake not asked in the SEO form** (Wouter, 20 October 2026). The n8n Ahrefs branch covers Referring Domain Strength, Fresh Authoritative Links, Link-Earning Pages, Anchor Text Profile, Broken Backlinks and Source Citations (tables `ahrefs_authority`, `ahrefs_citations`). Referring Domain Strength now uses dofollow referring domains from one batch request (no organic-traffic filter, which would cost 10 units per referring domain). hasOnlineSales, lowSearchVolume and locations were not asked in the SEO form: unknown by default (never false or 0), and intake metrics only come from the brand context when set (since 3 November the intake is in the n8n form, see below). `seo_has_evidence()`: a topic with only intake metrics counts as no data.
- **FAQ & Question Coverage: answered on the page counts** (Wouter, 21 October 2026). Not every page needs a FAQ block: a landing page counts when the LLM step finds its main questions answered on the page (`answered_on_page`, new column `questions_answered_on_page`); only the FAQ or customer service page has to answer them, brand questions included, in its FAQ. The prompt checks a fixed question list (`faq_coverage_v2`): the given search questions or 3 main questions, plus the brand questions.
- **AI Crawler Access (AI-03) measured by the n8n bot test** (Wouter, 21 October 2026): robots.txt per AI bot and fetches with each bot's user agent (homepage + up to 2 key pages), table `ai_bot_tests`, source label `Bot test`; metrics n_retrieval_bots_blocked_robots and n_retrieval_bot_fetches_blocked count the search and user bots (OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User).
- **Agent Catalog Access (UCP), AI-N13** (Wouter, 20 October 2026). New scored criterion in Agentic Commerce, tier Champion. n8n checks /.well-known/ucp and searches the catalog as Artefact's read-only audit agent (profile https://woutervisser-lab.github.io/ucp-agent-profile/agent.json, catalog search and lookup only), then compares price and availability with the product page. Raw table `ucp_agent_tests`; metrics in `v_topic_metrics_n8n`. MCP-only catalogs give warn.
- **Screaming Frog metrics as a view** (Wouter, 3 November 2026). `v_sf_metrics` (in `bigquery/03_app_views.sql`, generated by `build/build_sf_metrics.py` in the SEO workspace) computes 55 of the 80 "SF crawl" metrics from the crawl tables, one row per crawl, topic and metric; `v_seo_metrics` reads it as source `sf_crawl`. A live view, not rows in `metric_values`, so a fix in the SQL also applies to earlier crawls. Unknown stays unknown: no value when the crawl cannot tell (JavaScript metrics without JavaScript rendering, sitemap and mobile metrics without those checks, columns missing from the Internal export). Checked on a real client crawl: 21 metrics recomputed from the export folder match exactly. `pct_indexable_url_issue` leaves out Uppercase and Underscores: locale folders such as /nl_NL/ put them in nearly every URL (85% on a large multi-market site, 3.6% without them); they stay listed as issues.
- **Choose the SEO pulse an audit runs on** (Wouter, 3 November 2026). After the domain, the SEO tab lists the site's SEO pulses (`GET /api/audit/seo/sources`): one per submit of the n8n form, its run with the crawl uploaded in the same form. n8n writes that pair first in every run (table `pulse_runs`); for runs from before it, the crawl uploaded in the 30 minutes before the run counts, each crawl once; a crawl without a run is a pulse of its own. Default: the latest crawl and metrics in the window, as before. A chosen pulse replaces the other runs and crawls, also when older than the maximum age (`SeoAuditParams.crawl_id` / `n8n_audit_id`, `v_seo_metrics.source_id`, view `v_seo_n8n_runs`).
- **One source for brand terms, competitors and Search Console** (Wouter, 3 November 2026). Brand terms and competitors are no longer asked in the app's SEO context: n8n stores the ones of its form with the run (`pulse_runs`), the SEO tab shows them with the chosen pulse, and `apply_pulse_context()` puts them in the brand context Gemini reads, so it judges with the terms the metrics were computed with. The Search Console checkbox is gone: `SeoAuditParams.search_console` None means the app looks itself (`has_search_console()`): Search Console metrics in BigQuery, or a crawl run with Screaming Frog connected to Search Console: Clicks and Impressions in its Internal export (the form sets `sf_crawls.search_console`), or "Search Console" issues in its folder.
- **Six topics out, brand context from the pulse** (Wouter, 3 November 2026). Out of the pulse: Topic Clusters (needs a keyword mapping or content clusters), Google Business Profile and Review Collection (local and reputation work, the whole section Reputation & Local), and Merchant Center Feed & Free Listings, AI Shopping Feed Distribution and Agentic Checkout Readiness (product feeds belong to SEA). 59 topics in 7 categories remain. Product Data Consistency no longer compares with the feed; Parameters & Faceted Navigation no longer checks facets with search demand (keyword research is a separate track). `n_market_languages` now comes from the crawl: the locale folders of the indexable pages (/nl-nl/, /en_gb/, at least 2 pages each), plus the root when 5% or more of the pages are outside them; without locale folders 1, unless the crawl found hreflang (versions on other hosts: unknown). `n_same_language_markets_unlinked` is 0 when every locale has its own language. The app's SEO brand context form is gone: the n8n form has a section "About the site" (business model, required: B2B and B2C sites expect different structured data and external profiles; sells online, notable for Wikipedia, AI training bots, intentional nosnippet pages; empty = unknown), stored in `pulse_runs` and read by `apply_pulse_context()`. Page types come from the Screaming Frog Segments; the form lists the crawl settings (JavaScript rendering, accessibility, structured data validation, Segments, Search Console, all Internal columns).
- **No spelling and grammar in the pulse** (Wouter, 25 November 2026). Content Hygiene only checks placeholder text (Content: Lorem Ipsum Placeholder): the spelling check makes the crawl slow and counts brand names and jargon as errors. The Spelling Errors and Grammar Errors issues are stored with the crawl but map to no topic.
- **Fixes after the first online audit** (Wouter, 19 November 2026). Content Without JavaScript: Screaming Frog's "Contains JavaScript Content" lists every page where JavaScript adds any word (a banner on every page made it 100%); the form now stores the export's JS Word Count % per URL (`sf_issue_urls.js_word_pct`) and `pct_js_dependent_pages` counts pages above 10% (unknown for crawls uploaded before). Numbers in a Dutch-locale export ("0,456", "1.234") are read correctly. XML Sitemap Quality: `has_sitemap` and `pct_non_indexable_in_sitemap` come from the crawl (the Sitemaps issues). AI Crawler Access: the AI bot test runs in every n8n run (check "AI bot test"), and `n_training_bot_policy_mismatches` compares robots.txt with the training-bot policy of the pulse form.
- **No low-volume flag: Fresh Authoritative Links against the competitors** (Wouter, 4 November 2026). The intake field "low search volume" is gone (it only lowered one target: 3 or 1 new strong referring domains a quarter). n8n now fetches the new referring domains with 5,000+ visits (last 90 days) for each competitor too; fail below half the median competitor (or none while the competitors get them), pass at or above the median with at least 1, warn when nobody gets any. Metric `median_competitor_new_refdomains_90d_5k` replaces the intake `target_new_refdomains`. A few thousand Ahrefs units more per audit at most (13 units per row, max. 200 rows per competitor).
- **No fail or pass without a deciding metric** (Wouter, 3 November 2026). When Python cannot compute a status, no fail condition is met and not every pass condition is, so `seo_finalise_results()` turns a fail or pass of Gemini into warn (it keeps the action and explanation, adds the unknown rule); N/A stays possible. Seen in the first real run: Gemini failed Authority Pages on an unknown metric and derived a link percentage from issue URL counts. The SEO prompt now says the same: a missing metric is never the reason for fail or pass, and metrics are never computed from `issue_detail`.
- **Screaming Frog crawl via the n8n form** (Wouter, 29 October 2026). The consultant uploads the Internal export and the Bulk Export > Issues > All folder in the SEO form; n8n (webhook `seo-pulse-crawl`) matches each issue file to `sf_issue_map` by file name and writes `sf_crawls`, `sf_issues_overview`, `sf_pages` and `sf_issue_urls` (via staging tables, see below). The run that follows carries the `crawl_id`. Files that do not match (custom filters, changed thresholds) are reported and not stored. The form sends a large crawl in parts of max. 4 MB (n8n Cloud takes max. 16 MB per request) and cuts the rest in smaller parts when a part keeps failing. No double rows (Wouter, 30 October 2026): every part goes to staging tables (`sf_*_stage`, rows expire after 3 days) before n8n answers; the last part moves the crawl into `sf_crawls`, `sf_issues_overview`, `sf_pages`, `sf_issue_urls` and `sf_issue_inlinks` with one INSERT per table, each row once by its key and only when the crawl is not there yet. A crawl is in those tables only when it arrived completely. The consultant is not asked how the crawl ran: `user_agent` is NULL, and `js_rendering` is TRUE when the folder has JavaScript issues (Screaming Frog reports those only with JavaScript rendering), else NULL; without TRUE the JavaScript issues count as not measured, not as zero. The pulse crawl is the whole site with JavaScript rendering and the accessibility audit (Wouter, 29 October 2026; not Text Only plus a JavaScript sample: without rendering neither Content Without JavaScript nor accessibility can be measured); the form warns when the folder has no JavaScript or no accessibility issues. The folder also holds the Internal export (`internal_html.csv`: `sf_pages` and the page totals, the base of 16 criteria) and the External export (`external_all.csv`: only its number of URLs, `sf_crawls.external_urls`, the base of pct_external_links_broken). The `…_inlinks.csv` files of Issues > All are the pages linking to an issue's URLs: their number is `sf_issues_overview.source_pages` (pct_pages_linking_4xx = source_pages of Internal Client Error (4XX) / internal_html), and the links themselves (source, destination, anchor, link position; every link, exact duplicates once) are in `sf_issue_inlinks`, the fix list for development.
- **JavaScript & rendering** (checklist from a colleague in the DMA Global edition, 9 October 2026). The checks are folded into the pulse:
  - Raw-HTML checks for head elements, headings, structured data and links: Content Without JavaScript.
  - Content loaded on click, JavaScript lazy-loading, dynamic rendering parity and client-side-only page types: the new Rendering Strategy (SEO-N15).
  - Price, availability and reviews in the raw HTML: Product Data Consistency.
  - "Load more" with paginated URLs: Pagination.
  - JavaScript weight per page type: Core Web Vitals.

  Thresholds agreed by Wouter on 9 October 2026:
  - Rendering Strategy: pass at 5% of pages or less and fail above 20% for click-loaded text and JavaScript lazy-loading, the same bands as Content Without JavaScript. With dynamic rendering: pass at 2% bot–user difference or less and fail above 10%, the same bands as Mobile Parity.
  - Product Data Consistency: pass at 95% or more and fail below 70% of product pages with price and availability in the raw HTML, the same bands as complete markup.

## Open decisions (Wouter + Diego)

1. **B2B / B2C multipliers** for SEO categories: none agreed yet, so the dicts are empty.
2. **"Basic (not yet complete)"** as a fifth label in the UI, or keep the four labels and show `basic_complete`.
3. ~~"Low-volume B2B" flag~~: dropped on 4 November 2026; Fresh Authoritative Links compares with the competitors instead.

## Keeping it in sync

The source lives on my side: `DMA SEO/build/diego_spec.py` (metrics + rules) and the pulse xlsx (texts, ICE, maturity tiers, staircase inputs). `python build_diego.py` regenerates the module, `seo/sf_issue_map.csv` and `seo/SEO_METRICS.md`, copies the BigQuery definitions, and validates everything:
- every criterion has a spec,
- every rule metric is defined,
- every SF issue maps to a known topic.

I tested the evaluator with scenario tests and fuzzing: every topic can reach both pass and fail. I also checked the frame against your `_summarise_df`, and the staircase and `seo_scoring()` output against your pydantic models. Against master `055c951` I tested the following:
- `get_ice()` after the merge;
- the quick-win priority against `ice_priority()` for all 125 ICE combinations;
- the low-evidence cap;
- `seo_finalise_results()` on dicts and on objects.
