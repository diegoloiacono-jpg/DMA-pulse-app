/**
 * Last completed SEO audit in this browser, shown in the Organic group of the overview.
 * Only a display convenience: the SEO tab is the place to run and review audits.
 */
export interface SeoSummary {
  brandName: string;
  domain: string;
  platformScore: number;
  maturityText: string;
  topWin: string | null;
  completedAt: string;
}

const KEY = "dma_seo_last_result";

export function saveSeoSummary(summary: SeoSummary): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(summary));
  } catch {
    /* private mode or quota: the overview then just shows no SEO score */
  }
}

export function loadSeoSummary(): SeoSummary | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SeoSummary) : null;
  } catch {
    return null;
  }
}
