import { CheckCircle2, Circle, AlertTriangle, XCircle, Info, ArrowRight } from "lucide-react";
import { useDataScanner, type MetricState, type ScanWarning } from "@/hooks/useDataScanner";

interface Props {
  headers: string[];
  platformId: string;
  namingConvention: string;
  sampleCampaignNames: string[];
  onProceed: () => void;
}

const METRIC_LABELS: Record<string, string> = {
  campaignName: "Campaign Name",
  spend: "Spend / Cost",
  impressions: "Impressions",
  clicks: "Clicks / Interactions",
  conversions: "Conversions / Results",
  revenue: "Revenue / Conv. Value",
};

const STATE_ICON: Record<MetricState, typeof CheckCircle2> = {
  found: CheckCircle2,
  missing: AlertTriangle,
  pending: Circle,
};

export default function DiagnosticChecklist({ headers, platformId, namingConvention, sampleCampaignNames, onProceed }: Props) {
  const scan = useDataScanner(headers, platformId, namingConvention, sampleCampaignNames);

  if (!headers.length) return null;

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      {/* Progress bar */}
      <div className="h-1.5 bg-muted">
        <div
          className={`h-full rounded-r-full transition-all duration-700 ease-out ${
            scan.progressPercent === 100 ? "bg-score-excellent" : scan.progressPercent >= 60 ? "bg-score-good" : "bg-score-warning"
          }`}
          style={{ width: `${scan.progressPercent}%` }}
        />
      </div>

      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Ready to Audit — Diagnostic</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {scan.totalFound}/{scan.totalRequired} required metrics detected
          </p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-md font-semibold tabular-nums ${
          scan.progressPercent === 100
            ? "bg-score-excellent/10 text-score-excellent"
            : scan.progressPercent >= 60
            ? "bg-score-good/10 text-score-good"
            : "bg-score-warning/10 text-score-warning"
        }`}>
          {scan.progressPercent}%
        </span>
      </div>

      {/* Metric checklist */}
      <div className="px-5 py-3 space-y-1.5">
        {(["campaignName", "spend", "impressions", "clicks", "conversions", "revenue"] as const).map(key => {
          const state = scan.metricStatus[key];
          const Icon = STATE_ICON[state];
          const isRequired = key !== "revenue";
          return (
            <div key={key} className="flex items-center gap-2.5 py-1">
              <Icon className={`w-3.5 h-3.5 shrink-0 ${
                state === "found" ? "text-score-excellent"
                : state === "missing" ? (isRequired ? "text-score-warning" : "text-muted-foreground")
                : "text-muted-foreground/40"
              }`} />
              <span className={`text-xs ${state === "found" ? "text-foreground" : "text-muted-foreground"}`}>
                {METRIC_LABELS[key]}
              </span>
              {state === "found" && (
                <span className="text-[10px] text-score-excellent font-medium ml-auto">Found</span>
              )}
              {state === "missing" && !isRequired && (
                <span className="text-[10px] text-muted-foreground ml-auto">Optional</span>
              )}
              {state === "missing" && isRequired && (
                <span className="text-[10px] text-score-warning font-medium ml-auto">Missing</span>
              )}
            </div>
          );
        })}

        {/* Naming convention status */}
        {scan.metricStatus.namingConvention !== "pending" && (
          <div className="flex items-center gap-2.5 py-1 border-t border-border mt-2 pt-2">
            {scan.metricStatus.namingConvention === "valid" ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-score-excellent shrink-0" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-score-poor shrink-0" />
            )}
            <span className={`text-xs ${scan.metricStatus.namingConvention === "valid" ? "text-foreground" : "text-score-poor"}`}>
              Naming Convention
            </span>
            <span className={`text-[10px] font-medium ml-auto tabular-nums ${
              scan.metricStatus.namingConvention === "valid" ? "text-score-excellent" : "text-score-poor"
            }`}>
              {scan.metricStatus.namingMatchPercent}% match
            </span>
          </div>
        )}
      </div>

      {/* Warnings */}
      {scan.warnings.length > 0 && (
        <div className="px-5 pb-3 space-y-1.5">
          {scan.warnings.map((w, i) => (
            <WarningRow key={i} warning={w} />
          ))}
        </div>
      )}

      {/* Proceed button — never blocked */}
      <div className="px-5 py-3 border-t border-border bg-muted/20">
        <button
          onClick={onProceed}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold
                     hover:opacity-90 transition-opacity active:scale-[0.97] w-full justify-center"
        >
          <ArrowRight className="w-4 h-4" />
          {scan.progressPercent === 100 ? "View Full Audit Results" : "View Preliminary Results"}
        </button>
        {scan.progressPercent < 100 && (
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            Missing data won't block the audit — affected scores will be estimated
          </p>
        )}
      </div>
    </div>
  );
}

function WarningRow({ warning }: { warning: ScanWarning }) {
  const Icon = warning.type === "error" ? XCircle : warning.type === "warning" ? AlertTriangle : Info;
  const color = warning.type === "error" ? "text-score-poor" : warning.type === "warning" ? "text-score-warning" : "text-muted-foreground";

  return (
    <div className="flex items-start gap-2 text-[11px]">
      <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${color}`} />
      <span className="text-muted-foreground">{warning.message}</span>
    </div>
  );
}
