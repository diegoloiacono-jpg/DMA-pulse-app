import { platforms, getPlatformIssues, type Platform } from "@/data/auditData";
import { Search, Share2, Monitor, ArrowRight, AlertTriangle, TrendingUp } from "lucide-react";
import type { ManualScoreMap } from "@/utils/auditCriteria";
import type { BusinessModel } from "@/utils/brandContext";
import { getTopStrategicWins } from "@/utils/roadmapLogic";

interface Props {
  getPlatformLiveScore: (p: Platform) => number;
  manualScores: ManualScoreMap;
  businessModel: BusinessModel;
  onSelectPlatform: (platformId: string) => void;
  emptyState?: boolean;
}

const CHANNEL_GROUPS: {
  label: string;
  icon: typeof Search;
  platformIds: string[];
  b2bHighlight?: string;
}[] = [
  {
    label: "Search",
    icon: Search,
    platformIds: ["sea-google", "sea-bing"],
    b2bHighlight: "Lead Quality",
  },
  {
    label: "Social",
    icon: Share2,
    platformIds: ["meta", "linkedin", "pinterest", "tiktok", "snapchat"],
    b2bHighlight: "Lead Leakage",
  },
  {
    label: "Programmatic",
    icon: Monitor,
    platformIds: ["dv360"],
    b2bHighlight: "Audience Precision",
  },
];

export default function PlatformMaturityGrid({
  getPlatformLiveScore,
  manualScores,
  businessModel,
  onSelectPlatform,
  emptyState = false,
}: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {CHANNEL_GROUPS.map((group) => {
        const Icon = group.icon;
        const groupPlatforms = platforms.filter((p) =>
          group.platformIds.includes(p.id)
        );

        // Weighted average score for group
        const avgScore = emptyState
          ? 0
          : groupPlatforms.length > 0
            ? Math.round(
                groupPlatforms.reduce(
                  (s, p) => s + getPlatformLiveScore(p),
                  0
                ) / groupPlatforms.length
              )
            : 0;

        const scoreStatus =
          avgScore >= 75
            ? "excellent"
            : avgScore >= 55
            ? "good"
            : avgScore >= 35
            ? "warning"
            : "poor";

        return (
          <div
            key={group.label}
            className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
          >
            {/* Group Header */}
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-secondary" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  {group.label}
                </span>
              </div>
              <span
                className={`text-lg font-bold tabular-nums ${emptyState ? "text-muted-foreground/40" : `score-text-${scoreStatus}`}`}
              >
                {emptyState ? "—" : `${avgScore}%`}
              </span>
            </div>

            {/* Platform Cards */}
            <div className="divide-y divide-border/30">
              {groupPlatforms.map((p) => {
                const score = emptyState ? 0 : getPlatformLiveScore(p);
                const status =
                  score >= 75
                    ? "excellent"
                    : score >= 55
                    ? "good"
                    : score >= 35
                    ? "warning"
                    : "poor";

                // Top gap
                const issues = emptyState ? [] : getPlatformIssues(p);
                const topGap =
                  issues.length > 0 ? issues[0].topic : "No critical gaps";

                // Quick win
                const wins = emptyState
                  ? []
                  : getTopStrategicWins([p], businessModel, manualScores, 1);
                const quickWin = wins.length > 0 ? wins[0].topic : null;

                return (
                  <button
                    key={p.id}
                    onClick={() => onSelectPlatform(p.id)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold text-foreground">
                        {p.shortName}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-bold tabular-nums ${emptyState ? "text-muted-foreground/40" : `score-text-${status}`}`}
                        >
                          {emptyState ? "—" : `${score}%`}
                        </span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                      {!emptyState && (
                        <div
                          className={`h-full rounded-full transition-all duration-700 bg-score-${status}`}
                          style={{ width: `${score}%` }}
                        />
                      )}
                    </div>

                    {emptyState ? (
                      <div className="text-[10px] text-muted-foreground/60 leading-tight italic">
                        Upload data to surface gaps & quick wins
                      </div>
                    ) : (
                      <>
                        {/* Top gap */}
                        <div className="flex items-start gap-1.5 mb-1">
                          <AlertTriangle className="w-3 h-3 text-score-warning shrink-0 mt-0.5" />
                          <span className="text-[10px] text-muted-foreground leading-tight line-clamp-1">
                            {topGap}
                          </span>
                        </div>

                        {/* Quick win */}
                        {quickWin && (
                          <div className="flex items-start gap-1.5">
                            <TrendingUp className="w-3 h-3 text-score-excellent shrink-0 mt-0.5" />
                            <span className="text-[10px] text-score-excellent leading-tight line-clamp-1">
                              {quickWin}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            {/* B2B Contextual Highlight */}
            {businessModel === "B2B" && group.b2bHighlight && (
              <div className="px-4 py-2 bg-accent/5 border-t border-border/30">
                <span className="text-[10px] font-medium text-accent">
                  B2B Focus: {group.b2bHighlight}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
