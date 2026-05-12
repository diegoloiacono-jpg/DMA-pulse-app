import { useState, useMemo } from "react";
import { platforms, getScoreStatus, getMaturityColor, type Platform, type PlatformCategory, type PlatformTopic } from "@/data/auditData";
import { ChevronDown, Check, X, Minus, ArrowRight, Cpu, UserCheck, Bot, ShieldAlert, AlertTriangle, Info } from "lucide-react";
import {
  type ManualScoreMap,
  type ManualScore,
  makeScoreKey,
  getCategoryPassRate,
  isAttestationRequired,
  SCORE_LABELS,
} from "@/utils/auditCriteria";
import type { BusinessModel } from "@/utils/brandContext";
import type { DashboardState } from "@/utils/dashboardLogic";
import type { UnifiedRow } from "@/lib/metricBridge";
import type { InjectedAction } from "@/utils/aiAudit";
import { buildPrioritizedItems, type PrioritizedItem } from "@/utils/roadmapLogic";
import { isConsultantRequired } from "@/components/PlatformDataGuide";
import EvidenceDrawer from "@/components/EvidenceDrawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  platform: Platform | null;
  manualScores?: ManualScoreMap;
  businessModel?: BusinessModel;
  dashboardState?: DashboardState | null;
  uploadedPlatforms?: string[];
  onScoreChange?: (key: string, score: ManualScore) => void;
  injectedActions?: InjectedAction[];
  allRows?: UnifiedRow[];
  onScrollToAction?: (topicName: string) => void;
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

function isTopicPassed(t: PlatformTopic, platformId: string, categoryName: string, manualScores?: ManualScoreMap): boolean {
  if (manualScores) {
    const key = makeScoreKey(platformId, categoryName, t.id);
    const s = manualScores[key];
    if (s !== undefined) return s >= 2;
  }
  const vals = Object.values(t.scores).filter(v => v !== null);
  return vals.length > 0 && vals.every(v => v);
}

function isTopicFailed(t: PlatformTopic, platformId: string, categoryName: string, manualScores?: ManualScoreMap): boolean {
  if (manualScores) {
    const key = makeScoreKey(platformId, categoryName, t.id);
    const s = manualScores[key];
    if (s !== undefined) return s < 2;
  }
  return Object.values(t.scores).filter(v => v !== null).some(v => !v);
}

