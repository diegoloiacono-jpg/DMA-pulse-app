import { Table as TableIcon } from "lucide-react";
import type { UnifiedRow } from "@/lib/metricBridge";

interface Props {
  rows: UnifiedRow[];
  platformName: string;
}

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

export default function RawDataPreview({ rows, platformName }: Props) {
  if (rows.length === 0) return null;

  const preview = rows.slice(0, 10);

  return (
    <section className="opacity-0 animate-fade-up" style={{ animationDelay: "600ms" }}>
      <div className="flex items-center gap-2 mb-2">
        <TableIcon className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Raw Data Preview — {platformName}</h3>
        <span className="text-[10px] text-muted-foreground">
          Showing {preview.length} of {rows.length} normalized rows
        </span>
      </div>
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Campaign</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Spend</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Impr.</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Clicks</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Conv.</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">ROAS</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Source</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                  <td className="py-1.5 px-3 text-foreground truncate max-w-[200px]" title={r.campaignName}>
                    {r.campaignName}
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-foreground">{fmt.format(r.spend)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{r.impressions.toLocaleString()}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{r.clicks.toLocaleString()}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{r.conversions.toLocaleString()}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-foreground">{r.returnOnSpend > 0 ? r.returnOnSpend.toFixed(1) + "x" : "—"}</td>
                  <td className="py-1.5 px-3 text-muted-foreground/60 truncate max-w-[120px]" title={`${r.sourceFile} row ${r.sourceRow}`}>
                    {r.sourceFile}:{r.sourceRow}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
