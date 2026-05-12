# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the `frontend/` directory:

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

Path alias `@/` resolves to `src/`.

## Architecture Overview

**DMA Pulse** is a fully client-side React/TypeScript SPA for auditing digital marketing platform maturity. No backend — all data processing happens in the browser.

### Data flow

1. **Brand context** (`src/utils/brandContext.ts`) — sets naming convention, business model (B2B/B2C/D2C), markets, and active platforms.
2. **File upload** (`FileUpload.tsx`) — accepts CSV, XLSX, or Google Sheets URLs per platform.
3. **Platform detection & column mapping** (`src/lib/metricBridge.ts` + `ColumnMapper.tsx`) — auto-detects the platform, fuzzy-matches column headers to a unified schema, saves mappings to localStorage per brand/platform.
4. **Normalization** — raw rows are bridged to `UnifiedRow[]` (standardized spend, clicks, impressions, ROAS, CPA, etc.).
5. **Scoring** (`src/utils/auditCriteria.ts`) — scores each audit topic 0–3 by blending uploaded data evidence (50%) with manual consultant scores (50%). Business model multipliers apply per category.
6. **Dashboard computation** (`src/utils/dashboardLogic.ts`) — derives campaign health score, naming-convention compliance, and market presence from campaign names.
7. **AI readiness** (`src/utils/aiAudit.ts`) — Google Ads specific: detects PMax, Smart Bidding, VBB, and injects action items.
8. **Strategic wins** (`src/utils/roadmapLogic.ts`) — ranks quick-win and high-impact recommendations filtered by business model and platform.
9. **Visualization** — `Index.tsx` orchestrates all state; child components (MastercardDashboard, PlatformMaturityGrid, RadarChart, AuditTable, etc.) are purely presentational.

### Key source files

| File | Role |
|---|---|
| `src/pages/Index.tsx` | Root page — owns all lifted state, coordinates every subcomponent |
| `src/data/auditData.ts` | Static platform/category/topic audit specs (auto-generated from Excel) |
| `src/lib/metricBridge.ts` | Unifies 30+ platform-specific column names into a single `UnifiedRow` schema |
| `src/utils/auditCriteria.ts` | Scoring engine: manual score types, attestation keywords, blended scoring |
| `src/utils/dashboardLogic.ts` | Campaign naming parser, consistency score, market detection |
| `src/utils/aiAudit.ts` | Google Ads AI-readiness detection (PMax, VBB, asset groups) |
| `src/utils/roadmapLogic.ts` | Strategic wins / recommendation ranking |

### Audit data

`src/data/auditData.ts` is **auto-generated** from `KNOW_Artefact_Digital_Maturity_Accelerator_DMA_Global_edition.xlsx`. Do not hand-edit it — regenerate from the source Excel when audit specs change.

It covers 8 platforms (Google Ads, Microsoft Ads, Meta, LinkedIn, TikTok, Snapchat, DV360, Pinterest), each with ~7–15 categories and ~100+ topics scored at four maturity levels: Basic → Advanced → Expert → Champion.

### State management

- **BrandContext** (`brandContext.ts`) — React context for brand name, markets, naming convention, business model.
- **ManualScoreMap** — `Record<topicId, 0|1|2|3>` lifted to `Index.tsx`, passed down as props.
- **uploadedFiles** — array of `{ platform, unifiedRows[] }`, also lifted to `Index.tsx`.
- **localStorage** — column mapping memory, keyed by `brand:platform`.
- No global store (Redux, Zustand, etc.) — state is prop-drilled from `Index.tsx`.

### UI conventions

- Components live in `src/components/`; generic primitives are in `src/components/ui/` (shadcn/ui wrappers — do not modify these).
- Tailwind custom tokens: `score-excellent`, `score-good`, `score-warning`, `score-poor` for maturity colour coding.
- Theme switching via `next-themes`; always use Tailwind dark-mode classes (`dark:bg-…`).
- Icons exclusively from `lucide-react`.
