import { platforms } from "@/data/auditData";
import { getTopStrategicWins, getTopWinPerPlatform, type PrioritizedItem } from "@/utils/roadmapLogic";
import type { BusinessModel } from "@/utils/brandContext";
import type { ManualScoreMap } from "@/utils/auditCriteria";
import { TrendingUp, Zap, Target, Search, Share2, MonitorPlay, ShoppingBag, Camera, Ghost, Tv, Briefcase } from "lucide-react";

interface Props {
  model: BusinessModel;
  manualScores: ManualScoreMap;
  selectedPlatformId: string | null;
}

const ICONS = [Zap, Target, TrendingUp];

const PLATFORM_BADGE: Record<string, { label: string; icon: typeof Search; color: string }> = {
  "sea-google": { label: "Google", icon: Search, color: "bg-blue-500/10 text-blue-600" },
  "meta": { label: "Meta", icon: Share2, color: "bg-indigo-500/10 text-indigo-600" },
  "linkedin": { label: "LinkedIn", icon: Briefcase, color: "bg-sky-600/10 text-sky-700" },
  "sea-bing": { label: "Bing", icon: MonitorPlay, color: "bg-teal-500/10 text-teal-600" },
  "dv360": { label: "DV360", icon: Tv, color: "bg-green-500/10 text-green-600" },
  "tiktok": { label: "TikTok", icon: Camera, color: "bg-pink-500/10 text-pink-600" },
  "pinterest": { label: "Pinterest", icon: ShoppingBag, color: "bg-red-500/10 text-red-600" },
  "snapchat": { label: "Snapchat", icon: Ghost, color: "bg-yellow-500/10 text-yellow-700" },
};

export default function StrategicWins({ model, manualScores, selectedPlatformId }: Props) {
  const targetPlatforms = selectedPlatformId
    ? platforms.filter(p => p.id === selectedPlatformId)
    : platforms;

  // Overview: one quick win per platform; Platform view: top 3 within that platform
  const wins = selectedPlatformId
    ? getTopStrategicWins(targetPlatforms, model, manualScores, 3)
    : getTopWinPerPlatform(targetPlatforms, model, manualScores);

  if (wins.length === 0) return null;

  return (
    <section className="opacity-0 animate-fade-up" style={{ animationDelay: "150ms" }}>
      <div className="flex flex-col gap-3">
        {wins.map((win, i) => (
          <WinCard key={`${win.platformId}-${win.category}-${win.topicId}`} win={win} index={i} />
        ))}
      </div>
    </section>
  );
}

function WinCard({ win, index }: { win: PrioritizedItem; index: number }) {
  const Icon = ICONS[index] || Zap;
  const badge = PLATFORM_BADGE[win.platformId];

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm p-3.5 flex flex-col gap-2 hover:border-primary/30 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
          {badge && (
            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${badge.color}`}>
              <badge.icon className="w-3 h-3" />
              {badge.label}
            </span>
          )}
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-score-excellent/10 text-score-excellent font-semibold">
          +{win.potentialIncrease}%
        </span>
      </div>

      <p className="text-xs font-semibold text-foreground leading-tight">{win.topic}</p>

      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span>{win.category}</span>
        <span>·</span>
        <span>Impact {win.impact} · Effort {win.effort}</span>
      </div>
    </div>
  );
}
