import { RotateCcw, TrendingUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScoringOutput, SpecialistResult } from "@/lib/apiClient";
import { categoryLabel } from "@/lib/categoryLabel";
import RadarChart from "@/components/RadarChart";
import ScoringCategoryBreakdown from "@/components/ScoringCategoryBreakdown";
import SeoStaircase from "@/components/SeoStaircase";
import { seoMaturityText } from "@/utils/seo";
import { SEO_PLATFORM_LABEL } from "@/data/seoPulse";

interface Props {
  output: ScoringOutput;
  specialistResults: SpecialistResult[];
  brandName: string;
  benchmarkScore: number;
  onNewAudit: () => void;
}

/** Read-only result of an approved SEO audit. */
export default function SeoResults({ output, specialistResults, brandName, benchmarkScore, onNewAudit }: Props) {
  const naCount = specialistResults.filter(r => r.not_applicable).length;
  const noData = specialistResults.filter(r => ["no_data_source", "missing", "parse_error"].includes(r.source)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{SEO_PLATFORM_LABEL} — {brandName || "client"}</h2>
          <p className="text-xs text-muted-foreground">
            {specialistResults.length} topics · {naCount} not applicable · {noData} without data
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-2xl font-bold tabular-nums">{output.platform_score.toFixed(0)}</span>
            <span className="text-[10px] text-muted-foreground">{seoMaturityText(output.maturity, output.maturity_label)}</span>
          </div>
          <Button variant="outline" size="sm" onClick={onNewAudit}>
            <RotateCcw className="mr-1.5 h-4 w-4" /> New audit
          </Button>
        </div>
      </div>

      {output.maturity && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Maturity staircase</h3>
          <SeoStaircase maturity={output.maturity} />
        </div>
      )}

      {/* Stacked: the radar needs the full width for the long SEO category names */}
      <div className="flex flex-col gap-6">
        <RadarChart
          categories={output.category_scores.map(c => ({ name: categoryLabel(c.name), score: c.score }))}
          label={SEO_PLATFORM_LABEL}
          showBenchmark
          benchmarkScore={benchmarkScore}
          confidence="high"
          hideMaturityScale
        />
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4" /> Top Quick Wins
          </h3>
          <ol className="flex flex-col gap-2">
            {output.quick_wins.map((w, i) => (
              <li key={`${w.category}::${w.topic}`} className="rounded-lg border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{i + 1}. {w.topic}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">priority {w.priority_score.toFixed(1)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{categoryLabel(w.category)}</p>
                <p className="text-xs mt-1">{w.action}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Category Breakdown
        </h3>
        <ScoringCategoryBreakdown categoryScores={output.category_scores} specialistResults={specialistResults} statusBased />
      </div>
    </div>
  );
}
