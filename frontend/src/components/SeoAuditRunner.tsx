import { useEffect, useRef, useState } from "react";
import { Loader2, Play, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiClient, AuditState, AuditStatus, BrandContextPayload, SeoIntake, SeoSite, SeoSources } from "@/lib/apiClient";

interface Props {
  onSpecialistReady: (auditId: string, state: AuditState) => void;
}

const STATUS_LABELS: Record<AuditStatus, string> = {
  pending: "Starting…",
  extracting: "Reading SEO data from BigQuery…",
  specialist_running: "SEO Specialist Agent analysing…",
  specialist_review: "Ready for review",
  scoring_running: "Scoring…",
  scoring_review: "Ready for scoring review",
  complete: "Complete",
  failed: "Failed",
};

const POLLING_STATUSES: AuditStatus[] = ["pending", "extracting", "specialist_running", "scoring_running"];

const FIELD =
  "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
const num = (n?: number | null) => (n == null ? "?" : n.toLocaleString("en-GB"));
const yesNo = (v: boolean | null) => (v == null ? "unknown" : v ? "yes" : "no");

/** The intake of a pulse in one line (section "About the site" of the n8n form). */
const intakeText = (i: SeoIntake) =>
  [
    `sells online ${yesNo(i.online_sales)}`,
    `notable for Wikipedia ${yesNo(i.wikipedia_notable)}`,
    `AI training bots ${i.training_bots === "allow" ? "allowed" : i.training_bots === "block" ? "blocked" : "unknown"}`,
    i.nosnippet_pages.length ? `${i.nosnippet_pages.length} intentional nosnippet page${i.nosnippet_pages.length > 1 ? "s" : ""}` : "",
  ].filter(Boolean).join("; ");

/**
 * SEO audit runner: the site (from BigQuery), the SEO pulse the audit runs on, and Run. The brand context comes from
 * the pulse (the n8n form: client, business model, brand terms, competitors, intake); the backend fills it in.
 */
