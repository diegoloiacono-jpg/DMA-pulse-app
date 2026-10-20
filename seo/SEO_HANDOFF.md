# SEO in DMA Pulse — handoff

From: Wouter Visser (SEO, Artefact Benelux) · 6 October 2026, updated 20 October 2026 · for: Diego

This adds **SEO & AI for SEO** as a second platform next to Google Ads. The criteria are the 2026 SEO DMA pulse (64 criteria, 8 sections, same house format as the Paid Search pulse). Everything here except this handoff is generated from that sheet. To change a criterion, I change the sheet and regenerate. Please don't edit the generated files by hand.

**Checked against master `055c951` (15 October).** That covers your `criteria_ice.py` with `get_ice()`, `ice_priority()`, the ICE overrides and `SpecialistResult.not_applicable`. The module now uses all four, so SEO needs fewer app changes than in the first version of this handoff.

## Status on branch `SEO-feature` (20 October 2026)

Wouter builds the SEO integration on this branch himself, without touching master. Google Ads keeps working exactly as before. Built and tested so far:
- **Backend.** `POST /api/audit/run` with `platform: "seo"` and `seo: {domain, market, as_of, max_age_days, search_console}` runs `services/seo_pipeline.py`. It reads three BigQuery views (`seo/bigquery/03_app_views.sql`), makes one Gemini call per category with the SEO prompt, and then calls `seo_finalise_results()`. Scoring routes `platform_id == "seo"` to `seo_scoring()`. The changes to `specialist.py`, `scoring.py`, the models and `config.py` are optional parameters and fields only.
- **Frontend.** A separate SEO tab (`/seo`, `pages/SeoAudit.tsx`) with its own brand context fields, audit runner, the shared review screens (with per-topic N/A and the fixed tier) and a results page with the maturity staircase. The overview gets a fourth group, "Organic", that shows the last SEO audit and links to the tab. Labels and tiers come from the generated `frontend/src/data/seoPulse.ts`. A **Demo** button on the SEO tab loads a sample audit (`frontend/src/data/seoDemo.ts`, fake data) that runs entirely in the browser, so the tab can be shown without a backend (e.g. in Lovable). The runner first calls `GET /api/audit/seo/support` and stays disabled on a backend without it: an older backend ignores `platform` and would start a Google Ads audit instead.
- **Tests.** End to end through the FastAPI app with fake BigQuery and Gemini, including the Google Ads path unchanged; type check, lint and production build of the frontend.

Still open: the Screaming Frog → BigQuery load job and the SQL that turns the SF exports into metrics (into `metric_values`); Search Console and Ahrefs (authority only) into `metric_values`; a first run against real BigQuery and Gemini; a test environment for the branch (it is not deployed to dev). The numbered steps below are what this branch implements.

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
| `_CATEGORY_TOPICS` | `SEO_CATEGORY_TOPICS` (8 categories, 64 topics) |
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
5. **Report-only topics.** `SEO_REPORT_ONLY` (WebMCP Readiness, Agentic Checkout Readiness) is evaluated and shown, but stays out of the category score and the quick wins while those standards mature.
6. **Scoring for SEO.** Call `seo_scoring(results, brand_model)` instead of `_compute_python` and wrap it as `ScoringOutput(**result)`. It returns the `ScoringOutput` fields (checked against your model) plus `maturity` with the staircase detail. Pydantic ignores that extra key unless you add it to the model, which the UI needs for "Basic (not yet complete)". The rules:
   - **Category score.** The impact-weighted average of pass = 1, warn = 0.5 and fail = 0.
   - **Excluded from scores.** `not_applicable` topics, report-only topics, and topics without data (`source` = no_data_source, parse_error or missing).
   - **Maturity label.** Every topic has a fixed tier (Basic, Advanced, Expert, Champion). A tier is reached when at least 80% of its topics pass (a warn counts half), and every lower tier is reached as well. The label is the highest tier reached. When Basic itself isn't reached, the label is still "Basic" with `basic_complete = False`, so the UI can show "Basic (not yet complete)". The threshold and warn weight come from the Maturity sheet.
   - **Quick wins.** The same as your `_compute_python`: warn and fail topics, priority = `ice_priority(impact, confidence, ease)`, and confidence capped at 2 when the topic had no data. N/A and report-only topics are left out.
