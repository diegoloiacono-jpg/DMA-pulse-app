# DMA Pulse: Handover Guide

A plain-language tour of how DMA Pulse works, what each part does, and where to find it in the code.

---

## 0. The big picture

**What it does.** DMA Pulse audits a brand's Google Ads account against the Digital Maturity Accelerator (DMA) framework. Every topic gets a maturity level (**Basic → Advanced → Expert → Champion**). The tool then produces scores, a dashboard and a roadmap of quick wins.

**How it works, in one picture:**

```
Google Ads data
      │  (loaded by the client's cloud team)
      ▼
  BigQuery  ──(anonymizer, daily)──►  Anonymized copy   ← used by the dev environment
      │                                      
      ▼
  Backend pulls and summarises the data (7 categories)
      ▼
  AI agent (Gemini) judges each audit topic: pass / warn / fail + level
      ▼
  👤 Human review #1: the consultant can override the AI
      ▼
  Scoring (plain Python rules, no AI)
      ▼
  👤 Human review #2: the consultant approves the scores
      ▼
  Dashboard + roadmap
```

**Three building blocks:**

| Block | What it is | Lives in |
|---|---|---|
| **Data** | BigQuery datasets and the anonymizer | `anonymizer/` and Google Cloud |
| **Backend** | The "brain": reads BigQuery, runs the AI agent, computes scores | `backend/` |
| **Frontend** | The website people use | `frontend/` |

**Two environments:**

- **Production** reads the real client dataset (`google_ads`).
- **Dev** reads the anonymized copy (`anonymized_data`), so developers never see client names.

