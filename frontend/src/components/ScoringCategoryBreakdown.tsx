import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, ChevronDown, X } from "lucide-react";
import { getMaturityColor, getScoreStatus, type MaturityLevel } from "@/data/auditData";
import type { CategoryScore, SpecialistResult } from "@/lib/apiClient";

interface Props {
  categoryScores: CategoryScore[];
  specialistResults: SpecialistResult[];
}

const PASSING_LEVELS = new Set(["advanced", "expert", "champion"]);

export default function ScoringCategoryBreakdown({ categoryScores, specialistResults }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const byCategory = useMemo(() => {
    const map = new Map<string, SpecialistResult[]>();
    for (const r of specialistResults) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    return map;
  }, [specialistResults]);

  const naCategories = Array.from(byCategory.entries())
    .filter(([, rs]) => rs.every((r) => r.not_applicable))
    .map(([name]) => name);

  return (
    <div className="grid grid-cols-1 gap-1.5">
      {naCategories.map((name) => (
        <div key={name} className="bg-card rounded-lg border border-border px-3 py-2.5 flex items-center gap-3">
          <span className="font-mono text-base font-bold text-muted-foreground shrink-0">N/A</span>
          <span className="text-xs font-semibold text-foreground truncate">{name.replace(/_/g, " ")}</span>
          <span className="text-[10px] text-muted-foreground">not applicable for B2B</span>
        </div>
      ))}
      {categoryScores.map((cat) => {
        const topics = byCategory.get(cat.name) ?? [];
        const total = topics.length;
        const passed = topics.filter(t => PASSING_LEVELS.has(t.level)).length;
        const pct = Math.round(cat.pass_rate);
        const status = getScoreStatus(pct);
        const isExpanded = expanded === cat.name;

        return (
          <div key={cat.name} className="bg-card rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setExpanded(isExpanded ? null : cat.name)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/20 transition-colors active:scale-[0.998]"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className={`tabular-nums font-mono text-base font-bold score-text-${status} shrink-0`}>
                  {pct}%
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {cat.name.replace(/_/g, " ")}
                    </span>
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
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Explanation / Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topics.map((t, i) => {
                      const level = (t.level.charAt(0).toUpperCase() + t.level.slice(1)) as MaturityLevel;
                      return (
                        <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors">
                          <td className="py-1.5 px-3 text-foreground text-[11px] leading-tight max-w-[180px]">
                            {t.topic}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            {t.status === "pass" ? <Check className="w-3.5 h-3.5 text-score-excellent mx-auto" />
                              : t.status === "fail" ? <X className="w-3.5 h-3.5 text-score-poor mx-auto" />
                              : <AlertTriangle className="w-3.5 h-3.5 text-score-warning mx-auto" />}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getMaturityColor(level)}`}>
                              {level}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-[10px] max-w-[320px]">
                            {t.action ? (
                              <span className="flex items-start gap-1.5 text-foreground">
                                <ArrowRight className="w-3 h-3 mt-0.5 text-score-warning shrink-0" />
                                {t.action}
                              </span>
                            ) : t.explanation ? (
                              <span className="text-muted-foreground">{t.explanation}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
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
      })}
    </div>
  );
}
