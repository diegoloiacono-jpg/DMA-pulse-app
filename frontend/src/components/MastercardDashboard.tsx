import { platforms, omnichannelScore, getScoreStatus, getChampionMet, getPlatformIssues, type Platform } from "@/data/auditData";
import ScoreRing from "./ScoreRing";
import RadarChart from "./RadarChart";
import type { DashboardState } from "@/utils/dashboardLogic";
import {
  type ManualScoreMap,
  hasManualScores,
  getCategoryScoresForRadar,
  getScoredCount,
  getConfidence,
  getDV360Warnings,
  type DV360Warning,
} from "@/utils/auditCriteria";
import type { UnifiedRow } from "@/lib/metricBridge";
import { analyzeAIReadiness, type AIAuditResult } from "@/utils/aiAudit";
import { AlertTriangle, Bot, Eye, Zap, ShieldAlert } from "lucide-react";

const statusLabel: Record<string, string> = {
  excellent: "Mature",
  good: "Progressing",
  warning: "Developing",
  poor: "Early Stage",
  critical: "Needs Attention",
};

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

interface Props {
  platform: Platform | null;
  uploadedPlatforms?: string[];
  dashboardState?: DashboardState | null;
  getPlatformLiveScore?: (p: Platform) => number;
  manualScores?: ManualScoreMap;
  allRows?: UnifiedRow[];
  businessModel?: string;
  compact?: boolean;
  radarOnly?: boolean;
  benchmarkScore?: number;
}

