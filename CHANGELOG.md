# DMA Pulse — Changelog

All notable changes to this project are documented here.

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
