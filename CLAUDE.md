# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (run from `frontend/`)

```bash
npm install          # Install dependencies
npm run dev          # Dev server at http://localhost:8080
npm run build        # Production build → dist/
npm run build:dev    # Development mode build
npm run preview      # Preview production build
npm test             # Run unit tests (Vitest, one-shot)
npm run test:watch   # Unit tests in watch mode
npm run lint         # ESLint check
```

Path alias `@/` resolves to `src/`. The backend URL is baked in at build time via `VITE_API_URL` (default `http://localhost:8000`); Google login uses `VITE_GOOGLE_CLIENT_ID`.

### Backend (run from `backend/`)

FastAPI app, Python 3.12, entry point `app.main:app` (the container runs `uvicorn app.main:app` on port 8080). Dependencies are in `backend/requirements.txt`. Locally it uses Application Default Credentials for BigQuery, GCS and Vertex AI. Settings come from env vars (see `backend/app/config.py`).

### Deploy (run from repo root)

```bash
./deploy.sh dev      # Build and deploy backend + frontend to Cloud Run (-dev services)
./deploy.sh prod     # Same for production (manual only)
```

`.github/workflows/deploy-dev.yml` runs `./deploy.sh dev` on every push to `master` that touches `frontend/`, `backend/` or `deploy.sh`. Project `paid-media-2a86`, region `europe-west1`.

## Architecture Overview

**DMA Pulse** audits a brand's digital marketing platform maturity against the DMA framework (Basic → Advanced → Expert → Champion). It is a React/TypeScript SPA (`frontend/`) plus a FastAPI backend (`backend/`), both on Cloud Run, with BigQuery as the data source and Gemini (Vertex AI) as the audit agent.

There are two ways to get an audit:

1. **Backend audit ("Audit Runner")**, Google Ads only: the backend reads BigQuery, Gemini judges each topic, two human review steps, then deterministic scoring.
2. **Manual upload**, 8 platforms: the user uploads CSV/XLSX/Google Sheets files and everything is scored in the browser, with no AI and no backend call.

### Backend audit flow

1. **UI** (`AuditRunner.tsx`) lists datasets (`GET /api/datasets`) and accounts (`GET /api/datasets/{ds}/accounts`), then starts the audit (`POST /api/audit/run`) and polls `GET /api/audit/{id}` every 3 s.
2. **Extraction** (`backend/app/services/data_extraction.py`, `extract_audit_data`): parameterized SQL per category (7 categories: campaign setup, keyword strategy, audience targeting, conversion/KPI, feeds & catalogue, creative content, AI readiness). SQL aggregates, so the model receives summaries. `DATA_GAPS` lists topics with no data source.
3. **Specialist agent** (`backend/app/services/specialist.py`): one Gemini 2.5 Flash call per category on Vertex AI. Returns pass/warn/fail plus a maturity level per topic. The system prompt is `_SYSTEM_PROMPT` (about lines 108-750), topic lists are `_CATEGORY_TOPICS`, and `_call_gemini` assembles the prompt. Topic names in answers are normalised back to canonical names.
4. **Human review #1** (`SpecialistReview.tsx`, `POST /api/audit/{id}/validate/specialist`): consultant overrides findings, which triggers scoring.
5. **Scoring** (`backend/app/services/scoring.py`): deterministic Python, no AI. The category score is the share of topics at Advanced or above, weighted by business model. It mirrors `frontend/src/utils/auditCriteria.ts`. The scoring AI call was removed in v0.6.0 (it hit token truncation and gave identical results).
6. **Human review #2** (`ScoringReview.tsx`, `POST /api/audit/{id}/validate/scoring`): approval moves the status to `complete`.

Status machine (`backend/app/models/audit.py`): `pending → extracting → specialist_running → specialist_review → scoring_running → scoring_review → complete` (or `failed`). Audit sessions are held **in memory** (`routers/audit.py`), so a backend restart loses them. Only brand contexts persist.

### Backend files (`backend/app/`)

| File | Role |
|---|---|
| `main.py` | App, Google ID-token auth middleware (`@artefact.com` only; skipped if `GOOGLE_CLIENT_ID` is empty), CORS, datasets/accounts endpoints |
| `config.py` | Env vars: `GCP_PROJECT`, `BQ_DATASET`, `ANON_KEYS_DATASET`, `DEFAULT_ACCOUNT_ID`, `CONTEXT_BUCKET`, `GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS` |
| `routers/audit.py` | Run/poll/results endpoints and the background pipeline |
| `routers/validation.py` | The two human-review endpoints |
| `routers/contexts.py` | CRUD for saved brand contexts |
| `services/bigquery.py` | Query helpers and anonymized-name/ID lookups (`resolve_account_names`, `resolve_account_id`) |
| `services/data_extraction.py` | Per-category SQL |
| `services/specialist.py` | Gemini agent and the system prompt |
| `services/scoring.py` | Deterministic scoring and quick-win ranking |
| `services/context_store.py` | Brand contexts stored as JSON objects in a GCS bucket |
| `models/audit.py`, `models/brand.py` | Pydantic models |

### Data (BigQuery, project `paid-media-2a86`)

