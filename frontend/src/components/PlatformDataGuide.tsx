import { useState } from "react";
import { CheckCircle2, Circle, AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Info, Upload } from "lucide-react";

// ─── Core 3 Reports per Platform ─────────────────────────────────────────

interface CoreReport {
  name: string;
  exportName: string;              // Exact name in platform UI
  description: string;
  requiredHeaders: string[];       // Headers the scanner looks for
  exportSteps: string[];           // 3-step golden export
}

interface PlatformCore3 {
  id: string;
  shortName: string;
  reports: [CoreReport, CoreReport, CoreReport];
}

const PLATFORM_CORE_3: PlatformCore3[] = [
  {
    id: "google",
    shortName: "Google Ads",
    reports: [
      {
        name: "Core Performance",
        exportName: "Campaign Report",
        description: "Campaign-level spend, clicks, conversions, and ROAS",
        requiredHeaders: ["campaign", "cost", "clicks", "conversions", "conv. value"],
        exportSteps: [
          "Go to Campaigns → Columns → Modify columns → add Conversions, Conv. value, Cost",
          "Set date range to last 90 days",
          "Click Download (↓) → CSV or Excel",
        ],
      },
      {
        name: "Asset / Creative",
        exportName: "Asset Group Report (PMax) or Ad Report",
        description: "PMax asset groups with strength ratings, or RSA ad performance",
        requiredHeaders: ["asset group", "ad strength", "headlines", "campaign type"],
        exportSteps: [
          "Navigate to Ads & Assets → Assets or Asset Groups",
          "Add columns: Asset Group, Ad Strength, Status",
          "Download → CSV",
        ],
      },
      {
        name: "Audience / Signal",
        exportName: "Search Term Insights Report",
        description: "Theme-level search insights (privacy-safe, no individual queries)",
        requiredHeaders: ["search term", "search category", "bid strategy", "campaign type"],
        exportSteps: [
          "Go to Insights → Search Term Insights",
          "Select date range and all campaigns",
          "Click Download → CSV",
        ],
      },
    ],
  },
  {
    id: "meta",
    shortName: "Meta Ads",
    reports: [
      {
        name: "Core Performance",
        exportName: "Campaign Performance Export",
        description: "Campaign-level results, spend, ROAS, and cost per result",
        requiredHeaders: ["campaign name", "amount spent", "results", "impressions", "ctr"],
        exportSteps: [
          "Open Ads Manager → Select Campaigns tab",
          "Columns → Customize → add Results, Amount Spent, ROAS",
          "Click Export → Export Table Data → CSV",
        ],
      },
      {
        name: "Asset / Creative",
        exportName: "Ad-Level Performance Export",
        description: "Ad creative performance by format with CTR and CPA",
        requiredHeaders: ["ad name", "impressions", "ctr", "cost per result"],
        exportSteps: [
          "Switch to Ads tab in Ads Manager",
          "Add columns: Ad Name, Format, CTR, CPA, Video Views",
          "Export → CSV",
        ],
      },
      {
        name: "Audience / Signal",
        exportName: "Breakdown by Age & Gender",
        description: "Aggregated demographic performance (privacy-safe)",
        requiredHeaders: ["age", "gender", "impressions", "amount spent"],
        exportSteps: [
          "Select Campaigns → Breakdown → By Delivery → Age or Gender",
          "Set date range to last 90 days",
          "Export → CSV (do NOT combine age + placement breakdowns)",
        ],
      },
    ],
  },
  {
    id: "bing",
    shortName: "Bing Ads",
    reports: [
      {
        name: "Core Performance",
        exportName: "Campaign Performance Report",
        description: "Campaign spend, clicks, conversions, and CPA",
        requiredHeaders: ["campaign name", "spend", "clicks", "conversions", "impressions"],
        exportSteps: [
          "Go to Reports → Standard Reports → Campaign Performance",
          "Set columns: Campaign, Spend, Clicks, Conversions, Impressions",
          "Download → CSV",
        ],
      },
      {
        name: "Asset / Creative",
        exportName: "Ad Performance Report",
        description: "Ad copy performance with headlines and CTR",
        requiredHeaders: ["ad title", "impressions", "ctr", "conversions"],
        exportSteps: [
          "Reports → Standard Reports → Ad Performance",
          "Include: Ad Title, Description, CTR, Conv. Rate",
          "Download → CSV",
        ],
      },
      {
        name: "Audience / Signal",
        exportName: "Geographic Report",
        description: "Location-level performance data",
        requiredHeaders: ["country", "impressions", "clicks", "spend"],
        exportSteps: [
          "Reports → Standard Reports → Geographic",
          "Include Country, State, Impressions, Spend",
          "Download → CSV",
        ],
      },
    ],
  },
  {
    id: "pinterest",
    shortName: "Pinterest",
    reports: [
      {
        name: "Core Performance",
        exportName: "Campaign Report",
        description: "Campaign-level spend, outbound clicks, and conversions",
        requiredHeaders: ["campaign name", "spend", "impressions", "outbound clicks"],
        exportSteps: [
          "Go to Ads → Reporting → Campaigns",
          "Add columns: Spend, Impressions, Outbound Clicks, Conversions",
          "Export → CSV",
        ],
      },
      {
        name: "Asset / Creative",
        exportName: "Pin Performance Report",
        description: "Pin format performance with saves and CTR",
        requiredHeaders: ["pin name", "impressions", "saves", "ctr"],
        exportSteps: [
          "Navigate to Ads → Pins tab",
          "Add: Pin Name, Format, Saves, CTR, Outbound Clicks",
          "Export → CSV",
        ],
      },
      {
        name: "Audience / Signal",
        exportName: "Audience Insights Export",
        description: "Audience segment performance data",
        requiredHeaders: ["audience name", "impressions", "clicks"],
        exportSteps: [
          "Go to Audiences → Select audience",
          "View performance breakdown",
          "Export → CSV",
        ],
      },
    ],
  },
  {
    id: "tiktok",
    shortName: "TikTok",
    reports: [
      {
        name: "Core Performance",
        exportName: "Campaign Report",
        description: "Campaign-level cost, impressions, and conversion data",
        requiredHeaders: ["campaign name", "cost", "impressions", "conversions"],
        exportSteps: [
          "Open TikTok Ads Manager → Campaign tab",
          "Customize columns: Cost, Impressions, Clicks, Conversions",
          "Click Export → CSV",
        ],
      },
      {
        name: "Asset / Creative",
        exportName: "Ad-Level Report",
        description: "Creative performance with video views and completion rate",
        requiredHeaders: ["ad name", "impressions", "ctr", "video views"],
        exportSteps: [
          "Switch to Ad tab in Ads Manager",
          "Add: Ad Name, Format, CTR, Video Views, Completion Rate",
          "Export → CSV",
        ],
      },
      {
        name: "Audience / Signal",
        exportName: "Audience Report",
        description: "Audience targeting and performance overview",
        requiredHeaders: ["audience", "impressions", "cost"],
        exportSteps: [
          "Go to Assets → Audiences",
          "View performance metrics for each audience",
          "Export → CSV",
        ],
      },
    ],
  },
  {
    id: "snapchat",
    shortName: "Snapchat",
    reports: [
      {
        name: "Core Performance",
        exportName: "Campaign Report",
        description: "Campaign spend, impressions, swipe-ups, and conversions",
        requiredHeaders: ["campaign name", "spend", "impressions", "swipe ups"],
        exportSteps: [
          "Open Snapchat Ads Manager → Campaigns",
          "Columns: Spend, Impressions, Swipe Ups, Conversions",
          "Export → CSV",
        ],
      },
      {
        name: "Asset / Creative",
        exportName: "Ad Creative Report",
        description: "Ad-level creative performance with swipe rate",
        requiredHeaders: ["ad name", "impressions", "swipe up rate"],
        exportSteps: [
          "Navigate to Ads tab",
          "Add: Ad Name, Format, Swipe Up Rate, Video Views",
          "Export → CSV",
        ],
      },
      {
        name: "Audience / Signal",
        exportName: "Audience Segments Export",
        description: "Audience segment reach and overlap data",
        requiredHeaders: ["audience", "size", "impressions"],
        exportSteps: [
          "Go to Assets → Audiences in Snap Ads Manager",
          "Review segment performance",
          "Export → CSV",
        ],
      },
    ],
  },
  {
    id: "dv360",
    shortName: "DV360",
    reports: [
      {
        name: "Core Performance",
        exportName: "Campaign / Insertion Order Report",
        description: "IO-level media cost, impressions, clicks, and conversions",
        requiredHeaders: ["campaign", "insertion order", "media cost", "impressions", "clicks"],
        exportSteps: [
          "Go to Reporting → Create a new report",
          "Dimensions: Campaign, IO. Metrics: Media Cost, Impressions, Clicks, Conversions",
          "Run & Download → CSV",
        ],
      },
      {
        name: "Asset / Creative",
        exportName: "Deal & Creative Report",
        description: "Deal performance with win rates and creative CTR",
        requiredHeaders: ["deal", "creative", "impressions", "ctr"],
        exportSteps: [
          "Reporting → Dimensions: Deal ID, Creative. Metrics: Impressions, Clicks, CTR",
          "Include creative format and size columns",
          "Run & Download → CSV",
        ],
      },
      {
        name: "Audience / Signal",
        exportName: "Exchange & Environment Report",
        description: "Exchange and environment (App vs Web) performance split",
        requiredHeaders: ["exchange", "environment", "impressions", "media cost"],
        exportSteps: [
          "Reporting → Dimensions: Exchange, Environment, Device Type",
          "Metrics: Media Cost, Impressions, Viewability Rate",
          "Run & Download → CSV",
        ],
      },
    ],
  },
];

