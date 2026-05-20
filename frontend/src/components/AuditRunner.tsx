import { useEffect, useRef, useState } from "react";
import { Loader2, Play, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiClient, AuditState, AuditStatus, BrandContextPayload } from "@/lib/apiClient";
import { BrandContext } from "@/utils/brandContext";
import { listSavedContexts, SavedContext } from "@/utils/savedContexts";

interface Props {
  brandContext: BrandContextPayload;
  onSpecialistReady: (auditId: string, state: AuditState) => void;
  onLoadContext?: (ctx: BrandContext) => void;
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

export default function AuditRunner({ brandContext, onSpecialistReady, onLoadContext }: Props) {
  const [auditId, setAuditId] = useState<string | null>(null);
  const [status, setStatus] = useState<AuditStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [savedContexts, setSavedContexts] = useState<SavedContext[]>([]);
  const [selectedContextId, setSelectedContextId] = useState<string>("");
  const [dataset, setDataset] = useState<string>("");
  const [availableDatasets, setAvailableDatasets] = useState<string[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);

  useEffect(() => {
    setSavedContexts(listSavedContexts());
    apiClient.listDatasets()
      .then(r => setAvailableDatasets(r.datasets))
      .catch(() => {})
      .finally(() => setDatasetsLoading(false));
  }, []);

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

  const handleContextSelect = (id: string) => {
    setSelectedContextId(id);
    if (!id) return;
    const entry = savedContexts.find(s => s.id === id);
    if (entry && onLoadContext) {
      onLoadContext(entry.context);
    }
  };

  const handleRun = async () => {
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
        undefined,
        dataset.trim() || undefined,
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

      {/* Client context selector */}
      {savedContexts.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Client context</label>
          <select
            value={selectedContextId}
            onChange={e => handleContextSelect(e.target.value)}
            disabled={!!isActive}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          >
            <option value="">— Use current form context —</option>
            {savedContexts.map(s => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

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

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Button
        onClick={handleRun}
        disabled={!!isActive}
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
