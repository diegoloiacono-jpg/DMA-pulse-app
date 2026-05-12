import { useState } from "react";
import { CheckCircle, Loader2, TrendingUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiClient, ScoringOutput } from "@/lib/apiClient";

interface Props {
  auditId: string;
  output: ScoringOutput;
  onComplete: (output: ScoringOutput) => void;
}

const MATURITY_COLORS: Record<string, string> = {
  Champion: "text-score-excellent",
  Expert: "text-score-good",
  Advanced: "text-score-warning",
  Basic: "text-score-poor",
};

export default function ScoringReview({ auditId, output, onComplete }: Props) {
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Scoring Review</h2>
        <Button onClick={handleApprove} disabled={submitting}>
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="mr-2 h-4 w-4" />
          )}
          Approve & Publish
        </Button>
      </div>

      {/* Platform score hero */}
      <div className="rounded-xl border bg-card p-6 flex flex-col items-center gap-2">
        <span className="text-5xl font-bold tabular-nums">
          {output.platform_score.toFixed(0)}
        </span>
        <span
          className={`text-lg font-semibold ${MATURITY_COLORS[output.maturity_label] ?? ""}`}
        >
          {output.maturity_label}
        </span>
        <span className="text-xs text-muted-foreground">Platform Maturity Score</span>
      </div>

      {/* Category scores */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Category Breakdown
        </h3>
        {output.category_scores.map((cat) => (
          <div key={cat.name} className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="capitalize">{cat.name.replace(/_/g, " ")}</span>
              <span className="tabular-nums font-medium">{cat.score.toFixed(0)}</span>
            </div>
            <Progress value={cat.score} className="h-2" />
          </div>
        ))}
      </div>

      {/* Quick wins */}
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
                    <td className="px-3 py-2 text-muted-foreground max-w-xs truncate">
                      {win.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