| Dataset | Role |
|---|---|
| `google_ads` | Client Google Ads data. Daily fact tables `GOOGLEADS_P_*` (with `DATE`, `PROFILE_ID`) and setup snapshots `GOOGLEADS_*METADATA`. The account key is `PROFILE_ID` |
| `anonymized_data` | Anonymized copy of `google_ads`, read by the **dev** environment (prod reads `google_ads`) |
| `anonymization_keys` | Restricted: term and ID mappings used to reverse anonymization for display |
| `google_ads_audit` | Reserved for BigQuery AI models; currently unused by the audit |
| `meta_data` | Written by `functions/meta_extractor/` (Cloud Function). Not read by the audit yet |

### Anonymizer (`anonymizer/`)

Daily BigQuery scheduled query (07:00, service account `dma-pulse-anonymizer`) that copies `google_ads` to `anonymized_data`, replacing brand/account terms (`brand001`, `account001`) and account IDs with stable fakes while keeping metrics, dates and naming structure. Files: `setup.sql`, `anonymize.sql`, `discover_terms.sql`, `verify.sql`, `run.py`, `deploy.sh`, `README.md`. Brand terms are rows in `anonymization_keys._anon_sensitive_terms` and are deliberately not stored in the repo. Do not read or print client rows from these tables.

The `bq` CLI is broken on the dev machine, so use `run.py`:

```bash
uv run --with google-cloud-bigquery --with google-cloud-bigquery-datatransfer anonymizer/run.py <setup|grants|schedule|run|verify>
```

After editing `anonymize.sql`, run `schedule` to re-publish it, because the scheduled query keeps its own copy. `verify` should print nothing.

### Frontend data flow (manual-upload path)

1. **Brand context** (`src/utils/brandContext.ts`, `savedContexts.ts`): naming convention, business model (B2B/B2C/D2C), markets, platforms. Saved contexts live in the backend (GCS), not localStorage; localStorage is only a migration source and cache.
2. **File upload** (`FileUpload.tsx`): CSV, XLSX or Google Sheets URL per platform.
3. **Column mapping** (`src/lib/metricBridge.ts` + `ColumnMapper.tsx`): auto-detects the platform, fuzzy-matches headers to the unified schema, and remembers mappings in localStorage per `brand:platform`.
4. **Normalization**: rows become `UnifiedRow[]` (spend, clicks, impressions, ROAS, CPA, etc.).
5. **Scoring** (`src/utils/auditCriteria.ts`): scores each topic 0–3, blending uploaded-data evidence (50%) with manual consultant scores (50%). Business model multipliers apply per category.
6. **Dashboard computation** (`src/utils/dashboardLogic.ts`): campaign health, naming-convention compliance and market presence from campaign names.
7. **AI readiness** (`src/utils/aiAudit.ts`): rule-based Google Ads detection of PMax, Smart Bidding and VBB (no LLM call).
8. **Strategic wins** (`src/utils/roadmapLogic.ts`): ranks quick wins and high-impact actions by business model and platform.
9. **Visualization**: `src/pages/Index.tsx` orchestrates all state; child components (MastercardDashboard, PlatformMaturityGrid, RadarChart, AuditTable, etc.) are presentational.

### Key frontend files

| File | Role |
|---|---|
| `src/pages/Index.tsx` | Root page: owns all lifted state and coordinates every subcomponent |
| `src/lib/apiClient.ts` | The only backend client: attaches the Google token, reloads on 401 |
| `src/lib/auth.ts`, `LoginPage.tsx` | Google sign-in (skipped if `VITE_GOOGLE_CLIENT_ID` is empty) |
| `src/components/AuditRunner.tsx` | Starts and polls a backend audit |
| `src/components/SpecialistReview.tsx`, `ScoringReview.tsx` | The two human-review steps |
| `src/data/auditData.ts` | Static platform/category/topic audit specs |
| `src/lib/metricBridge.ts` | Unifies 30+ platform-specific column names into `UnifiedRow` |
| `src/utils/auditCriteria.ts` | Scoring engine for the upload path |
| `src/utils/dashboardLogic.ts` | Naming parser, consistency score, market detection |
| `src/utils/aiAudit.ts` | Google Ads AI-readiness detection |
| `src/utils/roadmapLogic.ts` | Strategic wins ranking |

### Audit data

`src/data/auditData.ts` is **auto-generated** from the DMA Excel file in the repo root (`[KNOW] Artefact - Digital Maturity Accelerator (DMA) - Global edition.xlsx`). Do not hand-edit it; regenerate it from the Excel when audit specs change. It covers 8 platforms (Google Ads, Microsoft Ads, Meta, LinkedIn, TikTok, Snapchat, DV360, Pinterest), each with ~7–15 categories and ~100+ topics scored at four maturity levels.

### State management

- Frontend: no global store. State is prop-drilled from `Index.tsx` (`ManualScoreMap` as `Record<topicId, 0|1|2|3>`, `uploadedFiles` as `{ platform, unifiedRows[] }[]`).
- localStorage: column-mapping memory keyed by `brand:platform`, and the auth token (`dma_auth_token`).
- Server: audit sessions in backend memory; brand contexts in GCS.

### UI conventions

- Components live in `src/components/`; generic primitives are in `src/components/ui/` (shadcn/ui wrappers — do not modify these).
- Tailwind custom tokens: `score-excellent`, `score-good`, `score-warning`, `score-poor` for maturity colour coding.
- Theme switching via `next-themes`; always use Tailwind dark-mode classes (`dark:bg-…`).
- Icons exclusively from `lucide-react`.

## Workflow

Deploy to Cloud Run and let the user test before committing to git.
