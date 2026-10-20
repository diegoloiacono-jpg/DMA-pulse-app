import { useEffect, useRef, useState } from "react";
import { Loader2, Play, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiClient, AuditState, AuditStatus, BrandContextPayload } from "@/lib/apiClient";
import { SavedContext } from "@/utils/savedContexts";

interface Props {
  brandContext: BrandContextPayload;
  savedContexts: SavedContext[];
  activeContextId: string | null;
  onSelectContext: (id: string | null) => void;
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

/** Host without scheme or path, as the backend matches it (www. is ignored there). */
const cleanDomain = (v: string) => v.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();

export default function SeoAuditRunner({ brandContext, savedContexts, activeContextId, onSelectContext, onSpecialistReady }: Props) {
  const [status, setStatus] = useState<AuditStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [domain, setDomain] = useState("");
  const [market, setMarket] = useState("");
  const [asOf, setAsOf] = useState("");
  const [maxAgeDays, setMaxAgeDays] = useState(90);
  // The first pulse usually runs without the client's Search Console
  const [searchConsole, setSearchConsole] = useState(false);
  // null = checking; false = this backend cannot run SEO audits (e.g. master, or no backend at all)
  const [seoBackend, setSeoBackend] = useState<boolean | null>(null);
  useEffect(() => {
    apiClient.seoSupport().then(setSeoBackend);
  }, []);

  // Follow the site URL of the selected client context
  const siteUrl = brandContext.seo?.siteUrl ?? "";
  useEffect(() => {
    if (siteUrl) setDomain(cleanDomain(siteUrl));
  }, [siteUrl]);

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
    if (!activeContextId) {
      setError("Select a client context before running the audit.");
      return;
    }
    if (!cleanDomain(domain)) {
      setError("Fill in the domain of the site, e.g. www.client.nl.");
      return;
    }
    setError(null);
    setRunning(true);
    setStatus("pending");
    try {
      const { audit_id } = await apiClient.runSeoAudit(
        { ...brandContext, selectedPlatforms: ["seo"] },
        {
          domain: cleanDomain(domain),
          market: market.trim().toUpperCase() || undefined,
          as_of: asOf || undefined,
          max_age_days: maxAgeDays,
          search_console: searchConsole,
        },
      );
      pollRef.current = setInterval(() => poll(audit_id), 3000);
    } catch (e) {
      setRunning(false);
      setStatus(null);
      setError(e instanceof Error ? e.message : "Failed to start audit");
    }
  };

  useEffect(() => () => stopPolling(), []);

  const isActive = running || (status && POLLING_STATUSES.includes(status));
  const contextSelected = !!activeContextId;

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border bg-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">SEO Audit</span>
        {status && (
          <Badge variant={status === "failed" ? "destructive" : "secondary"}>{STATUS_LABELS[status]}</Badge>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Domain <span className="text-destructive">*</span></label>
        <input
          type="text"
          value={domain}
          onChange={e => setDomain(e.target.value)}
          placeholder="www.client.nl"
          disabled={!!isActive}
          className={FIELD}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Market</label>
          <input
            type="text"
            value={market}
            onChange={e => setMarket(e.target.value)}
            placeholder="all"
            maxLength={2}
            disabled={!!isActive}
            className={`${FIELD} uppercase`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Data as of</label>
          <input
            type="date"
            value={asOf}
            onChange={e => setAsOf(e.target.value)}
            disabled={!!isActive}
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Max. age (days)</label>
          <input
            type="number"
            min={1}
            max={365}
            value={maxAgeDays}
            onChange={e => setMaxAgeDays(Math.max(1, Number(e.target.value) || 1))}
            disabled={!!isActive}
            className={FIELD}
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Reads the latest crawl and metrics of this site in BigQuery (dataset seo_raw) up to the chosen date,
        no older than the maximum age. Empty date = today; empty market = all markets of the site.
      </p>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={searchConsole}
          onChange={e => setSearchConsole(e.target.checked)}
          disabled={!!isActive}
          className="w-4 h-4 rounded border-input accent-primary"
        />
        <span className="text-xs text-foreground">Client's Search Console data is available</span>
      </label>
      <p className="text-[10px] text-muted-foreground -mt-2">
        Without it, Search Console topics use their Ahrefs or sitemap fallback, and Index Coverage and
        Index Bloat are reported as no data.
      </p>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">
          Client context <span className="text-destructive">*</span>
        </label>
        {savedContexts.length > 0 ? (
          <select
            value={activeContextId ?? ""}
            onChange={e => onSelectContext(e.target.value || null)}
            disabled={!!isActive}
            className={`${FIELD} ${contextSelected ? "" : "border-destructive/50"}`}
          >
            <option value="">— Select a client context —</option>
            {savedContexts.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-muted-foreground rounded-md border border-destructive/50 px-2 py-1.5">
            No saved client contexts yet — fill in the SEO Brand Context and click "Save Context", then select it here.
          </p>
        )}
      </div>

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

      <Button onClick={handleRun} disabled={!!isActive || !contextSelected || !seoBackend} className="w-full" size="sm">
        {isActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
        {isActive ? STATUS_LABELS[status!] : "Run SEO Audit"}
      </Button>
    </div>
  );
}
