import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient, SpecialistResult } from "@/lib/apiClient";

interface Props {
  auditId: string;
  results: SpecialistResult[];
  onScoringStarted: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  pass: "bg-score-excellent/20 text-score-excellent border-score-excellent/30",
  warn: "bg-score-warning/20 text-score-warning border-score-warning/30",
  fail: "bg-score-poor/20 text-score-poor border-score-poor/30",
};

const LEVEL_ORDER = ["basic", "advanced", "expert", "champion"] as const;

export default function SpecialistReview({ auditId, results, onScoringStarted }: Props) {
  const [edited, setEdited] = useState<Record<string, SpecialistResult>>({});
  const [submitting, setSubmitting] = useState(false);

  const key = (r: SpecialistResult) => `${r.category}::${r.topic}`;

  const get = (r: SpecialistResult): SpecialistResult => edited[key(r)] ?? r;

  const update = (r: SpecialistResult, patch: Partial<SpecialistResult>) => {
    setEdited((prev) => ({ ...prev, [key(r)]: { ...get(r), ...patch } }));
  };

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const overrides = Object.values(edited);
      await apiClient.validateSpecialist(auditId, overrides);
      onScoringStarted();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  // Group by category for display
  const categories = Array.from(new Set(results.map((r) => r.category)));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Specialist Review</h2>
        <Button onClick={handleApprove} disabled={submitting}>
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="mr-2 h-4 w-4" />
          )}
          Approve & Score
        </Button>
      </div>

      {categories.map((cat) => (
        <div key={cat} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold capitalize text-muted-foreground">
            {cat.replace(/_/g, " ")}
          </h3>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Topic</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Level</th>
                  <th className="px-3 py-2 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {results
                  .filter((r) => r.category === cat)
                  .map((r) => {
                    const cur = get(r);
                    return (
                      <tr key={key(r)} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{r.topic}</td>

                        {/* Status selector */}
                        <td className="px-3 py-2">
                          <Select
                            value={cur.status}
                            onValueChange={(v) =>
                              update(r, { status: v as SpecialistResult["status"] })
                            }
                          >
                            <SelectTrigger className="h-7 w-24 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(["pass", "warn", "fail"] as const).map((s) => (
                                <SelectItem key={s} value={s}>
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${STATUS_COLORS[s]}`}
                                  >
                                    {s}
                                  </Badge>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        {/* Level selector */}
                        <td className="px-3 py-2">
                          <Select
                            value={cur.level}
                            onValueChange={(v) =>
                              update(r, { level: v as SpecialistResult["level"] })
                            }
                          >
                            <SelectTrigger className="h-7 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LEVEL_ORDER.map((l) => (
                                <SelectItem key={l} value={l}>
                                  {l}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        <td className="px-3 py-2 text-muted-foreground max-w-xs truncate">
                          {cur.action === "None" ? "—" : cur.action}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