Both the backend and the frontend run on **Google Cloud Run** (Google's service for running web apps without managing servers). Everything sits in the Google Cloud project `paid-media-2a86`, region `europe-west1`.

---

## 1. The data in BigQuery, and the anonymizer

### 1.1 The datasets

BigQuery is Google's data warehouse, which you can think of as a very large set of spreadsheets that can be queried quickly.

| Dataset | What it holds |
|---|---|
| `google_ads` | The client's Google Ads data used for this PoC |
| `anonymized_data` | An anonymized copy of every table in `google_ads`. Dev reads this one |
| `anonymization_keys` | **Restricted.** The "decoder ring" that maps fake names back to real ones |
| `google_ads_audit` | Reserved for AI models in BigQuery. Currently not used by the audit |
| `meta_data` | Meta (Facebook/Instagram) data written by the Meta extractor. Not yet connected to the audit |

### 1.2 What is inside `google_ads`

The tables follow the standard Google Ads export format:

- **`GOOGLEADS_P_…` tables** are the daily numbers: cost, clicks, impressions, conversions. Examples are campaign stats, keyword stats, search queries, audiences, shopping and Performance Max asset groups. They have a `DATE` column.
- **`GOOGLEADS_…METADATA` tables** describe how things are set up: campaigns, ad groups, keywords, ads, assets, accounts. They are snapshots with no date. The account names live in `GOOGLEADS_CUSTOMERMETADATA`.
- **The account key** is `PROFILE_ID`. Only the daily tables carry it, so the backend links the setup tables to an account through that account's campaigns.

**How the data arrives.** The client's cloud team loads it into our dataset every day. In the code and notes you will see both "Supermetrics" and "Data Transfer", and they are used loosely for the same pipeline. Nothing in our code calls Supermetrics directly; the app only reads the BigQuery tables.

**What the audit cannot judge from these tables.** A few topics have no data source (for example negative keyword coverage, conversion action types and attribution model). The AI is told this up front and marks them "needs manual verification" instead of guessing. The list is `DATA_GAPS` in `backend/app/services/data_extraction.py`.

### 1.3 The anonymizer

**Why it exists.** Developers use AI code assistants, and client data must not be exposed to them. The anonymizer makes a copy of the data where anything that identifies the client is swapped for a neutral code. Dev works on that copy.

**What it changes and what it keeps:**

| Changed | Kept as is |
|---|---|
| Brand and account names inside text, e.g. `ACME_FR-FR_Search` becomes `brand001_FR-FR_Search` | Metrics (cost, clicks, conversions) |
| Account IDs (`PROFILE_ID`, `ACCOUNT_ID`, `CUSTOMER_ID`, `MERCHANT_ID`), replaced with random numbers of the same length. The same real ID always gets the same fake ID, so tables still link together | Dates |
| | Markets, channel codes, campaign types, so the naming-convention and market logic still work |
| | Campaign, ad group and ad IDs |

**How it works, step by step** (the logic is in `anonymizer/anonymize.sql`):

1. **Build the list of sensitive terms.** It takes the account names from `GOOGLEADS_CUSTOMERMETADATA`, splits them into words, and adds any brand terms entered manually. Generic words and markets are skipped (a "stoplist").
2. **Give each term a permanent fake name**: `account001`, `brand001`, and so on. Once assigned, a term keeps its code forever.
3. **Plan every column of every table.** ID columns get random IDs, text columns get term replacement, and everything else is copied unchanged.
4. **Copy only what changed.** Unchanged tables are skipped. Dated tables only reload the days that changed. Everything else is fully rebuilt.
5. **Check the result.** It confirms row counts match between the original and the copy.

**When it runs.** Every day at 07:00 as a BigQuery scheduled query, using a dedicated service account (`dma-pulse-anonymizer`). It runs after the daily data refresh.

**Files** (all in `anonymizer/`):

| File | What it is for |
|---|---|
| `README.md` | The full operating guide |
| `setup.sql` | One-time setup: creates the datasets, the key tables and the replacement function |
| `anonymize.sql` | The daily job that does the actual work |
| `discover_terms.sql` | Helps find brand words worth adding to the sensitive list |
| `verify.sql` | Safety checks. It should return nothing; anything it prints is a problem (a mismatch or a leaked term) |
| `run.py` | Runs the steps from Python. We use it because the `bq` command-line tool is broken on this machine |
| `deploy.sh` | The same setup using `bq`, if it works on your machine |

**How to run it:**

```
uv run --with google-cloud-bigquery --with google-cloud-bigquery-datatransfer anonymizer/run.py <command>
```

| Command | What it does |
|---|---|
| `setup` | Creates the datasets and key tables (once) |
| `grants` | Gives the anonymizer service account the permissions it needs |
| `schedule` | Creates the daily job, or re-publishes `anonymize.sql` to it. **Run it after every edit to `anonymize.sql`**, because the schedule keeps its own copy |
| `run` | Runs the anonymizer once, right now |
| `verify` | Runs the safety checks |

**Adding a brand term.** Brand terms are not stored in the repo. They are added as rows to the table `anonymization_keys._anon_sensitive_terms` with the type `BRAND`. Use `discover_terms.sql` to find candidates.

**Limitations to know about:**

- Only terms on the list are replaced. Typos, abbreviations or product names not on the list stay visible.
- Free text such as product titles and ad copy stays real, apart from listed terms.
- Tables removed from `google_ads` are not automatically removed from the copy.

**Seeing real names again in the app (dev).** The app can show real account names in the account dropdown even on the anonymized data. This is for display only. The two helper functions are in `backend/app/services/bigquery.py`:

- `resolve_account_names()` turns `account003` back into the real name for the dropdown.
- `resolve_account_id()` turns the configured default real account ID into its anonymized equivalent.

Brand terms inside campaign names are **not** reversed in the app. To look one up, use the view `anonymization_keys.v_anon_lookup`.

---

## 2. The backend

The backend is a **FastAPI** (Python) web service. It does the heavy lifting: it reads BigQuery, asks the AI to judge each topic, and calculates scores.

### 2.1 Where everything is (`backend/app/`)

| File | What it does |
|---|---|
| `main.py` | Starts the app. Checks who is logged in (Google sign-in, `@artefact.com` accounts only). Lists datasets and accounts for the dropdowns |
| `config.py` | Settings: project name, dataset names, defaults. Read from environment variables |
| `routers/audit.py` | Starts an audit and lets the website check its progress. Contains the step-by-step pipeline |
| `routers/validation.py` | Receives the consultant's approvals and overrides (the two human reviews) |
| `routers/contexts.py` | Save, list and delete brand contexts (the brand settings) |
| `services/bigquery.py` | Small helpers to run BigQuery queries, plus the anonymized-name lookups |
| `services/data_extraction.py` | **The SQL.** Pulls and summarises the data for the 7 audit categories |
| `services/specialist.py` | **The AI agent.** Builds the prompt, calls Gemini, tidies up the answer. Also contains the prompt itself |
| `services/scoring.py` | Turns the topic results into scores, using plain rules |
| `services/context_store.py` | Reads and writes brand contexts in a Google Cloud Storage bucket |
| `models/audit.py`, `models/brand.py` | Definitions of the data shapes passed around |

### 2.2 How the data flows, step by step

1. **Pick data.** In the website's *Audit Runner*, the user chooses a dataset, an account and a saved brand context, then starts the audit.
2. **Extract** (`data_extraction.py`, function `extract_audit_data`). For each of the 7 categories it runs a handful of SQL queries on BigQuery. SQL does the counting and grouping, so the AI receives summaries, not millions of rows.

   The 7 categories are: Campaign Setup, Keyword Strategy, Audience Targeting, Conversion & KPI, Feeds & Catalogue, Creative Content, and AI Readiness (Performance Max and AI Max).

3. **AI agent judges** (`specialist.py`, function `run_specialist_agent`). One request to Gemini per category. For each topic it returns:
   - a status: **pass / warn / fail**
   - a level: **basic / advanced / expert / champion**
   - an explanation and a recommended action
4. **Human review #1.** The website shows the AI's findings, and the consultant can change any of them.
5. **Scoring** (`scoring.py`). Plain Python, no AI:
   - A category score is the share of topics at Advanced or above.
   - Categories are weighted according to the business model (B2B, B2C or D2C).
   - The platform score maps to a label: 80+ is Champion, 60+ Expert, 40+ Advanced, otherwise Basic.
   - Quick wins are the non-passing topics ranked by impact times ease; the top 10 are returned.
6. **Human review #2.** The consultant approves the scores.
7. **Results.** The website shows the dashboard and roadmap.

> **Why there is no scoring agent.** The first version used a second AI call for scoring. It was removed in v0.6.0 (May 2026) because it kept failing on output truncation and gave exactly the same results as the plain Python calculation. Scoring is now deterministic: the same findings always give the same score, and the formula can be explained to a client. The AI is only used for judgement (step 3). Source: `CHANGELOG.md`, entry 0.6.0, "Scoring agent simplified".

The audit moves through these statuses: `pending → extracting → specialist_running → specialist_review → scoring_running → scoring_review → complete` (or `failed`).

### 2.3 The endpoints (what the website can ask the backend)

| Request | What it does |
|---|---|
| `GET /health` | "Are you alive?" check |
| `GET /api/datasets` | Lists BigQuery datasets |
| `GET /api/datasets/{dataset}/accounts` | Lists the accounts that have data in a dataset |
| `POST /api/audit/run` | Starts an audit |
| `GET /api/audit/{id}` | Progress of an audit (the website asks every 3 seconds) |
| `GET /api/audit/{id}/results` | Final scores (only when complete) |
| `POST /api/audit/{id}/validate/specialist` | Sends the consultant's overrides after review #1 |
| `POST /api/audit/{id}/validate/scoring` | Approves the scores after review #2 |
| `GET / PUT / DELETE /api/contexts` | Manage saved brand contexts |

### 2.4 Where the AI agent prompts are

There is **one AI agent**: Google **Gemini 2.5 Flash**, run through Google's Vertex AI. Everything about it is in one file: **`backend/app/services/specialist.py`**.

| What | Where |
|---|---|
| Model name | line 33 (`_GEMINI_MODEL`) |
| List of topics the agent must evaluate, per category (46 topics in total) | lines 45-106 (`_CATEGORY_TOPICS`) |
| **The system prompt** (about 640 lines) | **lines 108-750** (`_SYSTEM_PROMPT`) |
| How the final prompt is put together and sent | line 923 (`_call_gemini`) |
| The loop that runs all categories | line 1031 (`run_specialist_agent`) |

**What is inside the system prompt** (`_SYSTEM_PROMPT`):

| Lines | Content |
|---|---|
| 109-127 | The role ("senior Google Ads specialist"), the required JSON answer format, and what each maturity level means |
| 129-146 | Rule for missing data: mark as "needs manual verification" instead of guessing |
| 150-262 | **Campaign Setup** criteria (naming convention, status hygiene, bidding strategy, budget, campaign mix, scheduling, data density) |
| 264-320 | **Audience Targeting** criteria |
| 322-397 | **Conversion & KPI** criteria |
| 399-476 | **Feeds & Catalogue** criteria |
| 478-558 | **Creative Content** criteria |
| 560-637 | **Keyword Strategy** criteria |
| 639-731 | **AI Readiness** criteria (Performance Max, AI Max) |
| 733-748 | Adjustments by brand context (B2B vs B2C/D2C, markets, whether CRM data or a product feed exists) |

**How the final message to Gemini is assembled** (`_call_gemini`): the system prompt, then a block describing the brand (name, business model, naming convention, markets, industry), then the category, its topics, the list of topics with no data source, and finally the data itself as compact JSON.

**To change how the AI judges a topic:** edit its criteria in the matching line range above. **To add or rename a topic:** edit `_CATEGORY_TOPICS` and the criteria in the prompt. Topic names must match, because the answer format only accepts the listed topic names. After any change, redeploy.

**Settings worth knowing:** low "temperature" (0.1) so answers are consistent, and the answer is forced into a strict JSON format. If the AI fails for a category, every topic in it falls back to "warn / basic" instead of crashing.

### 2.5 What looks like AI but isn't

Three frontend files sound like AI but are plain rules:

- `frontend/src/utils/aiAudit.ts` detects Performance Max, Smart Bidding and value-based bidding.
- `frontend/src/utils/auditCriteria.ts` is the scoring engine for the manual-upload path.
- `frontend/src/utils/roadmapLogic.ts` ranks quick wins.

### 2.6 Brand contexts (saved brand settings)

A brand context holds the brand name, business model, markets, naming convention and platforms. Each one is saved as a small file in a Google Cloud Storage bucket (`paid-media-2a86-dma-pulse-contexts`, with a `-dev` version for dev). The code is `services/context_store.py` and `routers/contexts.py`.

### 2.7 Deploying and running

| Item | Where / how |
|---|---|
| Deploy everything | `./deploy.sh prod` or `./deploy.sh dev` from the repo root. Builds both apps and deploys them to Cloud Run |
| Services created | `dma-pulse-backend` and `dma-pulse-frontend` (`-dev` suffix for dev) |
| Automatic dev deploy | `.github/workflows/deploy-dev.yml` runs `deploy.sh dev` on each push to `master` that touches `frontend/`, `backend/` or `deploy.sh`. Production is deployed manually |
| Login | Google sign-in. `GOOGLE_CLIENT_ID` must be set, otherwise login is silently switched off |
| Which data | Prod uses `BQ_DATASET=google_ads`. Dev uses `BQ_DATASET=anonymized_data` and `ANON_KEYS_DATASET=anonymization_keys` |
| Backend settings (names only) | `GCP_PROJECT`, `BQ_DATASET`, `ANON_KEYS_DATASET`, `DEFAULT_ACCOUNT_ID`, `CONTEXT_BUCKET`, `GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS` |
| Backend container | `backend/Dockerfile`, `backend/cloudbuild.yaml` |

### 2.8 Built but not connected: the Meta extractor

`functions/meta_extractor/` is a small Google Cloud Function that pulls Meta Ads data (campaigns, ad sets, ads, daily insights, audiences) and writes it to the `meta_data` dataset. The audit does not read that data yet.

---

## 3. The frontend (the website)

The frontend is a **React + TypeScript** web app, built with **Vite** and styled with **Tailwind CSS**. It is served as static files by nginx on Cloud Run. Everything is in `frontend/src/`.

### 3.1 Where things are

| What | File |
|---|---|
| **The main screen.** It holds all the app's state and connects every other piece | `src/pages/Index.tsx` |
| Google sign-in screen | `src/components/LoginPage.tsx`, `src/lib/auth.ts` |
| Brand context form and saving | `src/utils/brandContext.ts`, `src/utils/savedContexts.ts` |
| Start a backend audit, show progress | `src/components/AuditRunner.tsx` |
| **Review #1:** consultant checks the AI's findings | `src/components/SpecialistReview.tsx` |
| **Review #2:** consultant approves the scores | `src/components/ScoringReview.tsx`, `ScoringCategoryBreakdown.tsx` |
| All calls to the backend | `src/lib/apiClient.ts` |
| Main dashboard score card | `src/components/MastercardDashboard.tsx` |
| Platform grid, radar chart, score ring | `PlatformMaturityGrid.tsx`, `RadarChart.tsx`, `ScoreRing.tsx` |
| Detailed topic table, category breakdown, evidence panel | `AuditTable.tsx`, `CategoryBreakdown.tsx`, `EvidenceDrawer.tsx` |
| Roadmap / quick wins | `StrategicWins.tsx`, `src/utils/roadmapLogic.ts` |
| Missing-data panel | `DataGapsFlyout.tsx` |
| The audit questions (platforms, categories, topics, four levels each) | `src/data/auditData.ts` |
| Reusable building blocks (buttons, dialogs) | `src/components/ui/` |

`src/data/auditData.ts` is **generated from the DMA Excel file** in the repo root. Do not edit it by hand; regenerate it when the audit specification changes. The `src/components/ui/` files are standard shadcn/ui blocks and are not modified.

**Manual-upload path (the original design).** Users can also upload CSV, Excel or Google Sheets exports for 8 platforms (Google Ads, Microsoft Ads, Meta, LinkedIn, TikTok, Snapchat, DV360, Pinterest). The files are read and scored in the browser with no AI. The relevant files are `FileUpload.tsx`, `ColumnMapper.tsx` and `src/lib/metricBridge.ts`, which translates 30+ platform column names into one common format. Scoring is in `src/utils/auditCriteria.ts` and `dashboardLogic.ts`.

### 3.2 The user journey

1. **Sign in** with a Google account.
2. **Set the brand context**: name, business model, markets, naming convention, platforms. This can be saved and reused.
3. **Get the data**, in one of two ways:
   - **Audit Runner:** pick a BigQuery dataset and account, and the backend and AI do the analysis (Google Ads only for now).
   - **Upload files:** drop in exports for any of the 8 platforms.
4. **Review** the AI's findings, then the scores (Audit Runner path only).
5. **Dashboard:** overall score, platform grid, radar chart, topic table.
6. **Roadmap:** quick wins and high-impact actions.

---

## 4. Good to know

- **Audits are kept in memory.** If the backend restarts, in-progress and finished audits disappear. Only brand contexts are stored permanently.
- **Login can be switched off.** If `GOOGLE_CLIENT_ID` is not set on the backend, the API accepts every request.
- **Extraction problems can look like low scores.** If a query for a category fails, the AI sees "no data" for it and marks its topics as needing manual verification, rather than the audit failing. If a category looks unexpectedly weak, check the backend logs.
- **The audit through the backend covers Google Ads only.** The manual-upload path covers 8 platforms.
- **The anonymizer covers Google Ads only.** A multi-platform version (for example Meta) has been planned but is on hold.
- **The Meta extractor is not connected** to the audit yet.
