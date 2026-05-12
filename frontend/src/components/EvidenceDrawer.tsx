import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, MapPin, AlertTriangle } from "lucide-react";
import type { UnifiedRow } from "@/lib/metricBridge";
import type { PrioritizedItem } from "@/utils/roadmapLogic";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PrioritizedItem | null;
  allRows: UnifiedRow[];
  onSave?: () => void;
}

export default function EvidenceDrawer({ open, onOpenChange, item, allRows, onSave }: Props) {
  if (!item) return null;

  // Find campaigns relevant to this item's platform
  const platformRows = allRows.filter(r => {
    const platformMap: Record<string, string[]> = {
      "sea-google": ["google"],
      meta: ["meta"],
      linkedin: ["linkedin"],
      "sea-bing": ["bing"],
      pinterest: ["pinterest"],
      tiktok: ["tiktok"],
      snapchat: ["snapchat"],
      dv360: ["google", "dv360"],
    };
    const keys = platformMap[item.platformId] || [];
    return keys.includes(r.platform);
  });

  // Pick top 5 campaigns by spend (most representative)
  const topCampaigns = [...platformRows]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);

  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[90vw] sm:w-[70vw] lg:w-[60vw] max-w-3xl max-h-[85vh] overflow-y-auto p-0
                   data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-sm font-semibold">
            Evidence: <span className="text-primary">{item.topic}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          {/* Item summary */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-1.5">
            <p className="text-xs text-muted-foreground">{item.platformName} · {item.category}</p>
            <p className="text-sm font-medium text-foreground">{item.topic}</p>
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span>Impact: {item.impact}</span>
              <span>Effort: {item.effort}</span>
              <span>Priority: {item.priorityScore}</span>
            </div>
          </div>

          {/* Reasoning */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Reasoning</h4>
            <p className="text-xs text-muted-foreground">
              {item.action || item.details || "Flagged based on maturity level assessment against DMA Global criteria."}
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <AlertTriangle className="w-3 h-3" />
              {topCampaigns.length > 0
                ? "Verified via uploaded campaign data"
                : "Manually attested — no uploaded data for this platform"}
            </div>
          </div>

          {/* Campaign evidence */}
          {topCampaigns.length > 0 ? (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Top {topCampaigns.length} Campaigns (by Spend)
              </h4>
              <div className="space-y-2">
                {topCampaigns.map((c, i) => (
                  <div key={i} className="p-2.5 rounded-lg border border-border bg-card space-y-1">
                    <p className="text-xs font-medium text-foreground truncate" title={c.campaignName}>
                      {c.campaignName}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
                      <span>Spend: {fmt.format(c.spend)}</span>
                      <span>Clicks: {c.clicks.toLocaleString()}</span>
                      <span>Conv: {c.conversions.toLocaleString()}</span>
                      {c.bidStrategyType && <span>Bid: {c.bidStrategyType}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                      <FileText className="w-3 h-3" />
                      <span className="truncate">{c.sourceFile}</span>
                      <span>Row {c.sourceRow}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg border border-dashed border-border text-center">
              <MapPin className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                No uploaded data for {item.platformName}. Upload a CSV to see campaign-level evidence.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30 sm:justify-end gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="px-5 py-2 rounded-md text-sm font-semibold border border-border bg-card text-foreground
                       hover:bg-muted transition-colors active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave?.(); onOpenChange(false); }}
            className="px-5 py-2 rounded-md text-sm font-semibold bg-primary text-primary-foreground
                       hover:bg-primary/90 transition-colors active:scale-[0.97] shadow-sm"
          >
            Save & Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
