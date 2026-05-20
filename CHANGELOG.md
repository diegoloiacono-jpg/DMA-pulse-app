# DMA Pulse — Changelog

All notable changes to this project are documented here.

---

## [0.7.0] — 2026-05-20

### Data extraction overhaul, Gemini optimisation, and BigQuery accuracy fixes

#### Missing dependency (`requirements.txt`)

- Added `db-dtypes>=1.2` — required by `google-cloud-bigquery` to convert DATE/DATETIME/NUMERIC columns to pandas types; its absence caused every category to fail silently with "Please install the 'db-dtypes' package"

#### Data extraction rewrite (`data_extraction.py`)

All seven category extractors were reworked to fix wrong column names, sampling bias, and a critical PMax filter bug:

- **`_max_partition()` helper** — entity tables now use `_PARTITIONTIME = (SELECT MAX(_PARTITIONTIME) FROM tbl)` so data is always found regardless of load frequency; stats tables keep the 30-day rolling window
- **PMax filter bug** — `_pmax_performance` was filtering on `campaign_advertising_channel_sub_type = 'PERFORMANCE_MAX'` (wrong column); corrected to `campaign_advertising_channel_type = 'PERFORMANCE_MAX'`. Account has 189 PMax campaigns that were previously reported as zero
- **Aggregated high-volume tables** to eliminate sampling bias on tables too large to sample randomly:
  - `p_ads_Keyword` (670k rows, 518k negatives) → grouped by `(is_negative, match_type, status, bidding_strategy_type)` with `keyword_count`, `avg_quality_score`, `disapproved_count` (~30 rows)
  - `p_ads_CampaignCriterion` (358k rows, 207k keyword negatives dominating) → grouped by `(criterion_type, negative)` with `count` (~20 rows). Geo targeting (19k LOCATION), dayparting (902 AD_SCHEDULE), and remarketing (19k USER_LIST) entries are now visible to Gemini
  - `p_ads_Ad` (33k rows) → grouped by `(type, status, ad_strength, policy_approval_status)` with `ad_count` (~25 rows)
  - `_pmax_performance` campaign query → grouped by `(status, bidding_strategy_type)` with `campaign_count` and `with_target_roas` so Gemini reads totals, not a 12-row sample
- **Dayparting signal** — `_campaign_setup` now runs a third query counting `AD_SCHEDULE` entries per `p_ads_CampaignCriterion`, returned as `adschedule_summary` source. Gemini can now distinguish "no schedule configured" from "schedule exists but not optimised"
- **PMax audience signals** — new query joins `p_ads_AssetGroupAudienceView` to get `audience_signal_count` per PMax campaign; falls back to `p_ads_CampaignAudience` filtered to PMax campaign_ids if the asset group view is unavailable
- **Removed structural audit view query** — `v_structural_audit_6600502562` does not exist in the `bwj_google_ads` dataset; the try/except was silently discarding the error on every run
- **Per-source row-count logging** added to all extractors for post-run diagnosis

#### Gemini optimisation (`specialist.py`)

- **Disabled thinking** (`thinking_config=types.ThinkingConfig(thinking_budget=0)`) — Gemini 2.5 Flash was consuming 7–8k tokens on internal reasoning before generating a single character of JSON, leaving only ~300 tokens of the 4096 budget for the actual response. With thinking off, the full output budget is available and latency drops significantly. Cost reduction: ~20× per audit (thinking tokens billed at $3.50/1M vs $0.60/1M for output)
- **Increased `max_output_tokens`** 4096 → 8192 — eliminates JSON truncation mid-response for categories with more complex output
- **Token usage logging** — after each Gemini call: `Gemini tokens [category]: prompt=X output=Y total=Z` appears in Cloud Run logs for billing monitoring. Typical per-audit cost: ~55k prompt + ~5k output tokens total across 7 categories (~$0.01/run)
- **`_summarise_df` rewrite** — when a DataFrame has multiple `_source` groups, each group is now serialised independently with its own clean columns. Previously, concatenating two differently-shaped tables (e.g. `campaign` + `hourly_stats`) produced a wide NaN-padded matrix that inflated `campaign_setup` prompt tokens from ~7k to ~51k
- **System prompt updated** for `keyword_strategy`, `audience_targeting`, `creative_content`, and `pmax_performance` to reference the new aggregated column names (`keyword_count`, `avg_quality_score`, `criterion_type + count`, `ad_count`, etc.)
- **PMax audience signals prompt** updated to treat zero rows as `warn/basic` (data unavailable, verify manually) rather than `fail/basic`