export default function SeoAuditRunner({ onSpecialistReady }: Props) {
  const [status, setStatus] = useState<AuditStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // null = checking; false = this backend cannot run SEO audits (e.g. master, or no backend at all)
  const [seoBackend, setSeoBackend] = useState<boolean | null>(null);
  useEffect(() => {
    apiClient.seoSupport().then(setSeoBackend);
  }, []);

  // The sites with SEO data in BigQuery, most recent first
  const [sites, setSites] = useState<SeoSite[] | null>(null);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [site, setSite] = useState("");
  useEffect(() => {
    if (!seoBackend) return;
    apiClient.getSeoSites()
      .then(r => { setSites(r.sites); setSitesError(null); })
      .catch(e => setSitesError(e instanceof Error ? e.message : "Could not read BigQuery"));
  }, [seoBackend]);

  // The pulses of the chosen site; the chosen one as "audit_id|crawl_id" ("" = the latest crawl and metrics)
  const [sources, setSources] = useState<SeoSources | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [pulse, setPulse] = useState("");
  const pulseKey = (p: SeoSources["pulses"][number]) => `${p.audit_id ?? ""}|${p.crawl_id ?? ""}`;
  useEffect(() => {
    setSources(null);
    if (!seoBackend || !site) return;
    let live = true;
    apiClient.getSeoSources(site)
      .then(s => {
        if (!live) return;
        setSources(s); setSourcesError(null);
        // the newest pulse, unless the chosen one is still there
        setPulse(k => (s.pulses.some(p => pulseKey(p) === k) ? k : s.pulses[0] ? pulseKey(s.pulses[0]) : ""));
      })
      .catch(e => { if (live) setSourcesError(e instanceof Error ? e.message : "Could not read BigQuery"); });
    return () => { live = false; };
  }, [site, seoBackend]);

  const chosen = sources?.pulses.find(p => pulseKey(p) === pulse);
  // The run whose form gives the brand context: the chosen one, else the latest run (as the backend does)
  const ctxPulse = chosen?.audit_id ? chosen : sources?.pulses.find(p => p.audit_id);
  const siteInfo = sites?.find(s => s.site === site);
  const model = ctxPulse?.intake.business_model ?? null;

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const poll = async (id: string) => {
    try {
      const state = await apiClient.getAudit(id);
      setStatus(state.status);
      if (!POLLING_STATUSES.includes(state.status)) {
        stopPolling();
        setRunning(false);
        if (state.status === "specialist_review") onSpecialistReady(id, state);
        if (state.status === "failed") setError(state.error ?? "Unknown error");
      }
    } catch (e) {
      stopPolling();
      setRunning(false);
      setError(e instanceof Error ? e.message : "Polling failed");
    }
  };

  const handleRun = async () => {
    if (!site) {
      setError("Choose a site.");
      return;
    }
    setError(null);
    setRunning(true);
    setStatus("pending");
    // The backend replaces these with the pulse's client, business model, brand terms, competitors and intake
    const brandContext: BrandContextPayload = {
      brandName: ctxPulse?.client || siteInfo?.client || site,
      model: model ?? "B2C",
      namingConvention: "",
      demographics: "",
      markets: [],
      selectedPlatforms: ["seo"],
      industry: "",
      seo: { siteUrl: site, brandTerms: [], competitors: [], snippetExceptions: [] },
    };
    try {
      const { audit_id } = await apiClient.runSeoAudit(brandContext, {
        domain: site,
        n8n_audit_id: pulse.split("|")[0] || undefined,
        crawl_id: pulse.split("|")[1] || undefined,
      });
      pollRef.current = setInterval(() => poll(audit_id), 3000);
    } catch (e) {
      setRunning(false);
      setStatus(null);
      setError(e instanceof Error ? e.message : "Failed to start audit");
    }
  };

  useEffect(() => () => stopPolling(), []);

  const isActive = running || (status && POLLING_STATUSES.includes(status));

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border bg-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">SEO Audit</span>
        {status && (
          <Badge variant={status === "failed" ? "destructive" : "secondary"}>{STATUS_LABELS[status]}</Badge>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Site <span className="text-destructive">*</span></label>
        <select value={site} onChange={e => setSite(e.target.value)} disabled={!!isActive || !sites?.length} className={FIELD}>
          <option value="">{sites == null ? "Reading the sites in BigQuery…" : sites.length ? "— Choose a site —" : "No sites in BigQuery yet"}</option>
          {(sites ?? []).map(s => (
            <option key={s.site} value={s.site}>
              {s.client ? `${s.client} — ${s.site}` : s.site}{s.last_at ? ` (${day(s.last_at)})` : ""}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground">
          The sites with a run of the SEO pulse form or a Screaming Frog crawl in BigQuery (dataset seo_raw), latest first.
        </p>
      </div>
      {sitesError && <p className="text-[10px] text-destructive">Could not list the sites in BigQuery: {sitesError}</p>}

      {sources && (
        <div className="flex flex-col gap-2 rounded-md border px-2 py-2">
          <label className="text-xs font-medium">SEO pulse the audit runs on</label>
          {sources.pulses.length ? (
            <select value={pulse} onChange={e => setPulse(e.target.value)} disabled={!!isActive} className={FIELD}>
              {sources.pulses.map(p => (
                <option key={pulseKey(p)} value={pulseKey(p)}>
                  {day(p.at)} {time(p.at)} · {p.audit_id ? `${p.checks} (${p.n_metrics ?? 0} metrics)` : "crawl only"}
                  {p.crawl_id
                    ? ` · crawl of ${day(p.crawl_date)}, ${num(p.internal_html)} pages, JS rendering ${p.js_rendering ? "yes" : "no"}`
                    : " · no crawl uploaded: the latest crawl of the last 90 days"}
                </option>
              ))}
              <option value="">Latest crawl and metrics of the last 90 days</option>
            </select>
          ) : (
            <p className="text-xs text-muted-foreground">Nothing of {sources.site} in BigQuery yet: run the SEO pulse checks first.</p>
          )}
          <p className="text-[10px] text-muted-foreground">
            One pulse is one submit of the SEO pulse form: its checks and the crawl uploaded with it. The brand context of the
            audit (client, business model, brand terms, competitors, the answers under About the site) comes from that form.
          </p>
          {ctxPulse && (
            <p className="text-[10px] text-muted-foreground">
              From the pulse: {ctxPulse.client || site}, {model ?? "business model unknown"}; {intakeText(ctxPulse.intake)}.
              {ctxPulse.brand_terms.length || ctxPulse.competitors.length
                ? ` Brand terms ${ctxPulse.brand_terms.join(", ") || "none"}; competitors ${ctxPulse.competitors.join(", ") || "none"}.`
                : ""}
            </p>
          )}
          {sources.pulses.length > 0 && !model && (
            <p className="text-[10px] text-amber-700 dark:text-amber-400">
              {ctxPulse
                ? "This pulse has no business model (it ran before the form asked for it): the audit treats the site as B2C (structured data and external profiles). Run the SEO pulse form again to set it."
                : "No run of the SEO pulse form for this site, only a crawl: the audit treats the site as B2C and the intake is unknown."}
            </p>
          )}
          {(() => {
            const gsc = chosen ? chosen.search_console : sources.search_console;
            const from = chosen ? chosen.search_console_from : null;
            return (
              <p className={`text-[10px] ${gsc ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400"}`}>
                {gsc
                  ? from === "crawl"
                    ? "Search Console: the crawl ran with Screaming Frog connected to Search Console, so its Search Console issues count."
                    : "Search Console data of this site found: Search Console topics are measured."
                  : "No Search Console data (Screaming Frog was not connected to Search Console, no Search Console metrics in BigQuery): Index Coverage and Index Bloat are left out of the score, and the other Search Console topics use the sitemap fallback."}
              </p>
            );
          })()}
        </div>
      )}
      {sourcesError && <p className="text-[10px] text-destructive">Could not list the data in BigQuery: {sourcesError}</p>}

      {seoBackend === false && (
        <p className="text-xs text-muted-foreground rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1.5">
          The connected backend does not run SEO audits yet (it needs the SEO-feature branch). Use{" "}
          <span className="font-semibold">Demo</span> at the top to see a sample audit.
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Button onClick={handleRun} disabled={!!isActive || !site || !seoBackend || !sources?.pulses.length} className="w-full" size="sm">
        {isActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
        {isActive ? STATUS_LABELS[status!] : "Run SEO Audit"}
      </Button>
    </div>
  );
}
