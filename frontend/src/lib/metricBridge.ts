/**
 * Metric Bridge: Standardizes terminology across ad platforms into a unified index.
 * Treats Meta's "Result Rate," Google's "Interaction Rate," LinkedIn's "Engagement Rate"
 * as a unified Engagement Index — and so on for other metrics.
 */

export interface UnifiedRow {
  campaignId: string;
  campaignName: string;
  platform: string;
  date?: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  engagementIndex: number;     // Unified: Result Rate / Interaction Rate / Engagement Rate
  costPerResult: number;       // Unified: CPA / Cost per Result / Cost per Engagement
  returnOnSpend: number;       // Unified: ROAS across all platforms
  clickThroughRate: number;    // Unified CTR
  conversionRate: number;      // Unified CVR
  dailyBudget: number;         // Mapped from campaign-level reports
  location?: string;           // From geo reports
  sourceFile: string;
  sourceRow: number;
  // AI-Ready fields (Google Ads specific)
  bidStrategyType?: string;
  campaignType?: string;
  adGroupName?: string;
  conversionValueRules?: string;
}

// Column name mappings per platform — maps raw column headers to unified fields
const COLUMN_MAPS: Record<string, Record<string, string>> = {
  meta: {
    "campaign id": "campaignId",
    "campaign name": "campaignName",
    "campaign_id": "campaignId",
    "campaign_name": "campaignName",
    "amount spent": "spend",
    "amount spent (usd)": "spend",
    "spend": "spend",
    "impressions": "impressions",
    "link clicks": "clicks",
    "clicks (all)": "clicks",
    "results": "conversions",
    "purchases": "conversions",
    "purchase roas": "returnOnSpend",
    "roas": "returnOnSpend",
    "result rate": "engagementIndex",
    "ctr (link click-through rate)": "clickThroughRate",
    "ctr": "clickThroughRate",
    "cost per result": "costPerResult",
    "cpa": "costPerResult",
    "purchase conversion value": "revenue",
    "conversion value": "revenue",
    "daily budget": "dailyBudget",
    "budget": "dailyBudget",
    "date": "date",
    "day": "date",
    "reporting starts": "date",
    "country": "location",
    "region": "location",
  },
  google: {
    "campaign id": "campaignId",
    "campaign": "campaignName",
    "campaign name": "campaignName",
    "cost": "spend",
    "cost / conv.": "costPerResult",
    "impr.": "impressions",
    "impressions": "impressions",
    "clicks": "clicks",
    "interactions": "clicks",
    "conversions": "conversions",
    "conv. value": "revenue",
    "conversion value": "revenue",
    "conv. value / cost": "returnOnSpend",
    "roas": "returnOnSpend",
    "interaction rate": "engagementIndex",
    "ctr": "clickThroughRate",
    "conv. rate": "conversionRate",
    "budget": "dailyBudget",
    "daily budget": "dailyBudget",
    "avg. daily budget": "dailyBudget",
    "day": "date",
    "date": "date",
    "country/territory": "location",
    "location": "location",
    "geographic region": "location",
    "state": "location",
    // AI-Ready columns
    "bid strategy type": "bidStrategyType",
    "bid strategy": "bidStrategyType",
    "bidding strategy type": "bidStrategyType",
    "campaign type": "campaignType",
    "campaign sub type": "campaignType",
    "ad group": "adGroupName",
    "ad group name": "adGroupName",
    "asset group": "adGroupName",
    "asset group name": "adGroupName",
    "conversion value rules": "conversionValueRules",
    "value rules": "conversionValueRules",
  },
  linkedin: {
    "campaign id": "campaignId",
    "campaign name": "campaignName",
    "campaign group name": "campaignName",
    "total spent": "spend",
    "amount spent": "spend",
    "cost": "spend",
    "impressions": "impressions",
    "clicks": "clicks",
    "conversions": "conversions",
    "leads": "conversions",
    "conversion value": "revenue",
    "engagement rate": "engagementIndex",
    "average ctr": "clickThroughRate",
    "ctr": "clickThroughRate",
    "cost per lead": "costPerResult",
    "cost per conversion": "costPerResult",
    "daily budget": "dailyBudget",
    "start date": "date",
    "date": "date",
  },
  tiktok: {
    "campaign id": "campaignId",
    "campaign name": "campaignName",
    "cost": "spend",
    "spend": "spend",
    "impression": "impressions",
    "impressions": "impressions",
    "clicks": "clicks",
    "conversions": "conversions",
    "total complete payment roas": "returnOnSpend",
    "conversion rate": "conversionRate",
    "ctr": "clickThroughRate",
    "cpa": "costPerResult",
    "cost per conversion": "costPerResult",
    "budget": "dailyBudget",
    "date": "date",
  },
  bing: {
    "campaign id": "campaignId",
    "campaign name": "campaignName",
    "campaign": "campaignName",
    "spend": "spend",
    "impressions": "impressions",
    "clicks": "clicks",
    "conversions": "conversions",
    "revenue": "revenue",
    "roas": "returnOnSpend",
    "ctr": "clickThroughRate",
    "conv. rate": "conversionRate",
    "cost per acquisition": "costPerResult",
    "avg. cpc": "costPerResult",
    "daily budget": "dailyBudget",
    "gregorian date": "date",
    "date": "date",
  },
  pinterest: {
    "campaign id": "campaignId",
    "campaign name": "campaignName",
    "spend in account currency": "spend",
    "spend": "spend",
    "impression": "impressions",
    "impressions": "impressions",
    "outbound clicks": "clicks",
    "clicks": "clicks",
    "total conversions": "conversions",
    "total conversion value": "revenue",
    "roas": "returnOnSpend",
    "ctr": "clickThroughRate",
    "ectr": "clickThroughRate",
    "cpa": "costPerResult",
    "date": "date",
  },
  snapchat: {
    "campaign id": "campaignId",
    "campaign name": "campaignName",
    "spend": "spend",
    "amount spent": "spend",
    "impressions": "impressions",
    "swipe ups": "clicks",
    "clicks": "clicks",
    "conversions": "conversions",
    "purchases": "conversions",
    "roas": "returnOnSpend",
    "swipe up rate": "clickThroughRate",
    "ecpa": "costPerResult",
    "daily budget": "dailyBudget",
    "start date": "date",
    "date": "date",
  },
  dv360: {
    "advertiser id": "campaignId",
    "campaign id": "campaignId",
    "insertion order id": "campaignId",
    "line item id": "campaignId",
    "advertiser": "campaignName",
    "campaign": "campaignName",
    "insertion order": "campaignName",
    "line item": "campaignName",
    "media cost (advertiser currency)": "spend",
    "total media cost": "spend",
    "revenue (adv currency)": "revenue",
    "total conversions": "conversions",
    "impressions": "impressions",
    "clicks": "clicks",
    "ctr": "clickThroughRate",
    "total reach": "impressions",
    "environment": "location",         // App vs Web
    "exchange": "location",            // Exchange name
    "app/url": "location",
    "device type": "location",
    "date": "date",
    "day": "date",
  },
};