#### Audit accuracy improvements (confirmed by log analysis)

Topics that moved from incorrect fail/warn to accurate scores after the above fixes:

| Category | Topic | Before | After |
|---|---|---|---|
| pmax_performance | Campaign adoption | fail/basic (0 campaigns) | pass/champion (98 enabled = 35%) |
| pmax_performance | Smart bidding | fail/basic | pass/champion |
| pmax_performance | Campaign balance | fail/basic | pass/expert |
| campaign_setup | Scheduling & dayparting | warn/basic | warn/advanced (123 campaigns with schedule) |
| keyword_strategy | Match type distribution | fail/basic | pass/expert |
| keyword_strategy | Quality scores | warn (no data) | pass/expert |
| keyword_strategy | Ad group structure | fail/basic | pass/expert |
| audience_targeting | Geo targeting | fail/basic | pass/advanced (19k LOCATION targets) |
| audience_targeting | Similar audiences | fail/basic | pass/expert (USER_LIST entries) |
| audience_targeting | Exclusion lists | fail/basic | pass/expert (275k entries) |
| creative_content | RSA coverage | fail/basic | pass/advanced |

---

## [0.6.1] — 2026-05-20

### Brand context — industry, CRM data, and product feed flags

#### New brand context fields (`brand.py`, `specialist.py`, `brandContext.ts`, `apiClient.ts`, `Index.tsx`)

Three optional fields added to `BrandContext` on both backend and frontend:

- **`industry`** (`str`, default `""`) — industry vertical (e.g. Finance, Retail, Insurance). Passed to the Gemini specialist prompt to calibrate keyword quality score thresholds: competitive verticals such as finance, insurance, legal, and pharma have structurally lower QS and are not penalised as harshly.
- **`hasCrmData`** (`bool`, default `false`) — whether the brand has CRM data available for customer match audiences. When `false`, missing customer match signals in `pmax_performance` and `audience_targeting` are not flagged as failures.
- **`hasProductFeed`** (`bool`, default `false`) — whether the brand has a product feed. When `false`, feed completeness and dynamic remarketing gaps in `feeds_catalogue` are not penalised, and Shopping PMax campaigns are not expected in `pmax_performance`.

Frontend changes:
- `BrandContextForm` now renders an **Industry** text input and two checkboxes (**CRM data available**, **Product feed available**)
- `AuditRunner` passes all three fields in its `brandContext` payload
- `BrandContextPayload` in `apiClient.ts` extended with the same optional fields

---

## [0.6.0] — 2026-05-20

### AI pipeline — model migration, scoring simplification, and two new audit categories

#### Vertex AI SDK migration (`specialist.py`, `scoring.py`, `requirements.txt`)

- Replaced deprecated `google-cloud-aiplatform` / `vertexai.generative_models` SDK (deprecated June 2025, EOL June 2026) with `google-genai>=1.0`
- `vertexai.init()` + `GenerativeModel` pattern replaced with a lazy singleton `genai.Client(vertexai=True, ...)` in both services
- Model updated from `gemini-2.0-flash` (not accessible as an unversioned alias in this GCP project) to `gemini-2.5-flash` — confirmed available and working via the project's Vertex AI Model Garden
- Both Gemini calls now use `types.GenerateContentConfig` instead of `GenerationConfig`

#### Scoring agent simplified (`scoring.py`)

- Removed the secondary Gemini call in `run_scoring_agent` that was re-computing the same weighted-average math as the Python fallback — it consistently hit token-truncation errors and produced identical results
- `run_scoring_agent` now always uses `_compute_python`, which is deterministic, fast, and mirrors `auditCriteria.ts` exactly
- Removed unused `google-genai` client, `_SCORING_SYSTEM_PROMPT`, and `_call_gemini_scoring` — `scoring.py` no longer imports `google-genai`

#### Topic name normalisation (`specialist.py`)

- Added `_normalise_topics()` post-processing step after every Gemini call: maps model-returned topic names back to canonical names using `difflib.get_close_matches` (cutoff 0.4)
- Any canonical topic absent from the model response is filled with a `warn/basic` stub rather than being silently dropped
- Guarantees the UI always sees exactly the topics defined in `_CATEGORY_TOPICS`, regardless of how the model phrases them

#### New audit category: `keyword_strategy` (`data_extraction.py`, `specialist.py`)

New extractor queries:
- `p_ads_Keyword` — match type, quality score, negative flag, approval status, bidding strategy type per keyword
- `p_ads_CampaignCriterion` — campaign-level negative keyword counts (summarised)
- `p_ads_AdGroup` — DSA ad group detection (`type = 'SEARCH_DYNAMIC_ADS'`)