export default function MastercardDashboard({
  platform,
  uploadedPlatforms = [],
  dashboardState = null,
  getPlatformLiveScore,
  manualScores = {},
  allRows = [],
  businessModel = "",
  compact = false,
  radarOnly = false,
  benchmarkScore: benchmarkScoreProp = 50,
}: Props) {
  const isOmni = !platform;

  const hasUploadedData = (platformId: string) => {
    const keys = platformKeyMap[platformId] || [];
    return keys.some(k => uploadedPlatforms.includes(k));
  };

  // Use live score if available
  const score = isOmni
    ? (dashboardState
        ? Math.round(dashboardState.overallMaturity * 0.6 + omnichannelScore * 0.4)
        : omnichannelScore)
    : (getPlatformLiveScore ? getPlatformLiveScore(platform) : platform.weightedScore);

  const status = getScoreStatus(score);

  const totalIssues = isOmni
    ? platforms.reduce((s, p) => s + getPlatformIssues(p).length, 0)
    : getPlatformIssues(platform).length;

  const totalTopics = isOmni
    ? platforms.reduce((s, p) => s + p.totalTopics, 0)
    : platform.totalTopics;

  const championScore = isOmni
    ? Math.round(platforms.reduce((s, p) => s + getChampionMet(p), 0) / platforms.length)
    : getChampionMet(platform);

  const manualActive = hasManualScores(manualScores);

  // Confidence for current platform
  const confidence = !isOmni
    ? getConfidence(platform.id, hasUploadedData(platform.id), manualScores, platform)
    : null;

  // DV360 warnings
  const dv360Warnings: DV360Warning[] = (!isOmni && platform.id === "dv360" && allRows.length > 0)
    ? getDV360Warnings(allRows, businessModel as any)
    : [];

  // AI-Ready Audit (Google Ads only)
  const aiAudit: AIAuditResult | null = (!isOmni && platform.id === "sea-google" && allRows.length > 0)
    ? analyzeAIReadiness(allRows)
    : null;

  // Build radar data with live scores when available
  const radarCategories = isOmni
    ? platforms.map((p, i) => ({
        id: i,
        name: p.shortName,
        weight: 1,
        score: getPlatformLiveScore ? getPlatformLiveScore(p) : p.weightedScore,
        topics: [],
      }))
    : manualActive
      ? getCategoryScoresForRadar(platform, manualScores)
      : null;

  // Indices of platforms with no uploaded data (for graying out in radar)
  const omniNoDataIndices = isOmni
    ? platforms.map((p, i) => hasUploadedData(p.id) || (manualActive && getScoredCount(p, manualScores).scored > 0) ? -1 : i).filter(i => i !== -1)
    : [];

  // Indices of categories/platforms boosted by expert manual scores
  const expertVerifiedIndices = (() => {
    if (!manualActive) return [];
    if (isOmni) {
      return platforms.map((p, i) => getScoredCount(p, manualScores).scored > 0 ? i : -1).filter(i => i !== -1);
    }
    if (!platform) return [];
    return platform.categories.map((cat, i) => {
      const hasManual = cat.topics.some(t => {
        const key = `${platform.id}::${cat.name}::${t.id}`;
        return (manualScores[key] ?? 0) > 0;
      });
      return hasManual ? i : -1;
    }).filter(i => i !== -1);
  })();

  // Blended score label
  const getScoreLabel = () => {
    if (!isOmni && manualActive && hasUploadedData(platform.id)) {
      return "50% data + 50% consultant";
    }
    if (!isOmni && manualActive) {
      return "Consultant-verified";
    }
    if (dashboardState && isOmni) {
      return "60% data consistency + 40% audit baseline";
    }
    if (aiAudit?.hasVBB) {
      return `VBB Active (+${aiAudit.vbbBoost}% strategic boost)`;
    }
    return undefined;
  };

  // ── Radar-only mode: just the chart, no cards ──
  if (radarOnly) {
    if (isOmni && radarCategories) {
      return (
        <div className="w-full">
          <RadarChart
            categories={radarCategories}
            label="Omnichannel"
            showBenchmark={manualActive}
            benchmarkScore={benchmarkScoreProp}
            noDataIndices={omniNoDataIndices}
            expertVerifiedIndices={expertVerifiedIndices}
          />
        </div>
      );
    }
    if (!isOmni) {
      const cats = manualActive && radarCategories ? radarCategories : platform.categories;
      return (
        <div className="w-full">
          <RadarChart
            categories={cats}
            label={platform.shortName}
            showBenchmark={manualActive}
            benchmarkScore={benchmarkScoreProp}
            confidence={confidence?.level}
            expertVerifiedIndices={expertVerifiedIndices}
          />
        </div>
      );
    }
  }

  return (
    <section className="opacity-0 animate-fade-up" style={{ animationDelay: "100ms" }}>
      {/* DV360 Warnings */}
      {dv360Warnings.length > 0 && (
        <div className="mb-4 space-y-2">
          {dv360Warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-lg border border-score-poor/30 bg-score-poor/5">
              <AlertTriangle className="w-4 h-4 text-score-poor shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-score-poor">{w.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{w.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Audit Warnings (Google Ads) */}
      {aiAudit && aiAudit.warnings.length > 0 && (
        <div className="mb-4 space-y-2">
          {aiAudit.warnings.map((w, i) => {
            const isCritical = w.type === "critical";
            const isInfo = w.type === "info";
            const Icon = isCritical ? ShieldAlert : isInfo ? Zap : AlertTriangle;
            return (
              <div
                key={i}
                className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${
                  isCritical ? "border-score-poor/30 bg-score-poor/5"
                  : isInfo ? "border-score-excellent/30 bg-score-excellent/5"
                  : "border-score-warning/30 bg-score-warning/5"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${
                  isCritical ? "text-score-poor" : isInfo ? "text-score-excellent" : "text-score-warning"
                }`} />
                <div>
                  <p className={`text-sm font-semibold ${
                    isCritical ? "text-score-poor" : isInfo ? "text-score-excellent" : "text-score-warning"
                  }`}>{w.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{w.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Visibility Score Bar (Google Ads) */}
      {aiAudit && aiAudit.totalGoogleCampaigns > 0 && (
        <div className="mb-4 bg-card rounded-xl border border-border shadow-sm p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Eye className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">AI Visibility Score</p>
              <p className="text-[10px] text-muted-foreground">
                {aiAudit.visibilityScore}% of spend through PMax/Smart campaigns
              </p>
            </div>
            <span className={`ml-auto text-xs px-2.5 py-1 rounded-md font-semibold ${
              aiAudit.aiRelianceLevel === "critical" ? "bg-score-poor/10 text-score-poor"
              : aiAudit.aiRelianceLevel === "high" ? "bg-score-warning/10 text-score-warning"
              : aiAudit.aiRelianceLevel === "medium" ? "bg-score-good/10 text-score-good"
              : "bg-muted text-muted-foreground"
            }`}>
              {aiAudit.aiRelianceLevel === "critical" ? "Critical"
              : aiAudit.aiRelianceLevel === "high" ? "High"
              : aiAudit.aiRelianceLevel === "medium" ? "Medium"
              : "Low"} AI Reliance
            </span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                aiAudit.aiRelianceLevel === "critical" ? "bg-score-poor"
                : aiAudit.aiRelianceLevel === "high" ? "bg-score-warning"
                : "bg-score-good"
              }`}
              style={{ width: `${aiAudit.visibilityScore}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>{aiAudit.pmaxCampaignCount} PMax · {aiAudit.smartCampaignCount} Smart</span>
            <span>{aiAudit.totalGoogleCampaigns} total campaigns</span>
          </div>
          {/* Bid Strategy Breakdown */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {Object.entries(aiAudit.bidStrategies)
              .filter(([s]) => s !== "unknown")
              .sort((a, b) => b[1] - a[1])
              .map(([strategy, count]) => (
                <span key={strategy} className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                  {strategy} ({count})
                </span>
              ))}
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 ${compact ? "lg:grid-cols-2" : "lg:grid-cols-12"} gap-3`}>
        {/* Main Score */}
        <div className={`${compact ? "" : "lg:col-span-4"} bg-card rounded-xl ${compact ? "p-3" : "p-4"} shadow-sm border border-border flex flex-col items-center justify-center gap-1.5`}>
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {isOmni ? "Omnichannel Maturity" : `${platform.shortName} Maturity`}
          </span>
          <ScoreRing score={score} size={compact ? 72 : 112} strokeWidth={compact ? 6 : 10} delay={200} />
          <div className="text-center mt-2">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold score-bg-${status} score-text-${status}`}>
              {statusLabel[status]}
            </span>
            {getScoreLabel() && (
              <p className="text-[10px] text-muted-foreground mt-2">
                Blended: {getScoreLabel()}
              </p>
            )}
            {confidence && confidence.level !== "none" && (
              <p className={`text-[10px] mt-1 font-medium ${
                confidence.level === "high" ? "text-score-excellent"
                : confidence.level === "medium" ? "text-score-warning"
                : "text-score-poor"
              }`}>
                {confidence.label}
              </p>
            )}
          </div>
        </div>

        {/* Middle card */}
        <div className={`${compact ? "" : "lg:col-span-4"} bg-card rounded-xl ${compact ? "p-3" : "p-4"} shadow-sm border border-border flex flex-col justify-between gap-1.5`}>
          {isOmni ? (
            <>
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Platform Maturity Radar
              </span>
              <RadarChart
                categories={radarCategories!}
                label="Omnichannel"
                showBenchmark={false}
                noDataIndices={omniNoDataIndices}
                expertVerifiedIndices={expertVerifiedIndices}
              />
            </>
          ) : manualActive && radarCategories ? (
            <>
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Audit Radar
              </span>
              <RadarChart
                categories={radarCategories}
                label={platform.shortName}
                showBenchmark
                benchmarkScore={50}
                confidence={confidence?.level}
                expertVerifiedIndices={expertVerifiedIndices}
              />
              {(() => {
                const { scored, total } = getScoredCount(platform, manualScores);
                return (
                  <p className="text-[10px] text-muted-foreground text-center">
                    {scored}/{total} topics scored
                  </p>
                );
              })()}
            </>
          ) : (
            <>
              <div>
                <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Champion Criteria Met
                </span>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className={`tabular-nums font-mono text-4xl font-bold score-text-${getScoreStatus(championScore)}`}>
                    {championScore}%
                  </span>
                  <span className="text-sm text-muted-foreground">of Champion topics achieved</span>
                </div>
              </div>
              <div className="border-t border-border pt-4 grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">Topics Passed</span>
                  <p className="tabular-nums font-mono text-xl font-bold text-foreground">
                    {totalTopics - totalIssues}
                    <span className="text-sm font-normal text-muted-foreground"> / {totalTopics}</span>
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Action Items</span>
                  <p className="tabular-nums font-mono text-xl font-bold score-text-warning">{totalIssues}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Platform Split or Radar Chart */}
        {!compact && <div className="lg:col-span-4 bg-card rounded-xl p-4 shadow-sm border border-border flex flex-col gap-2 overflow-hidden">
          {isOmni ? (
            <>
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Platform Health
              </span>
              <div className="flex flex-col gap-3 overflow-y-auto max-h-[280px] pr-1">
                {platforms.map((p, i) => {
                  const liveScore = getPlatformLiveScore ? getPlatformLiveScore(p) : p.weightedScore;
                  const hasData = hasUploadedData(p.id);
                  const keys = platformKeyMap[p.id] || [];
                  const cs = dashboardState
                    ? keys.map(k => dashboardState.consistencyScores[k]).filter(Boolean)
                    : [];
                  const consistencyLabel = cs.length > 0
                    ? `${cs[0].matchingCampaigns}/${cs[0].totalCampaigns} naming match`
                    : undefined;

                  // Show manual scoring progress
                  const { scored, total } = getScoredCount(p, manualScores);
                  const manualLabel = scored > 0 ? `${scored}/${total} assessed` : undefined;

                  return (
                    <PlatformBar
                      key={p.id}
                      label={p.shortName}
                      score={liveScore}
                      topics={p.totalTopics}
                      delay={300 + i * 60}
                      needsReview={!hasData && scored === 0}
                      consistencyLabel={consistencyLabel}
                      manualLabel={manualLabel}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Category Breakdown
              </span>
              <RadarChart
                categories={platform.categories}
                label={platform.shortName}
                confidence={confidence?.level}
                expertVerifiedIndices={expertVerifiedIndices}
              />
            </>
          )}
        </div>}
      </div>
    </section>
  );
}

function PlatformBar({ label, score, topics, delay, needsReview = false, consistencyLabel, manualLabel }: {
  label: string; score: number; topics: number; delay: number; needsReview?: boolean; consistencyLabel?: string; manualLabel?: string;
}) {
  const status = getScoreStatus(score);
  return (
    <div className="opacity-0 animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {needsReview && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold leading-none">
              Data needs review
            </span>
          )}
          {consistencyLabel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-score-good/10 text-score-good font-semibold leading-none">
              {consistencyLabel}
            </span>
          )}
          {manualLabel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold leading-none">
              {manualLabel}
            </span>
          )}
        </div>
        <span className={`tabular-nums font-mono text-xs font-semibold score-text-${status}`}>
          {score}%
          <span className="text-muted-foreground font-normal ml-1">({topics})</span>
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-score-${status}`}
          style={{
            width: `${Math.max(score, 1)}%`,
            transition: "width 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>
    </div>
  );
}
