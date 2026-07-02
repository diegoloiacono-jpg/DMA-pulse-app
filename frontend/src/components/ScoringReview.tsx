import { useState } from "react";
import { ArrowLeft, CheckCircle, Loader2, TrendingUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiClient, ScoringOutput } from "@/lib/apiClient";

interface Props {
  auditId: string;
  output: ScoringOutput;
  onComplete: (output: ScoringOutput) => void;
  onBack?: () => void;
}

const MATURITY_COLORS: Record<string, string> = {
  Champion: "text-score-excellent",
  Expert: "text-score-good",
  Advanced: "text-score-warning",
  Basic: "text-score-poor",
};

export default function ScoringReview({ auditId, output, onComplete, onBack }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await apiClient.validateScoring(auditId, true);
      onComplete(output);
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

      {/* Quick wins — surfaced first */}
      {output.quick_wins.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4" /> Top Quick Wins
          </h3>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Topic</th>
                  <th className="px-3 py-2 text-left font-medium">Category</th>
                  <th className="px-3 py-2 text-right font-medium">Priority</th>
                  <th className="px-3 py-2 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {output.quick_wins.slice(0, 10).map((win, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{win.topic}</td>
                    <td className="px-3 py-2 text-muted-foreground capitalize">
                      {win.category.replace(/_/g, " ")}
                    </td>
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

      {/* Category scores — compact card grid */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Category Breakdown
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {output.category_scores.map((cat) => (
            <div key={cat.name} className="rounded-lg border bg-card p-3 flex flex-col gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground truncate">
                {cat.name.replace(/_/g, " ")}
              </span>
              <span className="text-xl font-bold tabular-nums">{cat.score.toFixed(0)}</span>
              <Progress value={cat.score} className="h-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
