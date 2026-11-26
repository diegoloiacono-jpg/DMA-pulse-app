import { clearToken, getToken } from "./auth";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export interface BrandContextPayload {
  brandName: string;
  model: "B2B" | "B2C" | "D2C";
  namingConvention: string;
  demographics: string;
  markets: string[];
  selectedPlatforms: string[];
  industry?: string;
  hasCrmData?: boolean;
  hasProductFeed?: boolean;
  /** SEO platform only (backend models/brand.py SeoContext) */
  seo?: SeoContextPayload;
}

/** Brand context fields used by the SEO platform only (see seo/SEO_METRICS.md). The SEO tab has no form for them: the
 *  backend fills them from the SEO pulse the audit runs on (the n8n form). Absent or null = unknown. */
export interface SeoContextPayload {
  siteUrl: string;
  brandTerms: string[];
  competitors: string[];
  hasOnlineSales?: boolean | null;
  isNotable?: boolean | null;
  trainingBots?: "allow" | "block" | null;
  snippetExceptions: string[];
}

/** The intake of an SEO pulse: section "About the site" of the n8n form (backend pulse_intake); null = unknown. */
export interface SeoIntake {
  business_model: "B2B" | "B2C" | "D2C" | null;
  online_sales: boolean | null;
  wikipedia_notable: boolean | null;
  training_bots: "allow" | "block" | null;
  nosnippet_pages: string[];
}

/** A site with SEO data in BigQuery (backend list_seo_sites), with the client of its latest run or crawl. */
export interface SeoSite {
  site: string;
  client: string | null;
  last_at: string | null;
}

/** Which site and data an SEO audit reads from BigQuery (backend SeoAuditParams). */
export interface SeoAuditParams {
  domain: string;
  market?: string;
  as_of?: string;          // YYYY-MM-DD; default today
  max_age_days?: number;   // default 90
  search_console?: boolean;
  /** One Screaming Frog crawl / one n8n run (GET /api/audit/seo/sources); empty = the latest in the window. */
  crawl_id?: string;
  n8n_audit_id?: string;
}

/** What BigQuery holds for a site: its crawls and n8n runs, newest first (backend list_seo_sources). */
export interface SeoSources {
  site: string;
  /** One per submit of the n8n form: the run and the crawl uploaded with it (audit_id null: a crawl without a run). */
  pulses: { audit_id: string | null; crawl_id: string | null; at: string | null; checks: string | null; n_metrics: number | null;
            linked_by: "form" | "time" | null; crawl_date: string | null; internal_html: number | null; js_rendering: boolean | null;
            client: string | null; brand_terms: string[]; competitors: string[]; intake: SeoIntake;
            /** Search Console data: metrics in BigQuery, or a crawl run with Screaming Frog connected to Search Console */
            search_console: boolean; search_console_from: "metrics" | "crawl" | null }[];
  /** Search Console data for the default choice (the latest crawl, or metrics in BigQuery). */
  search_console: boolean;
  crawls: { crawl_id: string; crawl_date: string; market: string | null; internal_html: number | null;
            indexable_html: number | null; external_urls: number | null; js_rendering: boolean | null; loaded_at: string }[];
  n8n_runs: { audit_id: string; run_date: string; market: string | null; checks: string; n_metrics: number; last_write: string }[];
}

/** SEO maturity staircase (seo_criteria.seo_maturity). */
export interface SeoMaturity {
  level: "Basic" | "Advanced" | "Expert" | "Champion";
  basic_complete: boolean;
  tiers: Record<string, { pass: number; warn: number; fail: number; score: number | null; reached: boolean }>;
  threshold: number;
  warn_weight: number;
}

export interface SpecialistResult {
  topic: string;
  category: string;
  status: "pass" | "fail" | "warn";
  level: "basic" | "advanced" | "expert" | "champion";
  source: string;
  action: string;
  explanation: string;
  human_override: boolean;
  not_applicable?: boolean;
  /** SEO only: the parts of the topic the overview shows under it (Core Web Vitals: LCP, INP/TBT, CLS, opportunities) */
  details?: Record<string, number> | null;
}

export interface CategoryScore {
  name: string;
  score: number;
  pass_rate: number;
  weight: number;
}

export interface PrioritizedWin {
  topic: string;
  category: string;
  impact: number;
  confidence: number;
  ease: number;
  priority_score: number;
  action: string;
  explanation: string;
  human_override?: boolean;
}

export interface ScoringOutput {
  platform_id: string;
  category_scores: CategoryScore[];
  platform_score: number;
  omnichannel_score: number | null;
  maturity_label: "Basic" | "Advanced" | "Expert" | "Champion";
  quick_wins: PrioritizedWin[];
  /** SEO only: staircase detail behind maturity_label */
  maturity?: SeoMaturity | null;
}

export type AuditStatus =
  | "pending"
  | "extracting"
  | "specialist_running"
  | "specialist_review"
  | "scoring_running"
  | "scoring_review"
  | "complete"
  | "failed";

export interface AuditState {
  audit_id: string;
  brand_context: BrandContextPayload;
  status: AuditStatus;
  specialist_results: SpecialistResult[];
  scoring_output: ScoringOutput | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  /** SEO audits: the site, crawl and n8n run the audit read (for the Excel exports). */
  seo?: SeoAuditParams | null;
}

