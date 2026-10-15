const ACRONYMS: Record<string, string> = { ai: "AI", kpi: "KPI", kpis: "KPIs" };

/** "ai_readiness" -> "AI Readiness", "conversion_kpi" -> "Conversion KPI". */
export function categoryLabel(key: string): string {
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => ACRONYMS[w.toLowerCase()] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