/**
 * Detect which platform a file likely came from based on its column headers.
 */
export function detectPlatform(headers: string[]): string {
  const normalized = headers.map(h => h.toLowerCase().trim());

  const scores: Record<string, number> = {};
  for (const [platform, mapping] of Object.entries(COLUMN_MAPS)) {
    const matched = normalized.filter(h => h in mapping).length;
    scores[platform] = matched;
  }

  // Platform-specific signals
  if (normalized.some(h => h.includes("result rate") || h.includes("purchase roas"))) scores.meta = (scores.meta || 0) + 5;
  if (normalized.some(h => h.includes("impr.") || h.includes("conv. value / cost"))) scores.google = (scores.google || 0) + 5;
  if (normalized.some(h => h.includes("engagement rate") || h.includes("campaign group"))) scores.linkedin = (scores.linkedin || 0) + 5;
  if (normalized.some(h => h.includes("swipe up"))) scores.snapchat = (scores.snapchat || 0) + 5;
  if (normalized.some(h => h.includes("total complete payment roas"))) scores.tiktok = (scores.tiktok || 0) + 5;
  if (normalized.some(h => h.includes("outbound click") || h.includes("ectr"))) scores.pinterest = (scores.pinterest || 0) + 5;
  if (normalized.some(h => h.includes("insertion order") || h.includes("line item") || h.includes("media cost") || h.includes("exchange"))) scores.dv360 = (scores.dv360 || 0) + 5;
  if (normalized.some(h => h.includes("outbound click") || h.includes("ectr"))) scores.pinterest = (scores.pinterest || 0) + 5;

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : "unknown";
}

/**
 * Transform raw rows into unified format using the metric bridge.
 */