/** One tab of an SEO Excel export (backend services/seo_export.py). */
export interface SeoExportSheet {
  /** the criterion it is filed under (an issue of several criteria: the first of them) */
  topic: string;
  /** issue: a Screaming Frog issue with the columns of its file; links: its inlinks; pagespeed: per page; n8n: an n8n check */
  kind: "issue" | "links" | "pagespeed" | "n8n";
  /** issue and links: every criterion the issue counts for, its Screaming Frog tab, name, type and priority */
  topics?: string[];
  sf_category?: string;
  issue?: string;
  issue_type?: string | null;
  issue_priority?: string | null;
  title: string;
  columns: string[];
  rows: (string | number | boolean | null)[][];
  /** all rows, of which `rows` holds the first `limit` */
  total: number;
}

export interface SeoExport {
  site: string;
  crawl_id: string | null;
  n8n_audit_id: string | null;
  limit: number;
  sheets: SeoExportSheet[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders },
    ...init,
  });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error("Session expired — please sign in again");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const d = body?.detail;
    const message =
      typeof d === "string" ? d
      : Array.isArray(d) ? d.map((e: { msg?: string; loc?: string[] }) => `${e.loc?.join(".")}: ${e.msg}`).join("; ")
      : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface AccountInfo {
  account_id: string;
  account_name: string;
  /** Most recent DATE with campaign stats for this account. */
  last_date?: string;
}

/** Server-side saved brand context. Mirrors SavedContext in utils/savedContexts. */
export interface SavedContextDTO {
  id: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any;
  savedAt: string;
}

export const apiClient = {
  runAudit(brandContext: BrandContextPayload, accountId?: string, dataset?: string, lookbackDays?: number) {
    return request<{ audit_id: string; status: AuditStatus }>("/api/audit/run", {
      method: "POST",
      body: JSON.stringify({
        brand_context: brandContext,
        account_id: accountId || undefined,
        dataset: dataset || undefined,
        lookback_days: lookbackDays ?? undefined,
      }),
    });
  },

  runSeoAudit(brandContext: BrandContextPayload, seo: SeoAuditParams) {
    return request<{ audit_id: string; status: AuditStatus }>("/api/audit/run", {
      method: "POST",
      body: JSON.stringify({ brand_context: brandContext, platform: "seo", seo }),
    });
  },

  getSeoSites() {
    return request<{ sites: SeoSite[] }>("/api/audit/seo/sites");
  },

  getSeoSources(domain: string, market?: string) {
    const q = new URLSearchParams({ domain, ...(market ? { market } : {}) });
    return request<SeoSources>(`/api/audit/seo/sources?${q}`);
  },

  /** The rows behind one SEO criterion (topic) or all of them, for the Excel export. */
  getSeoExport(seo: SeoAuditParams, topic = "", limit = 10000) {
    const q = new URLSearchParams({ domain: seo.domain, crawl_id: seo.crawl_id ?? "", n8n_audit_id: seo.n8n_audit_id ?? "",
                                    topic, limit: String(limit) });
    return request<SeoExport>(`/api/audit/seo/export?${q}`);
  },

  /** True when the backend runs SEO audits (branch SEO-feature). Never throws and never reloads. */
  async seoSupport(): Promise<boolean> {
    try {
      const token = getToken();
      const res = await fetch(`${BASE_URL}/api/audit/seo/support`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return false;
      return (await res.json())?.seo === true;
    } catch {
      return false;
    }
  },

  getAudit(auditId: string) {
    return request<AuditState>(`/api/audit/${auditId}`);
  },

  getResults(auditId: string) {
    return request<ScoringOutput>(`/api/audit/${auditId}/results`);
  },

  validateSpecialist(auditId: string, overrides: SpecialistResult[]) {
    return request<{ audit_id: string; status: AuditStatus }>(
      `/api/audit/${auditId}/validate/specialist`,
      { method: "POST", body: JSON.stringify({ overrides }) },
    );
  },

  validateScoring(auditId: string, approved: boolean, iceOverrides: PrioritizedWin[] = []) {
    return request<{ audit_id: string; status: AuditStatus }>(
      `/api/audit/${auditId}/validate/scoring`,
      {
        method: "POST",
        body: JSON.stringify({
          approved,
          ice_overrides: iceOverrides.map(({ category, topic, impact, confidence, ease }) => ({
            category, topic, impact, confidence, ease,
          })),
        }),
      },
    );
  },

  listDatasets() {
    return request<{ datasets: string[] }>("/api/datasets");
  },

  listAccounts(dataset: string) {
    return request<{ accounts: AccountInfo[] }>(`/api/datasets/${encodeURIComponent(dataset)}/accounts`);
  },

  listContexts() {
    return request<SavedContextDTO[]>("/api/contexts");
  },

  putContext(id: string, body: { label: string; context: unknown }) {
    return request<SavedContextDTO>(`/api/contexts/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  deleteContext(id: string) {
    return request<{ id: string; deleted: boolean }>(`/api/contexts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};