// ─── Header Scanning (detect found metrics from uploaded files) ──────────

export interface HeaderCheckResult {
  platformId: string;
  reportIndex: number;
  found: string[];
  missing: string[];
  complete: boolean;
}

export function scanHeadersForPlatform(
  headers: string[],
  platformId: string,
): HeaderCheckResult[] {
  const platform = PLATFORM_CORE_3.find(p => p.id === platformId);
  if (!platform) return [];

  const normalized = headers.map(h => h.toLowerCase().trim());

  return platform.reports.map((report, idx) => {
    const found: string[] = [];
    const missing: string[] = [];

    for (const req of report.requiredHeaders) {
      const match = normalized.some(h => h.includes(req) || req.includes(h));
      if (match) found.push(req);
      else missing.push(req);
    }

    return {
      platformId,
      reportIndex: idx,
      found,
      missing,
      complete: missing.length === 0,
    };
  });
}

// ─── Topics that cannot be verified from Core 3 data ─────────────────────

const UNVERIFIABLE_TOPICS = new Set([
  "crm", "customer match", "offline conversion", "sellers.json",
  "frequency cap", "brand safety", "verification vendor",
  "gtm", "tag manager", "consent mode", "enhanced conversions",
  "remarketing", "predictive audience", "bqml",
  "automated rules", "scripts", "labels",
  "product ratings", "supplemental feed", "promotion feed",
]);

