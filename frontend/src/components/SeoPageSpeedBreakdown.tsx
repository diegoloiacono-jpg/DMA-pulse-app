/**
 * The PageSpeed values under a criterion (LCP, INP or TBT in the lab, CLS, the Performance score), each against Google's
 * bands, plus the largest PageSpeed opportunities. Values come from SpecialistResult.details: the metrics of that topic
 * (field data of the origin, else of the pages, else Lighthouse lab data), so each criterion shows its own part and the
 * opportunities that improve it; the results page passes the metrics of all four together.
 */
type Band = "good" | "ni" | "poor";

const BAND_STYLE: Record<Band, { dot: string; label: string }> = {
  good: { dot: "bg-score-excellent", label: "good" },
  ni: { dot: "bg-score-warning", label: "needs improvement" },
  poor: { dot: "bg-score-poor", label: "poor" },
};

const band = (v: number, good: number, poor: number): Band => (v <= good ? "good" : v <= poor ? "ni" : "poor");

// [metric, label, unit]: the opportunities, as medians per page
const TIME_OPPORTUNITIES: [string, string][] = [
  ["psi_render_blocking_ms", "Render-blocking requests"],
  ["psi_unused_js_ms", "Unused JavaScript"],
  ["psi_unused_css_ms", "Unused CSS"],
  ["psi_js_execution_ms", "JavaScript execution time"],
  ["psi_main_thread_ms", "Main-thread work"],
  ["psi_font_display_ms", "Font display"],
];
const SIZE_OPPORTUNITIES: [string, string][] = [
  ["psi_image_delivery_kb", "Image delivery"],
  ["psi_cache_kb", "Cache lifetimes"],
  ["psi_legacy_js_kb", "Legacy JavaScript"],
];

interface Props {
  details: Record<string, number>;
}

export default function SeoPageSpeedBreakdown({ details: d }: Props) {
  const lab = d.is_cwv_from_lab === 1;
  const labNote = lab || (d.inp_ms == null && d.tbt_lab_ms != null && d.is_inp_from_lab === 1);
  const field = d.has_crux_origin === 1 ? "field data, whole site" : "field data, median of the pages";
  const parts: { name: string; title: string; value: string; band: Band; source: string; target: string }[] = [];
  if (d.lcp_ms != null)
    parts.push({ name: "LCP", title: "Largest Contentful Paint", value: `${(d.lcp_ms / 1000).toFixed(1)} s`,
                 band: band(d.lcp_ms, 2500, 4000), source: lab ? "lab" : field, target: "good ≤ 2.5 s" });
  if (d.inp_ms != null)
    parts.push({ name: "INP", title: "Interaction to Next Paint", value: `${Math.round(d.inp_ms)} ms`,
                 band: band(d.inp_ms, 200, 500), source: field, target: "good ≤ 200 ms" });
  else if (d.tbt_lab_ms != null)
    parts.push({ name: "TBT", title: "Total Blocking Time, the lab stand-in for INP", value: `${Math.round(d.tbt_lab_ms)} ms`,
                 band: band(d.tbt_lab_ms, 200, 600), source: "lab", target: "good ≤ 200 ms" });
  if (d.cls != null)
    parts.push({ name: "CLS", title: "Cumulative Layout Shift", value: d.cls.toFixed(2),
                 band: band(d.cls, 0.1, 0.25), source: lab ? "lab" : field, target: "good ≤ 0.1" });

  const top = (list: [string, string][], n: number) =>
    list.filter(([m]) => (d[m] ?? 0) > 0).sort((a, b) => d[b[0]] - d[a[0]]).slice(0, n);
  const timeTop = top(TIME_OPPORTUNITIES, 3);
  const sizeTop = top(SIZE_OPPORTUNITIES, 2);

  const facts = [
    d.performance_score != null ? `Performance score ${Math.round(d.performance_score)} (median, lab)` : null,
    d.psi_page_weight_kb != null ? `page weight ${Math.round(d.psi_page_weight_kb)} kB` : null,
    d.psi_dom_size != null ? `DOM ${Math.round(d.psi_dom_size)} elements` : null,
    d.n_psi_pages != null ? `${Math.round(d.n_psi_pages)} pages measured` : null,
  ].filter((x): x is string => x !== null);

  if (!parts.length && d.performance_score == null) return null;
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/20 px-3 py-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {parts.map(p => (
          <div key={p.name} className="flex items-start gap-2" title={`${p.title} (${p.target})`}>
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${BAND_STYLE[p.band].dot}`} />
            <div className="flex flex-col">
              <span className="text-xs">
                <span className="font-semibold">{p.name}</span> {p.value}
                <span className="text-muted-foreground"> · {BAND_STYLE[p.band].label}</span>
              </span>
              <span className="text-[10px] text-muted-foreground">{p.target} · {p.source}</span>
            </div>
          </div>
        ))}
      </div>
      {facts.length > 0 && <p className="text-[11px] text-muted-foreground">{facts.join(" · ")}</p>}
      {(timeTop.length > 0 || sizeTop.length > 0) && (
        <p className="text-[11px]">
          <span className="font-semibold">Largest opportunities (median per page): </span>
          {[...timeTop.map(([m, l]) => `${l} ${(d[m] / 1000).toFixed(1)} s`), ...sizeTop.map(([m, l]) => `${l} ${Math.round(d[m])} kB`)].join(", ")}
        </p>
      )}
      {labNote && (
        <p className="text-[10px] text-muted-foreground">
          No CrUX field data for this site: these are Lighthouse lab values, measured on a simulated slow mobile connection and
          stricter than what real users see.
        </p>
      )}
    </div>
  );
}
