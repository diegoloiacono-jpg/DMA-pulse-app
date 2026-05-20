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
}

export interface ScoringOutput {
  platform_id: string;
  category_scores: CategoryScore[];
  platform_score: number;
  omnichannel_score: number | null;
  maturity_label: "Basic" | "Advanced" | "Expert" | "Champion";
  quick_wins: PrioritizedWin[];
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

export const apiClient = {
  runAudit(brandContext: BrandContextPayload, accountId?: string, dataset?: string) {
    return request<{ audit_id: string; status: AuditStatus }>("/api/audit/run", {
      method: "POST",
      body: JSON.stringify({
        brand_context: brandContext,
        account_id: accountId || undefined,
        dataset: dataset || undefined,
      }),
    });
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

  validateScoring(auditId: string, approved: boolean) {
    return request<{ audit_id: string; status: AuditStatus }>(
      `/api/audit/${auditId}/validate/scoring`,
      { method: "POST", body: JSON.stringify({ approved }) },
    );
  },

  listDatasets() {
    return request<{ datasets: string[] }>("/api/datasets");
  },
};