Six topics with full system-prompt evaluation criteria:
- **Keyword match type distribution** — EXACT-only = basic; mix with BROAD under smart bidding = expert/champion
- **Negative keyword coverage** — combined ad-group and campaign-level negatives; zero = fail
- **Keyword quality scores** — average QS from enabled non-negative keywords; <5 = fail, ≥9 = champion
- **Keyword status hygiene** — ratio of ENABLED vs PAUSED/REMOVED; disapproved keywords flagged
- **Ad group keyword structure** — Hagakure-style check; majority >20 keywords/group = basic
- **DSA / dynamic ad groups** — presence and segmentation of dynamic search ad groups

#### New audit category: `pmax_performance` (`data_extraction.py`, `specialist.py`)

New extractor queries:
- `p_ads_Campaign` filtered to `PERFORMANCE_MAX` sub-type + all-campaign mix for share calculation
- `p_ads_Ad` filtered to PMax asset types — reads `ad_group_ad_ad_strength` (EXCELLENT/GOOD/AVERAGE/POOR)
- `p_ads_CampaignAudience` — audience signal lists attached to PMax campaigns

Five topics with full system-prompt evaluation criteria:
- **PMax campaign adoption** — zero PMax = basic; ≥30% of active campaigns = champion
- **Asset group strength** — all EXCELLENT/GOOD = champion; any POOR/NO_ADS = fail/warn
- **Audience signal quality** — PMax campaigns with zero signals = fail; 3+ signals including customer match = expert/champion
- **Smart bidding configuration** — PMax without `target_cpa_micros` or `target_roas` = warn (VBB not configured)
- **PMax vs standard campaign balance** — PMax-only account = warn; healthy mix = expert

#### `campaign_setup` — real dayparting analysis

- Extractor now additionally queries `p_ads_HourlyCampaignStats` (last 30 days), grouped by `segments_day_of_week` and `segments_hour`, summing cost, conversions, clicks, impressions
- System-prompt criteria updated: detects whether conversion peaks by hour align with cost distribution; flags wasted overnight spend and absence of hour-based bid adjustments

#### `creative_content` — fixed broken SQL

- `p_ads_Ad` query was using non-existent column names (`ad_id`, `type`, `status`, `final_urls`) left over from a prior schema assumption
- Corrected to actual column names: `ad_group_ad_ad_id`, `ad_group_ad_ad_type`, `ad_group_ad_status`, `ad_group_ad_ad_strength`, `ad_group_ad_policy_summary_approval_status`, `ad_group_ad_ad_responsive_search_ad_headlines/descriptions`
- System-prompt criteria updated to reference correct field names; ad policy check now uses `policy_approval_status` instead of `status`; asset strength check now uses real `ad_strength` values

---

## [0.5.1] — 2026-05-19

### Bug fixes — CORS and auth middleware

- Fixed "Failed to fetch" on Run Audit caused by incorrect Starlette middleware ordering: `CORSMiddleware` was inner, so 401/403 short-circuit responses were sent without CORS headers and the browser blocked them
- Moved `CORSMiddleware` registration to after the auth middleware so it becomes the outermost layer and adds CORS headers to every response, including auth errors
- Fixed auth middleware raising `HTTPException` (which Starlette wraps as 500 inside `BaseHTTPMiddleware`); replaced with direct `JSONResponse(401/403)` returns
- Added `allow_origin_regex` for `*.run.app` unconditionally so both Cloud Run services always communicate correctly
- Added `OPTIONS` method bypass so CORS preflight requests are never intercepted by the auth check

---

## [0.5.0] — 2026-05-19

### Data source — switch to bwj_google_ads / account 6600502562

- `backend/app/config.py`: default `BQ_DATASET` changed from `google_ads_audit` → `bwj_google_ads`; default `ACCOUNT_SUFFIX` changed from `9149667192` → `6600502562`
- Added `MODEL_DATASET` config variable (default `google_ads_audit`) so BQML models (`gemini_3_auditor`, `gemini_model`) continue to be referenced from the original dataset while raw data is pulled from the new one
- `data_extraction.py`: removed PMax-specific tables absent from `bwj_google_ads`:
  - Audience query no longer joins to `p_ads_Audience` (not in new dataset); queries `p_ads_CampaignAudience` directly
  - Feeds query drops `p_ads_AssetGroupListingGroupFilter` sub-query (no equivalent in new dataset)
  - Creative query replaces `p_ads_Asset` / `p_ads_AssetGroup` / `p_ads_AssetGroupAsset` with `p_ads_AdGroup` for ad-structure coverage
