import { useState } from "react";
import { platforms, getMaturityColor, type Platform, type PlatformTopic } from "@/data/auditData";
import { AlertTriangle, ArrowRight, Check, ShieldCheck, ShieldAlert, Filter, Bot, UserCheck, Info, Download, Cpu } from "lucide-react";
import { toast } from "sonner";
import type { UnifiedRow } from "@/lib/metricBridge";
import { sortActionItems, getMarketTagStatus, type DashboardState } from "@/utils/dashboardLogic";
import type { BusinessModel } from "@/utils/brandContext";
import {
  type ManualScoreMap,
  type ManualScore,
  makeScoreKey,
  SCORE_LABELS,
  isAttestationRequired,
} from "@/utils/auditCriteria";
import { isConsultantRequired } from "@/components/PlatformDataGuide";
import {
  buildPrioritizedItems,
  filterByMode,
  type FilterMode,
  type PrioritizedItem,
} from "@/utils/roadmapLogic";
import type { InjectedAction } from "@/utils/aiAudit";
import EvidenceDrawer from "@/components/EvidenceDrawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  platform: Platform | null;
  businessModel?: BusinessModel;
  dashboardState?: DashboardState | null;
  manualScores?: ManualScoreMap;
  onScoreChange?: (key: string, score: ManualScore) => void;
  uploadedPlatforms?: string[];
  injectedActions?: InjectedAction[];
  allRows?: UnifiedRow[];
}

const platformKeyMap: Record<string, string[]> = {
  "sea-google": ["google"],
  "meta": ["meta"],
  "linkedin": ["linkedin"],
  "sea-bing": ["bing"],
  "pinterest": ["pinterest"],
  "tiktok": ["tiktok"],
  "snapchat": ["snapchat"],
  "dv360": ["google", "dv360"],
};

const FILTER_LABELS: Record<FilterMode, string> = {
  all: "All Items",
  "quick-wins": "Quick Wins",
  "big-bets": "Big Bets",
};

