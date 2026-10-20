import { SEO_CATEGORY_LABELS } from "@/data/seoPulse";

const ACRONYMS: Record<string, string> = { ai: "AI", kpi: "KPI", kpis: "KPIs" };

/** "ai_readiness" -> "AI Readiness", "conversion_kpi" -> "Conversion KPI".
 *  SEO categories use the section names of the SEO pulse ("onpage_content" -> "On-page & Content"). */
export function categoryLabel(key: string): string {
  if (SEO_CATEGORY_LABELS[key]) return SEO_CATEGORY_LABELS[key];
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => ACRONYMS[w.toLowerCase()] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