export function bridgeRows(
  rawRows: Record<string, string>[],
  platform: string,
  sourceFile: string
): UnifiedRow[] {
  const mapping = COLUMN_MAPS[platform] || {};
  const headerMap: Record<string, string> = {};

  if (rawRows.length === 0) return [];

  // Build header mapping from first row's keys
  const rawHeaders = Object.keys(rawRows[0]);
  for (const header of rawHeaders) {
    const normalized = header.toLowerCase().trim();
    if (normalized in mapping) {
      headerMap[header] = mapping[normalized];
    }
  }

  return rawRows.map((row, idx) => {
    const unified: Record<string, string> = {};
    for (const [rawKey, unifiedKey] of Object.entries(headerMap)) {
      unified[unifiedKey] = row[rawKey] || "";
    }

    const toNum = (v: string | undefined) => {
      if (!v) return 0;
      const cleaned = v.replace(/[,$%]/g, "").trim();
      const n = parseFloat(cleaned);
      return isNaN(n) ? 0 : n;
    };

    const spend = toNum(unified.spend);
    const conversions = toNum(unified.conversions);
    const clicks = toNum(unified.clicks);
    const impressions = toNum(unified.impressions);

    return {
      campaignId: unified.campaignId || `${platform}_${idx}`,
      campaignName: unified.campaignName || "Unknown Campaign",
      platform,
      date: unified.date || undefined,
      spend,
      impressions,
      clicks,
      conversions,
      revenue: toNum(unified.revenue),
      engagementIndex: toNum(unified.engagementIndex) || (impressions > 0 ? (clicks / impressions) * 100 : 0),
      costPerResult: toNum(unified.costPerResult) || (conversions > 0 ? spend / conversions : 0),
      returnOnSpend: toNum(unified.returnOnSpend),
      clickThroughRate: toNum(unified.clickThroughRate) || (impressions > 0 ? (clicks / impressions) * 100 : 0),
      conversionRate: toNum(unified.conversionRate) || (clicks > 0 ? (conversions / clicks) * 100 : 0),
      dailyBudget: toNum(unified.dailyBudget),
      location: unified.location || undefined,
      sourceFile,
      sourceRow: idx + 2, // +2 for 1-indexed + header
      // AI-Ready fields
      bidStrategyType: unified.bidStrategyType || undefined,
      campaignType: unified.campaignType || undefined,
      adGroupName: unified.adGroupName || undefined,
      conversionValueRules: unified.conversionValueRules || undefined,
    };
  });
}

/**
 * The Google Join: Map daily budgets from Campaign-level report
 * to every row in a Geographic/Location report using Campaign ID.
 */
export function performGoogleJoin(
  campaignRows: UnifiedRow[],
  geoRows: UnifiedRow[]
): UnifiedRow[] {
  const budgetMap = new Map<string, number>();
  for (const row of campaignRows) {
    if (row.dailyBudget > 0) {
      budgetMap.set(row.campaignId, row.dailyBudget);
    }
  }

  return geoRows.map(row => ({
    ...row,
    dailyBudget: budgetMap.get(row.campaignId) || row.dailyBudget,
  }));
}

/**
 * Multi-pass join: Link all uploaded files by Campaign ID
 * Returns deduplicated, enriched rows.
 */
export function virtualJoin(allRows: UnifiedRow[]): {
  joined: UnifiedRow[];
  joinStats: { campaignCount: number; fileCount: number; geoSegments: number; linkRate: number };
} {
  const byCampaign = new Map<string, UnifiedRow[]>();
  const files = new Set<string>();

  for (const row of allRows) {
    files.add(row.sourceFile);
    const existing = byCampaign.get(row.campaignId) || [];
    existing.push(row);
    byCampaign.set(row.campaignId, existing);
  }

  // Enrich: if a campaign has budget from one file but not another, propagate it
  const joined: UnifiedRow[] = [];
  let geoSegments = 0;

  for (const [, rows] of byCampaign) {
    const budgets = rows.filter(r => r.dailyBudget > 0);
    const budget = budgets.length > 0 ? budgets[0].dailyBudget : 0;

    for (const row of rows) {
      if (row.location) geoSegments++;
      joined.push({
        ...row,
        dailyBudget: row.dailyBudget || budget,
      });
    }
  }

  const linkedCampaigns = [...byCampaign.values()].filter(rows =>
    new Set(rows.map(r => r.sourceFile)).size > 1
  ).length;

  return {
    joined,
    joinStats: {
      campaignCount: byCampaign.size,
      fileCount: files.size,
      geoSegments,
      linkRate: byCampaign.size > 0 ? Math.round((linkedCampaigns / byCampaign.size) * 100) : 0,
    },
  };
}
