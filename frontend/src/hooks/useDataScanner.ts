import { useMemo } from "react";
import { scanHeadersForPlatform, type HeaderCheckResult } from "@/components/PlatformDataGuide";
import { parseCampaignName } from "@/utils/dashboardLogic";

// ─── Metric Status ───────────────────────────────────────────────────────

export type MetricState = "found" | "missing" | "pending";

export interface MetricStatus {
  spend: MetricState;
  impressions: MetricState;
  clicks: MetricState;
  conversions: MetricState;
  revenue: MetricState;
  campaignName: MetricState;
  namingConvention: "valid" | "invalid" | "pending";
  namingMatchPercent: number;
}

export interface ScanResult {
  metricStatus: MetricStatus;
  reportChecks: HeaderCheckResult[];
  totalFound: number;
  totalRequired: number;
  progressPercent: number;
  canProceed: boolean;         // Always true if at least 1 metric found
  warnings: ScanWarning[];
}

export interface ScanWarning {
  type: "info" | "warning" | "error";
  field: string;
  message: string;
}

// ─── Core metric synonyms (same as dataProcessor) ────────────────────────

const METRIC_SYNONYMS: Record<string, string[]> = {
  spend: ["spend", "cost", "amount spent", "amount spent (usd)", "total spent", "media cost"],
  impressions: ["impressions", "impr.", "impr", "impression"],
  clicks: ["clicks", "link clicks", "clicks (all)", "interactions", "outbound clicks", "swipe ups"],
  conversions: ["conversions", "results", "purchases", "leads", "total conversions"],
  revenue: ["revenue", "conversion value", "conv. value", "purchase conversion value", "total conversion value"],
  campaignName: ["campaign name", "campaign", "campaign_name", "insertion order", "line item"],
};

function checkMetric(headers: string[], synonyms: string[]): boolean {
  const norm = headers.map(h => h.toLowerCase().trim());
  return synonyms.some(s => norm.some(h => h.includes(s) || s.includes(h)));
}

// ─── Hook ────────────────────────────────────────────────────────────────

export function useDataScanner(
  headers: string[],
  platformId: string,
  namingConvention: string,
  sampleCampaignNames: string[] = [],
): ScanResult {
  return useMemo(() => {
    const hasHeaders = headers.length > 0;

    // Metric detection
    const metricStatus: MetricStatus = {
      spend: hasHeaders ? (checkMetric(headers, METRIC_SYNONYMS.spend) ? "found" : "missing") : "pending",
      impressions: hasHeaders ? (checkMetric(headers, METRIC_SYNONYMS.impressions) ? "found" : "missing") : "pending",
      clicks: hasHeaders ? (checkMetric(headers, METRIC_SYNONYMS.clicks) ? "found" : "missing") : "pending",
      conversions: hasHeaders ? (checkMetric(headers, METRIC_SYNONYMS.conversions) ? "found" : "missing") : "pending",
      revenue: hasHeaders ? (checkMetric(headers, METRIC_SYNONYMS.revenue) ? "found" : "missing") : "pending",
      campaignName: hasHeaders ? (checkMetric(headers, METRIC_SYNONYMS.campaignName) ? "found" : "missing") : "pending",
      namingConvention: "pending",
      namingMatchPercent: 0,
    };

    // Naming convention check
    if (namingConvention && sampleCampaignNames.length > 0) {
      const matches = sampleCampaignNames.filter(name => {
        const result = parseCampaignName(name, namingConvention);
        return result.matches;
      });
      const pct = Math.round((matches.length / sampleCampaignNames.length) * 100);
      metricStatus.namingConvention = pct >= 50 ? "valid" : "invalid";
      metricStatus.namingMatchPercent = pct;
    }

    // Core 3 report checks
    const reportChecks = hasHeaders ? scanHeadersForPlatform(headers, platformId) : [];

    // Count found / required
    const coreMetrics = ["spend", "impressions", "clicks", "conversions", "campaignName"] as const;
    const totalRequired = coreMetrics.length;
    const totalFound = coreMetrics.filter(m => metricStatus[m] === "found").length;
    const progressPercent = hasHeaders ? Math.round((totalFound / totalRequired) * 100) : 0;

    // Warnings
    const warnings: ScanWarning[] = [];

    if (metricStatus.spend === "missing") {
      warnings.push({ type: "error", field: "Spend", message: "Spend column not found. Cost analysis will be unavailable." });
    }
    if (metricStatus.conversions === "missing") {
      warnings.push({ type: "warning", field: "Conversions", message: "Conversion data missing. ROAS and CPA scores will be estimated." });
    }
    if (metricStatus.revenue === "missing") {
      warnings.push({ type: "info", field: "Revenue", message: "Revenue/conv. value not found. ROAS calculations will use conversion count only." });
    }
    if (metricStatus.campaignName === "missing") {
      warnings.push({ type: "error", field: "Campaign Name", message: "No campaign identifier found. Naming convention analysis unavailable." });
    }
    if (metricStatus.namingConvention === "invalid") {
      warnings.push({
        type: "error",
        field: "Naming Convention",
        message: `Naming Convention Mismatch: Only ${metricStatus.namingMatchPercent}% of campaign names match your pattern. Data Consistency score will be reduced.`,
      });
    }

    // Check for search term insights
    const hasSearchTerms = headers.some(h => {
      const l = h.toLowerCase();
      return l.includes("search term") || l.includes("search category") || l.includes("query");
    });
    if (!hasSearchTerms && platformId === "google") {
      warnings.push({
        type: "info",
        field: "Search Insights",
        message: "Strategic Intent score will be estimated. For a full audit, include the 'Search Term Insights' report.",
      });
    }

    return {
      metricStatus,
      reportChecks,
      totalFound,
      totalRequired,
      progressPercent,
      canProceed: totalFound >= 1,
      warnings,
    };
  }, [headers, platformId, namingConvention, sampleCampaignNames]);
}