export function isConsultantRequired(topicText: string): boolean {
  const lower = topicText.toLowerCase();
  return [...UNVERIFIABLE_TOPICS].some(t => lower.includes(t));
}

// ─── Report Labels ─────────────────────────────────────────────────────

const REPORT_ICONS = ["1", "2", "3"];

// ─── Component ──────────────────────────────────────────────────────────

interface PlatformDataGuideProps {
  uploadedHeaders?: Record<string, string[]>; // platformId → headers
}

export default function PlatformDataGuide({ uploadedHeaders = {} }: PlatformDataGuideProps) {
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          Core 3 Reports — Download Checklist
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Upload these 3 standard exports per platform to run a complete audit.
        </p>
      </div>

      {/* Compatibility Warning */}
      <div className="px-5 py-3 border-b border-border bg-score-warning/5 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-score-warning shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-foreground font-medium">
            Metric Compatibility Notice
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Platforms restrict certain metric combinations for privacy. Use the standard exports listed below to ensure 100% audit accuracy.
            Individual search queries are NOT required — we audit aggregated Search Theme Insights instead.
          </p>
        </div>
      </div>

      {/* Platform List */}
      <div className="divide-y divide-border">
        {PLATFORM_CORE_3.map(platform => {
          const isOpen = expandedPlatform === platform.id;
          const headers = uploadedHeaders[platform.id] || [];
          const checks = headers.length > 0 ? scanHeadersForPlatform(headers, platform.id) : [];
          const completedReports = checks.filter(c => c.complete).length;
          const hasAnyData = headers.length > 0;

          return (
            <div key={platform.id}>
              <button
                onClick={() => setExpandedPlatform(isOpen ? null : platform.id)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">{platform.shortName}</span>
                  <span className="text-[10px] text-muted-foreground">3 reports</span>
                  {hasAnyData && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                      completedReports === 3
                        ? "bg-score-excellent/10 text-score-excellent"
                        : completedReports > 0
                        ? "bg-score-warning/10 text-score-warning"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {completedReports}/3 verified
                    </span>
                  )}
                </div>
                {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>

              {isOpen && (
                <div className="px-5 pb-4 space-y-3">
                  {platform.reports.map((report, rIdx) => {
                    const check = checks[rIdx];
                    const isComplete = check?.complete;
                    const foundCount = check ? check.found.length : 0;
                    const totalCount = report.requiredHeaders.length;

                    return (
                      <ReportCard
                        key={rIdx}
                        icon={REPORT_ICONS[rIdx]}
                        report={report}
                        isComplete={isComplete}
                        foundCount={foundCount}
                        totalCount={totalCount}
                        check={check}
                      />
                    );
                  })}

                  <p className="text-[10px] text-muted-foreground pt-1">
                    Items not covered by these reports will show a "Consultant Input Required" badge in the Action Items table.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportCard({
  icon,
  report,
  isComplete,
  foundCount,
  totalCount,
  check,
}: {
  icon: string;
  report: CoreReport;
  isComplete?: boolean;
  foundCount: number;
  totalCount: number;
  check?: HeaderCheckResult;
}) {
  const [showSteps, setShowSteps] = useState(false);

  return (
    <div className={`rounded-lg border p-3.5 space-y-2 ${
      isComplete
        ? "border-score-excellent/30 bg-score-excellent/5"
        : check
        ? "border-score-warning/30 bg-score-warning/5"
        : "border-border bg-muted/20"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span className="text-base">{icon}</span>
          <div>
            <p className="text-xs font-semibold text-foreground">{report.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{report.description}</p>
          </div>
        </div>
        {isComplete !== undefined && (
          isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-score-excellent shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-score-warning shrink-0" />
          )
        )}
      </div>

      {/* Export name callout */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-background border border-border">
        <Upload className="w-3 h-3 text-muted-foreground shrink-0" />
        <p className="text-[11px] text-foreground font-medium">{report.exportName}</p>
      </div>

      {/* Header check progress */}
      {check && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isComplete ? "bg-score-excellent" : "bg-score-warning"
                }`}
                style={{ width: `${(foundCount / totalCount) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">{foundCount}/{totalCount}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {check.found.map(h => (
              <span key={h} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-score-excellent/10 text-score-excellent font-medium">
                <CheckCircle2 className="w-2.5 h-2.5" />
                {h}
              </span>
            ))}
            {check.missing.map(h => (
              <span key={h} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-score-warning/10 text-score-warning font-medium">
                <Circle className="w-2.5 h-2.5" />
                {h}
              </span>
            ))}
          </div>
          {check.missing.length > 0 && (
            <p className="text-[10px] text-score-warning">
              Missing columns won't block the audit — affected scores may be limited.
            </p>
          )}
        </div>
      )}

      {/* How to Export (expandable) */}
      <button
        onClick={() => setShowSteps(!showSteps)}
        className="flex items-center gap-1.5 text-[10px] text-primary font-medium hover:underline"
      >
        <ExternalLink className="w-3 h-3" />
        {showSteps ? "Hide export steps" : "How to export this report"}
      </button>
      {showSteps && (
        <ol className="space-y-1 pl-1">
          {report.exportSteps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <span className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[9px] font-bold shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