- `deploy.sh`: `BACKEND_ENV` line updated to pass `BQ_DATASET=bwj_google_ads`, `ACCOUNT_SUFFIX=6600502562`, `MODEL_DATASET=google_ads_audit`

---

## [0.4.0] — 2026-05-13

### Security — Google OAuth restricted to @artefact.com

- Added Google Sign-In to the frontend; only accounts with `@artefact.com` Google Workspace email can log in
- Backend FastAPI middleware validates the Google ID token on every request (except `/health`); returns 401 if missing/invalid, 403 if not `@artefact.com`
- Auth is skipped when `GOOGLE_CLIENT_ID` env var is unset (local dev without credentials)
- `apiClient.ts` forwards `Authorization: Bearer <token>` header on every API call; clears stored token and reloads on 401 (expired token)
- `deploy.sh` updated to pass `GOOGLE_CLIENT_ID` to both backend (env var) and frontend (build-time `VITE_GOOGLE_CLIENT_ID`)
- `frontend/Dockerfile` updated to accept `VITE_GOOGLE_CLIENT_ID` build arg

---

## [0.3.1] — 2026-05-12

### Deployment fixes

- Fixed Cloud Build `NOT_FOUND` error caused by the Compute Engine default service account being disabled; re-enabled it
- Fixed `Forbidden` error on Cloud Run services: granted `roles/run.invoker` to `allUsers` after granting `roles/run.admin` to the deploying user
- Granted `roles/bigquery.user` and `roles/bigquery.dataViewer` to the `dma-pulse-backend` service account so the backend can query BigQuery

---

## [0.3.0] — 2026-05-12

### GCP Deployment — Cloud Run + Cloud Build

- Removed Terraform; replaced with a shell-based deploy matching the `bert_interlink` pattern
- `backend/cloudbuild.yaml` — Cloud Build config for backend Docker image
- `frontend/cloudbuild.yaml` — Cloud Build config for frontend; accepts `_API_URL` substitution to bake `VITE_API_URL` at build time
- `backend/Dockerfile` — Python 3.12-slim + uv + uvicorn
- `frontend/Dockerfile` — Node 20 multi-stage build → nginx:alpine; `VITE_API_URL` as build arg
- `frontend/nginx.conf` — listens on 8080, SPA routing (`try_files → index.html`), gzip, long-cache for hashed assets
- `backend/.gcloudignore` / `backend/.dockerignore` — excludes `.venv`, `__pycache__`, `.env`
- `frontend/.gcloudignore` / `frontend/.dockerignore` — excludes `node_modules/`, `dist/`
- `deploy.sh` — 7-step idempotent script:
  1. Enable required APIs (Cloud Run, Artifact Registry, Cloud Build, BigQuery)
  2. Create Artifact Registry repo `dma-pulse` (europe-west1) — idempotent
  3. Create `dma-pulse-backend` service account; attempt BigQuery IAM bindings with graceful fallback
  4. Build + push backend image via Cloud Build
  5. Deploy `dma-pulse-backend` Cloud Run service
  6. Build + push frontend image with backend URL baked in
  7. Deploy `dma-pulse-frontend`; update backend CORS to final frontend URL
- Artifact Registry: `europe-west1-docker.pkg.dev/coi-innovation-testing-8166/dma-pulse`
- Services live at:
  - Frontend: `https://dma-pulse-frontend-rkc5gpwqnq-ew.a.run.app`
  - Backend: `https://dma-pulse-backend-rkc5gpwqnq-ew.a.run.app`

---

## [0.2.0] — 2026-05-12

### Backend — FastAPI + BigQuery + BQML pipeline

#### Architecture
Full backend added alongside the existing React SPA. Audit pipeline state machine:
`PENDING → EXTRACTING → SPECIALIST_RUNNING → SPECIALIST_REVIEW → SCORING_RUNNING → SCORING_REVIEW → COMPLETE`

#### New files

**`backend/requirements.txt`**
`fastapi`, `uvicorn`, `google-cloud-bigquery`, `google-cloud-bigquery-storage`, `pandas`, `pydantic`, `python-dotenv`

**`backend/app/config.py`**
GCP project, dataset, BQML model references, BigQuery client (Application Default Credentials)

**`backend/app/main.py`**
FastAPI app; CORS from `ALLOWED_ORIGINS` env var; `/health` endpoint; in-memory audit store

