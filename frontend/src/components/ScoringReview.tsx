import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle, Loader2, Radar, TrendingUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient, PrioritizedWin, ScoringOutput, SpecialistResult } from "@/lib/apiClient";
import { categoryLabel } from "@/lib/categoryLabel";
import { platforms } from "@/data/auditData";
import ScoringCategoryBreakdown from "@/components/ScoringCategoryBreakdown";
import RadarChart from "@/components/RadarChart";

interface Props {
  auditId: string;
  output: ScoringOutput;
  specialistResults: SpecialistResult[];
  benchmarkScore: number;
  onComplete: (output: ScoringOutput) => void;
  onBack?: () => void;
}

const MATURITY_COLORS: Record<string, string> = {
  Champion: "text-score-excellent",
  Expert: "text-score-good",
  Advanced: "text-score-warning",
  Basic: "text-score-poor",
};

export default function ScoringReview({ auditId, output, specialistResults, benchmarkScore, onComplete, onBack }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [edited, setEdited] = useState<Record<string, PrioritizedWin>>({});

  const platformLabel = useMemo(
    () => platforms.find(p => p.id === output.platform_id)?.shortName ?? output.platform_id,
    [output.platform_id]
  );

  const winKey = (w: PrioritizedWin) => `${w.category}::${w.topic}`;

  // Quick wins with local ICE edits applied, re-ranked live
  const wins = useMemo(
    () =>
      output.quick_wins
        .slice(0, 10)
        .map((w) => edited[winKey(w)] ?? w)
        .sort((a, b) => b.priority_score - a.priority_score),
    [output.quick_wins, edited]
  );

  const update = (win: PrioritizedWin, field: "impact" | "confidence" | "ease", value: number) => {
    const next = { ...win, [field]: value };
    next.priority_score = Math.round(Math.min(((next.impact + next.confidence + next.ease) / 3) * 2, 10) * 100) / 100;
    next.human_override = true;
    setEdited((prev) => ({ ...prev, [winKey(win)]: next }));
  };

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const overrides = Object.values(edited);
      await apiClient.validateScoring(auditId, true, overrides);
      onComplete({ ...output, quick_wins: wins });
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
          )}
          <h2 className="text-lg font-semibold">Scoring Review</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className={`text-2xl font-bold tabular-nums ${MATURITY_COLORS[output.maturity_label] ?? ""}`}>
              {output.platform_score.toFixed(0)}
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight">{output.maturity_label}</span>
          </div>
          <Button onClick={handleApprove} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            Approve & Publish
          </Button>
        </div>
      </div>

      {/* Category radar */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Radar className="h-4 w-4" /> {platformLabel} Category Radar
        </h3>
        <RadarChart
          categories={output.category_scores.map(c => ({ name: categoryLabel(c.name), score: c.score }))}
          label={platformLabel}
          showBenchmark
          benchmarkScore={benchmarkScore}
          confidence="high"
        />
      </div>

      {/* Quick wins — ICE scores can be overridden */}
      {wins.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4" /> Top Quick Wins
            <span className="text-xs font-normal text-muted-foreground">(ICE scores are editable)</span>
          </h3>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Topic</th>
                  <th className="px-3 py-2 text-left font-medium">Category</th>
                  <th className="px-3 py-2 text-right font-medium">Impact</th>
                  <th className="px-3 py-2 text-right font-medium">Confidence</th>
                  <th className="px-3 py-2 text-right font-medium">Ease</th>
                  <th className="px-3 py-2 text-right font-medium">Priority</th>
                  <th className="px-3 py-2 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {wins.map((win) => (
                  <tr key={winKey(win)} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">
                      {win.topic}
                      {edited[winKey(win)] && (
                        <Badge variant="outline" className="ml-2 text-[10px]">edited</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {categoryLabel(win.category)}
                    </td>
                    {(["impact", "confidence", "ease"] as const).map((field) => (
                      <td key={field} className="px-3 py-2 text-right">
                        <Select
                          value={String(win[field])}
                          onValueChange={(v) => update(win, field, Number(v))}
                        >
                          <SelectTrigger className="ml-auto h-7 w-16 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Badge variant="secondary">{win.priority_score.toFixed(1)}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-xs">
                      {win.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Category scores — expandable bar-list */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Category Breakdown
        </h3>
        <ScoringCategoryBreakdown categoryScores={output.category_scores} specialistResults={specialistResults} />
      </div>
    </div>
  );
}
