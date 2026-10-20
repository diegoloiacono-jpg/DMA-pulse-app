import { Check, X } from "lucide-react";
import type { SeoMaturity } from "@/lib/apiClient";
import { SEO_TIERS } from "@/data/seoPulse";

interface Props {
  maturity: SeoMaturity;
}

/** The SEO maturity staircase: a tier is reached at the threshold when every lower tier is reached. */
export default function SeoStaircase({ maturity }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {SEO_TIERS.map(({ name, definition }) => {
          const t = maturity.tiers[name];
          const pct = t?.score == null ? null : Math.round(t.score * 100);
          return (
            <div
              key={name}
              title={definition}
              className={`rounded-lg border px-3 py-2 ${t?.reached ? "border-score-excellent/40 bg-score-excellent/5" : "border-border bg-muted/20"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{name}</span>
                {t?.reached
                  ? <Check className="w-3.5 h-3.5 text-score-excellent" />
                  : <X className="w-3.5 h-3.5 text-muted-foreground" />}
              </div>
              <div className="text-lg font-bold tabular-nums">{pct == null ? "—" : `${pct}%`}</div>
              <div className="text-[10px] text-muted-foreground">
                {t ? `${t.pass} pass · ${t.warn} warn · ${t.fail} fail` : "no scored topics"}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        A tier is reached when (pass + {maturity.warn_weight} × warn) / scored topics is at least{" "}
        {Math.round(maturity.threshold * 100)}% and every lower tier is reached. N/A, report-only and
        no-data topics are left out.
      </p>
    </div>
  );
}