export default function CategoryBreakdown({
  platform,
  manualScores = {},
  businessModel = "",
  dashboardState = null,
  uploadedPlatforms = [],
  onScoreChange,
  injectedActions = [],
  allRows = [],
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [evidenceItem, setEvidenceItem] = useState<PrioritizedItem | null>(null);

  const categories = platform ? platform.categories : mergeCategories(platforms);
  const platformId = platform?.id ?? "omni";

  const hasDataForPlatform = (pid: string) => {
    const keys = platformKeyMap[pid] || [];
    return keys.some(k => uploadedPlatforms.includes(k));
  };

  // Build prioritized items map: topicId -> PrioritizedItem
  const priorityMap = useMemo(() => {
    if (!platform) return new Map<number, PrioritizedItem>();
    const items = buildPrioritizedItems([platform], businessModel, manualScores);
    const aiItems: PrioritizedItem[] = injectedActions.map((a, idx) => ({
      topic: a.topic,
      category: a.category,
      platformId: platform.id,
      platformName: platform.shortName,
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
    const map = new Map<number, PrioritizedItem>();
    [...aiItems, ...items].forEach(it => {
      if (!map.has(it.topicId)) map.set(it.topicId, it);
    });
    return map;
  }, [platform, businessModel, manualScores, injectedActions]);

  return (
    <>
      <section>
        <div className="grid grid-cols-1 gap-1.5">
          {categories.map((cat, idx) => {
            const key = `${platformId}-${cat.name}`;
            return (
              <CategoryCard
                key={key}
                category={cat}
                platformId={platformId}
                index={idx}
                isExpanded={expanded === key}
                onToggle={() => setExpanded(expanded === key ? null : key)}
                manualScores={manualScores}
                onScoreChange={onScoreChange}
                priorityMap={priorityMap}
                hasData={hasDataForPlatform(platformId)}
                onEvidence={setEvidenceItem}
              />
            );
          })}
        </div>
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

function mergeCategories(plats: Platform[]): PlatformCategory[] {
  const map = new Map<string, { totalScore: number; count: number; totalTopics: number }>();
  for (const p of plats) {
    for (const c of p.categories) {
      const existing = map.get(c.name) ?? { totalScore: 0, count: 0, totalTopics: 0 };
      existing.totalScore += c.score;
      existing.count++;
      existing.totalTopics += c.topics.length;
      map.set(c.name, existing);
    }
  }
  let id = 0;
  return Array.from(map.entries()).map(([name, d]) => ({
    id: ++id,
    name,
    weight: 100,
    score: Math.round(d.totalScore / d.count),
    topics: [],
  }));
}

function CategoryCard({
  category, platformId, index, isExpanded, onToggle,
  manualScores, onScoreChange, priorityMap, hasData, onEvidence,
}: {
  category: PlatformCategory;
  platformId: string;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  manualScores: ManualScoreMap;
  onScoreChange?: (key: string, score: ManualScore) => void;
  priorityMap: Map<number, PrioritizedItem>;
  hasData: boolean;
  onEvidence: (item: PrioritizedItem) => void;
}) {
  const pct = getCategoryPassRate(platformId, category, manualScores ?? {});
  const passed = category.topics.filter(t => isTopicPassed(t, platformId, category.name, manualScores)).length;
  const total = category.topics.length;
  const status = getScoreStatus(pct);

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/20 transition-colors active:scale-[0.998]"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className={`tabular-nums font-mono text-base font-bold score-text-${status} shrink-0`}>
            {pct}%
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground truncate">{category.name}</span>
              {total > 0 && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {passed}/{total} passed
                </span>
              )}
            </div>
            {total > 0 && (
              <div className="w-full h-1.5 bg-muted/40 rounded-full mt-1 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    pct >= 60 ? "bg-score-excellent" : pct >= 40 ? "bg-score-good" : pct >= 20 ? "bg-score-warning" : "bg-score-poor"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        </div>
        {total > 0 && (
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ml-2 ${isExpanded ? "rotate-180" : ""}`} />
        )}
      </button>

      {isExpanded && total > 0 && (
        <div className="border-t border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="text-left py-1.5 px-3 font-medium text-muted-foreground">Topic</th>
                <th className="text-center py-1.5 px-2 font-medium text-muted-foreground w-12">Status</th>
                <th className="text-center py-1.5 px-2 font-medium text-muted-foreground w-16">Level</th>
                <th className="text-center py-1.5 px-2 font-medium text-muted-foreground w-14">Source</th>
                <th className="text-center py-1.5 px-2 font-medium text-muted-foreground w-28">Verify</th>
                <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Action</th>
                <th className="text-center py-1.5 px-1 w-6"></th>
              </tr>
            </thead>
            <tbody>
              {category.topics.map(t => {
                const passed = isTopicPassed(t, platformId, category.name, manualScores);
                const failed = isTopicFailed(t, platformId, category.name, manualScores);
                const scoreKey = makeScoreKey(platformId, category.name, t.id);
                const currentScore: ManualScore = manualScores[scoreKey] ?? 0;
                const needsAttestation = isAttestationRequired(t.topic, platformId);
                const consultantReq = isConsultantRequired(t.topic);
                const priority = priorityMap.get(t.id);
                const isAI = priority && priority.topicId >= 9000;

                return (
                  <tr key={t.id} className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors">
                    <td className="py-1.5 px-3 text-foreground text-[11px] leading-tight max-w-[180px]">
                      {t.topic}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      {passed ? <Check className="w-3.5 h-3.5 text-score-excellent mx-auto" />
                        : failed ? <X className="w-3.5 h-3.5 text-score-poor mx-auto" />
                        : <Minus className="w-3.5 h-3.5 text-muted-foreground/40 mx-auto" />}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getMaturityColor(t.maturity)}`}>
                        {t.maturity}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      {isAI ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary" title="AI-detected from data">
                          <Bot className="w-3 h-3" />AI
                        </span>
                      ) : needsAttestation || (consultantReq && !hasData) ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent/10 text-accent" title="Requires expert verification">
                          <UserCheck className="w-3 h-3" />Expert
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${hasData ? "bg-score-excellent/10 text-score-excellent" : "text-muted-foreground"}`} title="System verified">
                          <Cpu className="w-3 h-3" />System
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      {onScoreChange ? (
                        <Select
                          value={String(currentScore)}
                          onValueChange={(val) => {
                            const newScore = Number(val) as ManualScore;
                            onScoreChange(scoreKey, newScore);
                            if (newScore > 0 && needsAttestation) {
                              toast.success("Maturity Updated by Expert", {
                                description: `${t.topic} → ${SCORE_LABELS[newScore]}`,
                              });
                            }
                          }}
                        >
                          <SelectTrigger className={`h-6 text-[10px] w-full ${
                            currentScore === 3 ? "border-score-excellent/40 bg-score-excellent/10 text-score-excellent"
                            : currentScore === 2 ? "border-score-good/40 bg-score-good/10 text-score-good"
                            : currentScore === 1 ? "border-score-warning/40 bg-score-warning/10 text-score-warning"
                            : needsAttestation ? "border-accent/40 bg-accent/10 text-accent animate-pulse"
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
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-[10px] max-w-[260px]">
                      {priority?.action ? (
                        <span className="flex items-start gap-1.5 text-foreground">
                          <ArrowRight className="w-3 h-3 mt-0.5 text-score-warning shrink-0" />
                          {priority.action}
                        </span>
                      ) : t.action ? (
                        <span className="flex items-start gap-1.5 text-foreground">
                          <ArrowRight className="w-3 h-3 mt-0.5 text-score-warning shrink-0" />
                          {t.action}
                        </span>
                      ) : consultantReq && !hasData && currentScore === 0 ? (
                        <span className="flex items-center gap-1.5 text-accent-foreground">
                          <UserCheck className="w-3 h-3 shrink-0" />Consultant input required
                        </span>
                      ) : needsAttestation && currentScore === 0 ? (
                        <span className="flex items-center gap-1.5 text-score-warning">
                          <ShieldAlert className="w-3 h-3 shrink-0" />Verify manually
                        </span>
                      ) : failed ? (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <AlertTriangle className="w-3 h-3 text-score-poor shrink-0" />Needs assessment
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-1 text-center">
                      {priority && (
                        <button
                          onClick={() => onEvidence(priority)}
                          className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          title="View evidence"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