export default function AuditTable({
  platform,
  businessModel = "",
  dashboardState = null,
  manualScores = {},
  onScoreChange,
  uploadedPlatforms = [],
  injectedActions = [],
  allRows = [],
}: Props) {
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [showManualOnly, setShowManualOnly] = useState(false);
  const [evidenceItem, setEvidenceItem] = useState<PrioritizedItem | null>(null);
  const activePlatforms = platform ? [platform] : platforms;

  const hasDataForPlatform = (platformId: string) => {
    const keys = platformKeyMap[platformId] || [];
    return keys.some(k => uploadedPlatforms.includes(k));
  };

  // Build prioritized items + inject AI actions
  const allPrioritized = buildPrioritizedItems(activePlatforms, businessModel, manualScores);

  // Convert injected AI actions into PrioritizedItem format
  const aiItems: PrioritizedItem[] = injectedActions.map((a, idx) => ({
    topic: a.topic,
    category: a.category,
    platformId: platform?.id || "sea-google",
    platformName: platform?.shortName || "Google Ads",
    maturity: a.maturity as any,
    topicId: 9000 + idx,
    impact: 9,
    effort: 4,
    priorityScore: a.priority,
    potentialIncrease: 5,
    scores: {},
    details: "",
    action: a.action,
  }));

  const combined = [...aiItems, ...allPrioritized].sort((a, b) => b.priorityScore - a.priorityScore);
  const filtered = filterByMode(combined, filterMode);
  const afterManualFilter = showManualOnly
    ? filtered.filter(i => isAttestationRequired(i.topic, i.platformId) || isConsultantRequired(i.topic))
    : filtered;
  const displayIssues = platform ? afterManualFilter : afterManualFilter.slice(0, 50);

  // Count attestation
  const attestationCount = displayIssues.filter(i => isAttestationRequired(i.topic, i.platformId)).length;

  // Export CSV
  const handleExportCSV = () => {
    const headers = ["#", "Platform", "Category", "Topic", "Level", "Priority", "Impact", "Effort", "Score", "Reasoning"];
    const rows = displayIssues.map((item, idx) => {
      const scoreKey = makeScoreKey(item.platformId, item.category, item.topicId);
      const score = manualScores[scoreKey] ?? 0;
      const reasoning = item.action || item.details || (hasDataForPlatform(item.platformId) ? "Verified via data" : "Manually attested");
      return [idx + 1, item.platformName, item.category, item.topic, item.maturity, item.priorityScore, item.impact, item.effort, SCORE_LABELS[score as ManualScore], reasoning];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-summary-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
    <section className="opacity-0 animate-fade-up" style={{ animationDelay: "500ms" }}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-foreground">
          Priority Action Items
          <span className="ml-2 tabular-nums text-sm font-normal text-muted-foreground">
            ({filtered.length}{filterMode !== "all" ? ` of ${allPrioritized.length}` : ""} items
            {!platform && filtered.length > 50 ? `, showing top 50` : ""})
          </span>
          {businessModel && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
              Weighted: {businessModel}
            </span>
          )}
          {attestationCount > 0 && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-md bg-score-warning/10 text-score-warning font-medium">
              {attestationCount} manual
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors active:scale-[0.97] mr-2"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          {(["all", "quick-wins", "big-bets"] as FilterMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors active:scale-[0.97] ${
                filterMode === mode
                  ? mode === "quick-wins"
                    ? "border-score-excellent/40 bg-score-excellent/10 text-score-excellent"
                    : mode === "big-bets"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-foreground/20 bg-muted text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {FILTER_LABELS[mode]}
              {mode === "quick-wins" && <span className="ml-1 text-[10px] opacity-70">Effort&lt;4</span>}
              {mode === "big-bets" && <span className="ml-1 text-[10px] opacity-70">Impact&gt;8</span>}
            </button>
          ))}
          <button
            onClick={() => setShowManualOnly(v => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors active:scale-[0.97] ml-1 ${
              showManualOnly
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <UserCheck className="w-3 h-3 inline mr-1" />
            Manual Only
          </button>
        </div>
      </div>
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground text-[10px] w-6">#</th>
                {!platform && <th className="text-left py-2 px-3 font-medium text-muted-foreground text-[10px]">Platform</th>}
                <th className="text-left py-2 px-3 font-medium text-muted-foreground text-[10px]">Category</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground text-[10px]">Topic</th>
                <th className="text-center py-2 px-2 font-medium text-muted-foreground text-[10px] w-14">Level</th>
                
                <th className="text-center py-2 px-2 font-medium text-muted-foreground text-[10px] w-14">Source</th>
                <th className="text-center py-2 px-2 font-medium text-muted-foreground text-[10px] w-28">Status</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground text-[10px]">Action</th>
                <th className="text-center py-2 px-1 font-medium text-muted-foreground text-[10px] w-6"></th>
              </tr>
            </thead>
            <tbody>
              {displayIssues.map((issue, idx) => {
                const isAIInjected = issue.topicId >= 9000;
                const scoreKey = makeScoreKey(issue.platformId, issue.category, issue.topicId);
                const currentScore: ManualScore = manualScores[scoreKey] ?? 0;
                const needsAttestation = isAttestationRequired(issue.topic, issue.platformId);
                const hasData = hasDataForPlatform(issue.platformId);

                return (
                  <tr
                    key={`${issue.platformId}-${issue.category}-${issue.topicId}`}
                    className={`border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors ${
                      needsAttestation && currentScore === 0 ? "bg-score-warning/[0.03]" : ""
                    }`}
                  >
                    <td className="py-1.5 px-3 tabular-nums text-muted-foreground text-[10px]">{idx + 1}</td>
                    {!platform && <td className="py-1.5 px-3 text-foreground text-[10px] font-medium whitespace-nowrap">{issue.platformName}</td>}
                    <td className="py-1.5 px-3 text-foreground font-medium text-[10px] whitespace-nowrap">{issue.category}</td>
                    <td className="py-1.5 px-3 text-foreground text-[10px]">{issue.topic}</td>
                    <td className="py-1.5 px-2 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getMaturityColor(issue.maturity)}`}>
                        {issue.maturity}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      {isAIInjected ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary" title="AI-detected from campaign data">
                          <Bot className="w-3 h-3" />
                          AI
                        </span>
                      ) : needsAttestation || (isConsultantRequired(issue.topic) && !hasData) ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent/10 text-accent" title="Requires manual verification by a specialist">
                          <UserCheck className="w-3 h-3" />
                          Expert
                        </span>
                      ) : hasData ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-score-excellent/10 text-score-excellent" title="Verified automatically via data scanning">
                          <Cpu className="w-3 h-3" />
                          System
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-muted-foreground" title="Verified automatically via data scanning">
                          <Cpu className="w-3 h-3" />
                          System
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      <Select
                        value={String(currentScore)}
                        onValueChange={(val) => {
                          const newScore = Number(val) as ManualScore;
                          onScoreChange?.(scoreKey, newScore);
                          if (newScore > 0 && needsAttestation) {
                            toast.success("Maturity Updated by Expert", {
                              description: `${issue.topic} → ${SCORE_LABELS[newScore]}`,
                            });
                          }
                        }}
                      >
                        <SelectTrigger className={`h-6 text-[10px] w-full ${
                          currentScore === 3
                            ? "border-score-excellent/40 bg-score-excellent/10 text-score-excellent"
                            : currentScore === 2
                            ? "border-score-good/40 bg-score-good/10 text-score-good"
                            : currentScore === 1
                            ? "border-score-warning/40 bg-score-warning/10 text-score-warning"
                            : needsAttestation
                            ? "border-accent/40 bg-accent/10 text-accent animate-pulse"
                            : "border-border"
                        }`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {([0, 1, 2, 3] as ManualScore[]).map(s => (
                            <SelectItem key={s} value={String(s)} className="text-[10px]">
                              {s === 0 && needsAttestation ? "Not Verified" : SCORE_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-3 text-[10px] max-w-[200px]">
                      {issue.action ? (
                        <span className="flex items-start gap-1.5 text-foreground">
                          <ArrowRight className="w-3 h-3 mt-0.5 text-score-warning shrink-0" />
                          {issue.action}
                        </span>
                      ) : issue.details ? (
                        <span className="text-muted-foreground">{issue.details}</span>
                      ) : isConsultantRequired(issue.topic) && !hasData && currentScore === 0 ? (
                        <span className="flex items-center gap-1.5 text-accent-foreground">
                          <UserCheck className="w-3 h-3 shrink-0" />
                          Consultant input required
                        </span>
                      ) : needsAttestation && currentScore === 0 ? (
                        <span className="flex items-center gap-1.5 text-score-warning">
                          <ShieldAlert className="w-3 h-3 shrink-0" />
                          Verify manually
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <AlertTriangle className="w-3 h-3 text-score-poor shrink-0" />
                          Needs assessment
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-1 text-center">
                      <button
                        onClick={() => setEvidenceItem(issue)}
                        className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                        title="View evidence"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-3 flex items-center gap-4 flex-wrap">
        <span>Sorted by Priority Score (Impact² / Effort) • Source: DMA Global Edition</span>
        <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> System Verified</span>
        <span className="flex items-center gap-1"><UserCheck className="w-3 h-3 text-accent" /> Expert Verified</span>
      </p>
    </section>
    <EvidenceDrawer
      open={!!evidenceItem}
      onOpenChange={(open) => { if (!open) setEvidenceItem(null); }}
      item={evidenceItem}
      allRows={allRows}
    />
    </>
  );
}