7. **Brand context.** SEO needs the extra fields listed in `SEO_METRICS.md` (siteUrl, brandTerms, competitors, pageTypes, keyword mapping, hasOnlineSales, lowSearchVolume, locations, review platforms, expected profiles, AI bot policy, snippet exceptions, AI shopping platforms). These could be a nested `seo` object on `BrandContext`.
8. **Data access instead of a measurement section.** Search Console and GA4 access are checked with `seo_preconditions(metrics)`, but neither is required and neither is scored. The first pulse usually runs without the client's Search Console. In that case, set `search_console = False` in `crawl_summary` and use `seo_data_gaps(search_console=False)` instead of `SEO_DATA_GAPS`. Then:
   - 9 topics run on their fallback (`SEO_GSC_FALLBACK`), mostly the key pages from the XML sitemaps (ranked by Screaming Frog Unique Inlinks) instead of the pages with the most clicks. The extractor fills the same metric names from that source.
   - Index Coverage and Index Bloat (`SEO_GSC_ONLY`) are reported as no data, and stay out of the score until access is granted.
9. **Anonymizer.** SEO data contains client names in URLs, domains and Search Console queries. If dev should read anonymized data, the same term replacement needs to cover the SEO dataset.

## Data: what the extractor needs to produce

Per category, the extractor builds three inputs and passes them to `seo_category_frame()`:

- **`crawl_summary`**: crawl_date, crawl_age_days, user_agent, js_rendering, internal_html, indexable_html, search_console (true/false).
- **`metrics_by_topic`**: `{topic: {metric: value}}`, exactly the metrics in `SEO_TOPIC_METRICS` / `SEO_METRICS.md`. Percentages are fractions, flags are 1/0. For the sources outside Screaming Frog, the SEO team runs one n8n workflow in Artefact's n8n (`artefact-nl.app.n8n.cloud`); it is not part of this repo. It has one branch per check: the agentic PageSpeed audits, Wikidata/Wikipedia, the LLM scores (OpenAI) and the verified-agent test. Ahrefs is next. A consultant starts a run from a web form on `https://artefact-nl.app.n8n.cloud/webhook/seo-pulse`. The workflow writes raw tables to the BigQuery dataset `seo_raw` (definitions in `seo/bigquery/`), and the view `seo_raw.v_topic_metrics_n8n` already returns `audit_id, topic, metric, value` with the same metric names. Merge those rows into this dict. To find the run: the `audit_id` (for example `client-nl-202610091415`) is shown on the form and in the summary email. The raw tables also hold `client`, `market` and `domain`, so you can take the latest `audit_id` for a domain. For now the app does not trigger the workflow itself. If you want that later, it is one extra webhook node (with a header key) in front of the existing validation step.
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

Screaming Frog runs as a scheduled headless crawl with fixed exports to Cloud Storage, followed by a load job. That's our chosen production route.

**Rollout phases** (topics outside phase 1 start in `SEO_DATA_GAPS`):

| Phase | Sources | Topics |
|---|---|---|
| 1 | Screaming Frog crawl (+ list mode, JS rendering, custom extraction, accessibility), Search Console bulk export & API, PageSpeed Insights / CrUX, Ahrefs API (authority: backlinks and Domain Rating) | 47 |
| 2 | GA4 export & Admin API, Merchant Center transfer, SEO intake form | 5 |
| 3 | Fixed-prompt LLM steps, Brand Radar, Business Profile, Bing Webmaster, review platforms, Wikidata, verified-agent tests | 12 |

## Agreed

- **No measurement and tooling section** (Wouter, 6 October 2026). The pulse measures the site, not the tooling. AI referral tracking moves to the Web Analytics DMA. Rank tracking, crawl monitoring and AI visibility monitoring are dropped, because they check the agency's tooling. Search Console and GA4 access become preconditions. Bing Webmaster Tools & IndexNow moves to Crawling & Indexing. This also removes the proposed Visibility Tracking thresholds.
- **Maturity tiers.** Agreed by Wouter on 6 October 2026, with a threshold of 80% per tier and a warn weight of 0.5. With Rendering Strategy (added 9 October, Advanced) the totals are 20 Basic, 25 Advanced, 11 Expert, 8 Champion (after the keyword topics left the pulse on 20 October).
- **First pulse without Search Console** (Wouter, 9 October 2026). Search Console access is recommended, not required. The topics that use it have a fallback from the sitemap and the crawl (since 20 October; before that Ahrefs).
- **Keyword research is a separate, later track** (Wouter, 20 October 2026). Keyword Mapping Coverage and Keyword Cannibalisation left the pulse. FAQ & Question Coverage stays, with the main questions chosen by the LLM step from the page itself plus the brand questions from the intake. Without Search Console, "top N pages" are the key pages from the XML sitemaps ranked by Screaming Frog Unique Inlinks, so the pulse needs Ahrefs only for authority (backlinks and Domain Rating). The SF issue Content: Semantically Similar now counts for Duplicate & Thin Content.
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
3. **"Low-volume B2B"** is now a brand context flag (`lowSearchVolume`) set by the consultant, not a computed threshold.

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