**`backend/app/models/audit.py`**
Pydantic models: `AuditStatus` enum, `SpecialistResult`, `CategoryScore`, `PrioritizedWin`, `ScoringOutput`, `AuditState`

**`backend/app/models/brand.py`**
`BrandContext` — mirrors the frontend's brand context type

**`backend/app/services/bigquery.py`**
`run_query()` wrapper and `table()` helper for fully-qualified table references

**`backend/app/services/data_extraction.py`**
Five BigQuery queries against `_9149667192` tables:
- Campaign setup: `p_ads_Campaign`, `p_ads_Budget`, `p_ads_BidGoal`
- Audience & targeting: `p_ads_CampaignAudience`, `p_ads_CampaignCriterion`, `p_ads_Gender`, `p_ads_AgeRange`
- Conversion & KPI: `p_ads_CampaignBasicStats`, `p_ads_CampaignConversionStats`, `v_structural_audit`
- Feeds & catalogue: `p_ads_ShoppingProductStats`, `p_ads_AssetGroupListingGroupFilter`, `p_ads_ProductGroupStats`
- Creative content: `p_ads_Asset`, `p_ads_AssetGroup`, `p_ads_AssetGroupAsset`, `p_ads_Ad`

**`backend/app/services/specialist.py`**
Calls BQML `ML.GENERATE_TEXT(MODEL gemini_3_auditor, ...)` per category; parses JSON array of `SpecialistResult`; falls back to warn-level stubs on parse error

**`backend/app/services/scoring.py`**
Calls BQML `ML.GENERATE_TEXT(MODEL gemini_model, ...)` for ICE scoring; applies business model multipliers (B2B: conversion×1.5, audiences×1.3; B2C/D2C: feeds×1.5, creative×1.3); pure-Python fallback always guarantees a result

**`backend/app/routers/audit.py`**
- `POST /api/audit/run` — creates AuditState, fires background extraction + specialist pipeline
- `GET /api/audit/{id}` — returns full AuditState
- `GET /api/audit/{id}/results` — returns ScoringOutput when COMPLETE

**`backend/app/routers/validation.py`**
- `POST /api/audit/{id}/validate/specialist` — merges human overrides, fires scoring background task
- `POST /api/audit/{id}/validate/scoring` — approved=true → COMPLETE

#### Frontend additions

**`frontend/src/lib/apiClient.ts`**
Typed fetch wrapper for all 5 API calls; properly serializes FastAPI validation error arrays

**`frontend/src/components/AuditRunner.tsx`**
Brand context form + "Run Audit" button; polls `GET /audit/{id}` every 3 s; calls `onSpecialistReady` when status reaches `specialist_review`

**`frontend/src/components/SpecialistReview.tsx`**
Editable table of `SpecialistResult[]` grouped by category; inline status/level dropdowns; "Approve & Score" button

**`frontend/src/components/ScoringReview.tsx`**
Platform score, category progress bars, quick-wins table; "Approve & Publish" button

**`frontend/src/pages/Index.tsx`** (modified)
- Review-phase takeover: `SpecialistReview` and `ScoringReview` replace main content during their respective pipeline stages
- `AuditRunner` embedded in the empty-data radar panel alongside "Upload CSV instead" link
- Settings panel simplified: BrandContextForm + FileUpload + note about BigQuery connector

---

## [0.1.0] — Initial commit

### Frontend SPA — React + TypeScript + Vite

Client-side digital marketing maturity auditing tool.

- Brand context (name, business model B2B/B2C/D2C, markets, naming convention, platforms)
- File upload (CSV, XLSX, Google Sheets URL) per platform
- Platform detection + fuzzy column mapping (`metricBridge.ts`); mapping memory in localStorage
- Scoring engine (`auditCriteria.ts`): blends uploaded data evidence (50%) with manual consultant scores (50%); business model multipliers per category
- Dashboard: campaign health, naming-convention compliance, market presence (`dashboardLogic.ts`)
- Google Ads AI-readiness detection: PMax, Smart Bidding, VBB, asset groups (`aiAudit.ts`)
- Recommendation ranking by ICE score filtered by business model and platform (`roadmapLogic.ts`)
- 8 platforms: Google Ads, Microsoft Ads, Meta, LinkedIn, TikTok, Snapchat, DV360, Pinterest
- Visualisation: spider/radar chart, platform maturity grid, audit table, Mastercard-style dashboard (Recharts)
- Audit specs from `auditData.ts` (auto-generated from Excel; 8 platforms × ~100 topics × 4 maturity levels)
- Theming via `next-themes`; shadcn/ui component library; Tailwind CSS
