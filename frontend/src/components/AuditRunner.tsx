import { useEffect, useRef, useState } from "react";
import { Loader2, Play, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiClient, AuditState, AuditStatus, BrandContextPayload } from "@/lib/apiClient";

interface Props {
  brandContext: BrandContextPayload;
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

export default function AuditRunner({ brandContext, onSpecialistReady }: Props) {
  const [auditId, setAuditId] = useState<string | null>(null);
  const [status, setStatus] = useState<AuditStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setError(null);
    setRunning(true);
    setStatus("pending");
    try {
      const payload = {
        ...brandContext,
        model: (brandContext.model || "B2B") as "B2B" | "B2C" | "D2C",
      };
      const { audit_id } = await apiClient.runAudit(payload);
      setAuditId(audit_id);
      pollRef.current = setInterval(() => poll(audit_id), 3000);
    } catch (e) {
      setRunning(false);
      setStatus(null);
      setError(e instanceof Error ? e.message : "Failed to start audit");
    }
  };

  // Cleanup on unmount
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
