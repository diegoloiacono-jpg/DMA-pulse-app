import { useEffect, useRef, useState } from "react";
import { Loader2, Play, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AccountInfo, apiClient, AuditState, AuditStatus, BrandContextPayload } from "@/lib/apiClient";
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
  extracting: "Pulling data from BigQuery…",
  specialist_running: "Platform Specialist Agent analysing…",
  specialist_review: "Ready for review",
  scoring_running: "Scoring Agent computing…",
  scoring_review: "Ready for scoring review",
  complete: "Complete",
  failed: "Failed",
};

const POLLING_STATUSES: AuditStatus[] = [
  "pending",
  "extracting",
  "specialist_running",
  "scoring_running",
];

export default function AuditRunner({ brandContext, savedContexts, activeContextId, onSelectContext, onSpecialistReady }: Props) {
  const [auditId, setAuditId] = useState<string | null>(null);
  const [status, setStatus] = useState<AuditStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [dataset, setDataset] = useState<string>("");
  const [availableDatasets, setAvailableDatasets] = useState<string[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);

  const [accountId, setAccountId] = useState<string>("");
  const [availableAccounts, setAvailableAccounts] = useState<AccountInfo[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  // Surfaced in the UI: a silent catch here previously made a broken accounts
  // query look identical to "no accounts", so every audit quietly ran against
  // the server-default account.
  const [accountsError, setAccountsError] = useState<string>("");

  // 30 days matches the window most scoring criteria assume (e.g. the ~30
  // conversions smart bidding needs to learn). The export now carries enough
  // history for this; it was temporarily lowered while the connector was new.
  const [lookbackDays, setLookbackDays] = useState<number>(30);

  useEffect(() => {
    apiClient.listDatasets()
      .then(r => setAvailableDatasets(r.datasets))
      .catch(() => {})
      .finally(() => setDatasetsLoading(false));
  }, []);

  useEffect(() => {
    if (!dataset) {
      setAvailableAccounts([]);
      setAccountId("");
      setAccountsError("");
      return;
    }
    setAccountsLoading(true);
    setAccountId("");
    setAccountsError("");
    apiClient.listAccounts(dataset)
      .then(r => {
        setAvailableAccounts(r.accounts);
        if (!r.accounts.length) {
          setAccountsError("No accounts with campaign data found in this dataset.");
        }
      })
      .catch(err => {
        setAvailableAccounts([]);
        setAccountsError(err instanceof Error ? err.message : "Could not load accounts.");
      })
      .finally(() => setAccountsLoading(false));
  }, [dataset]);

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
        if (state.status === "specialist_review") {
          onSpecialistReady(id, state);
        }
        if (state.status === "failed") {
          setError(state.error ?? "Unknown error");
        }
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
    setError(null);
    setRunning(true);
    setStatus("pending");
    try {
      const payload: BrandContextPayload = {
        ...brandContext,
        model: (brandContext.model || "B2B") as "B2B" | "B2C" | "D2C",
      };
      const { audit_id } = await apiClient.runAudit(
        payload,
        accountId || undefined,
        dataset.trim() || undefined,
        lookbackDays || undefined,
      );
      setAuditId(audit_id);
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
        <span className="text-sm font-semibold">BigQuery Audit</span>
        {status && (
          <Badge variant={status === "failed" ? "destructive" : "secondary"}>
            {STATUS_LABELS[status]}
          </Badge>
        )}
      </div>

      {/* Dataset + Account ID overrides */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">BQ dataset</label>
        <select
          value={dataset}
          onChange={e => setDataset(e.target.value)}
          disabled={!!isActive || datasetsLoading}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        >
          <option value="">{datasetsLoading ? "Loading…" : "— server default —"}</option>
          {availableDatasets.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Account</label>
        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          disabled={!!isActive || !dataset || accountsLoading}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        >
          <option value="">
            {!dataset ? "— pick a dataset first —" : accountsLoading ? "Loading…" : "— server default —"}
          </option>
          {availableAccounts.map(a => (
            <option key={a.account_id} value={a.account_id}>
              {a.account_name} ({a.account_id})
              {a.last_date ? ` — data to ${a.last_date}` : ""}
            </option>
          ))}
        </select>
        {accountsError && (
          <p className="text-xs text-destructive">{accountsError}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Lookback window (days)</label>
        <input
          type="number"
          min={1}
          max={365}
          value={lookbackDays}
          onChange={e => setLookbackDays(Math.max(1, Number(e.target.value) || 1))}
          disabled={!!isActive}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <p className="text-[10px] text-muted-foreground">
          30 days matches what most scoring criteria assume. The export currently holds history
          back to 2026-07-21, so longer windows will silently cover fewer days.
        </p>
      </div>

      {/* Client context — shared with the Brand Context card, so both stay in sync.
          Selecting one is mandatory: the specialist agent needs brand context to
          score anything meaningfully, so Run Audit stays disabled until a saved
          context is picked here. */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">
          Client context <span className="text-destructive">*</span>
        </label>
        {savedContexts.length > 0 ? (
          <select
            value={activeContextId ?? ""}
            onChange={e => onSelectContext(e.target.value || null)}
            disabled={!!isActive}
            className={`w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 ${
              contextSelected ? "border-input" : "border-destructive/50"
            }`}
          >
            <option value="">— Select a client context —</option>
            {savedContexts.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-muted-foreground rounded-md border border-destructive/50 px-2 py-1.5">
            No saved client contexts yet — fill in the Brand Context form and click "Save Context", then select it here.
          </p>
        )}
        {!contextSelected && (
          <p className="text-[10px] text-destructive">
            Select a client context above before running the audit.
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Button
        onClick={handleRun}
        disabled={!!isActive || !contextSelected}
        className="w-full"
        size="sm"
      >
        {isActive ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Play className="mr-2 h-4 w-4" />
        )}
        {isActive ? STATUS_LABELS[status!] : "Run Audit"}
      </Button>
    </div>
  );
}
