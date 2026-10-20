import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Globe, TrendingUp } from "lucide-react";
import { loadSeoSummary } from "@/utils/seoSummary";
import { SEO_PLATFORM_LABEL } from "@/data/seoPulse";

/** Organic group of the Platform Maturity Breakdown: the last SEO audit, and the way into the SEO tab. */
export default function OrganicGroupCard() {
  const summary = useMemo(() => loadSeoSummary(), []);
  const score = summary?.platformScore ?? null;
  const status = score == null ? null : score >= 75 ? "excellent" : score >= 55 ? "good" : score >= 35 ? "warning" : "poor";

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-secondary/10 flex items-center justify-center">
            <Globe className="w-3.5 h-3.5 text-secondary" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Organic</span>
        </div>
        <span className={`text-lg font-bold tabular-nums ${status ? `score-text-${status}` : "text-muted-foreground/40"}`}>
          {score == null ? "—" : `${score}%`}
        </span>
      </div>

      <Link to="/seo" className="block w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors group">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-semibold text-foreground">{SEO_PLATFORM_LABEL}</span>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold tabular-nums ${status ? `score-text-${status}` : "text-muted-foreground/40"}`}>
              {score == null ? "—" : `${score}%`}
            </span>
            <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
          {score != null && (
            <div className={`h-full rounded-full transition-all duration-700 bg-score-${status}`} style={{ width: `${score}%` }} />
          )}
        </div>
        {summary ? (
          <>
            <div className="text-[10px] text-muted-foreground leading-tight mb-1 line-clamp-1">
              {summary.maturityText} · {summary.brandName || summary.domain}
            </div>
            {summary.topWin && (
              <div className="flex items-start gap-1.5">
                <TrendingUp className="w-3 h-3 text-score-excellent shrink-0 mt-0.5" />
                <span className="text-[10px] text-score-excellent leading-tight line-clamp-1">{summary.topWin}</span>
              </div>
            )}
          </>
        ) : (
          <div className="text-[10px] text-muted-foreground/60 leading-tight italic">
            Run an SEO audit in the SEO tab to surface gaps & quick wins
          </div>
        )}
      </Link>
    </div>
  );
}
