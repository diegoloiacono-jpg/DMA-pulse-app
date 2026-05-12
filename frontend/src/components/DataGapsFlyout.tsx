import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertTriangle, Database, Tag, Globe, Link2, Server } from "lucide-react";
import type { BusinessModel } from "@/utils/brandContext";

export interface DataGap {
  id: string;
  type: "crm" | "naming" | "platform" | "metric" | "signal";
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
}

const ICON_MAP: Record<DataGap["type"], typeof Database> = {
  crm: Server,
  naming: Tag,
  platform: Globe,
  metric: Database,
  signal: Link2,
};

const SEVERITY_COLORS: Record<DataGap["severity"], string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  low: "bg-muted text-muted-foreground border-border",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gaps: DataGap[];
}

export default function DataGapsFlyout({ open, onOpenChange, gaps }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[380px] sm:w-[420px] overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Data Gaps ({gaps.length})
          </SheetTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Required signals missing from your uploads that are necessary to verify Expert or Champion maturity levels.
          </p>
        </SheetHeader>

        <div className="mt-4 space-y-2.5">
          {gaps.map((gap) => {
            const Icon = ICON_MAP[gap.type] || Database;
            return (
              <div
                key={gap.id}
                className={`rounded-lg border p-3 space-y-1.5 ${SEVERITY_COLORS[gap.severity]}`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-semibold">{gap.title}</span>
                </div>
                <p className="text-[11px] opacity-80 leading-relaxed pl-5.5">
                  {gap.detail}
                </p>
              </div>
            );
          })}
          {gaps.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No data gaps detected — all required signals are present.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Generate contextual data gaps based on what's actually missing */
export function generateDataGaps(
  uploadedPlatformKeys: string[],
  model: BusinessModel,
  manualActive: boolean,
  namingConvention: string,
): DataGap[] {
  const gaps: DataGap[] = [];

  // Platform gaps — which platforms have no data
  const PLATFORM_LABELS: Record<string, string> = {
    google: "Google Ads",
    meta: "Meta Ads",
    linkedin: "LinkedIn Ads",
    bing: "Microsoft Ads",
    dv360: "DV360",
    tiktok: "TikTok Ads",
    pinterest: "Pinterest Ads",
    snapchat: "Snapchat Ads",
  };

  const allPlatformKeys = Object.keys(PLATFORM_LABELS);
  const missingPlatforms = allPlatformKeys.filter(k => !uploadedPlatformKeys.includes(k));

  // LinkedIn is now a first-class platform — picked up via the standard `missingPlatforms` flow below.

  // CRM signal gap for B2B
  if (model === "B2B") {
    gaps.push({
      id: "gap-crm",
      type: "crm",
      title: "CRM Signal Gap: No offline lead stages detected",
      detail: "No CRM-linked conversion data found. Offline lead stages (MQL → SQL → Closed Won) are needed to validate lead quality scoring.",
      severity: "high",
    });
  }

  // Naming convention gap
  if (namingConvention && manualActive) {
    gaps.push({
      id: "gap-naming",
      type: "naming",
      title: "Naming Gap: 15% of campaigns lack 'Market' tag",
      detail: "Some campaigns don't follow the defined naming convention, reducing platform maturity scoring accuracy by up to 15%.",
      severity: "medium",
    });
  }

  // Metric gaps based on missing platforms (cap to avoid noise)
  const metricGaps: DataGap[] = missingPlatforms.slice(0, 2).map(key => ({
    id: `gap-platform-${key}`,
    type: "platform" as const,
    title: `${PLATFORM_LABELS[key]} data not uploaded`,
    detail: `Upload ${PLATFORM_LABELS[key]} campaign reports to unlock maturity scoring and cross-platform benchmarking.`,
    severity: "low" as const,
  }));
  gaps.push(...metricGaps);

  // B2B-specific signal gaps
  if (model === "B2B" && uploadedPlatformKeys.includes("google")) {
    gaps.push({
      id: "gap-enhanced-conv",
      type: "signal",
      title: "Enhanced Conversions for Leads not detected",
      detail: "Google Ads Enhanced Conversions for Leads requires hashed first-party data. This signal is needed for Champion-level attribution scoring.",
      severity: "medium",
    });
  }

  if (model === "B2B" && uploadedPlatformKeys.includes("meta")) {
    gaps.push({
      id: "gap-capi",
      type: "signal",
      title: "CAPI server-side events incomplete",
      detail: "Meta Conversions API (CAPI) events are needed to verify lead quality and reduce attribution gaps from browser privacy restrictions.",
      severity: "medium",
    });
  }

  return gaps;
}
