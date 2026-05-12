/**
 * Dashboard Logic — the "Validation Linker" that connects Brand Context
 * settings to the live dashboard, audit table, and spider chart.
 *
 * 1. Platform Health: consistency score from naming convention matching
 * 2. Market Tagging: ISO code extraction from campaign names
 * 3. Business Model sorting for Priority Action Items
 * 4. UI Sync helpers for header badge + radar chart
 */

import type { UnifiedRow } from "@/lib/metricBridge";
import type { BrandContext } from "./brandContext";
import type { PlatformTopic } from "@/data/auditData";

// ─── ISO market codes we look for in campaign names ──────────────────────
const KNOWN_MARKETS = ["FR", "NL", "DE", "ES", "UK", "US", "IT", "BE", "CH", "AT", "AU", "CA", "SE", "DK", "NO", "PL"] as const;
export type MarketCode = (typeof KNOWN_MARKETS)[number];

// ─── Types ───────────────────────────────────────────────────────────────

export interface NamingResult {
  campaignName: string;
  segments: Record<string, string>;  // key → parsed value
  matches: boolean;
  namingError: boolean;
}

export interface PlatformConsistencyScore {
  platform: string;
  totalCampaigns: number;
  matchingCampaigns: number;
  score: number;                     // 0–100
  marketPresence: Record<string, boolean>; // ISO code → found & valid
  namingResults: NamingResult[];
}

export interface DashboardState {
  consistencyScores: Record<string, PlatformConsistencyScore>;
  overallMaturity: number;           // weighted omnichannel %
  marketHealth: Record<string, boolean>; // global market tag status
}

// ─── 1. Naming Convention Regex Parser ───────────────────────────────────

/**
 * Converts a user-defined naming convention like "[Market]_[Funnel]_[Objective]"
 * into an array of segment keys and detects the delimiter.
 */
export function parseNamingPattern(convention: string): {
  keys: string[];
  delimiter: string;
} {
  if (!convention.trim()) return { keys: [], delimiter: "_" };

  // Detect delimiter: __ (double underscore), _ (single), or -
  let delimiter = "_";
  if (convention.includes("__")) delimiter = "__";
  else if (convention.includes("-") && !convention.includes("_")) delimiter = "-";

  // Extract keys from [Key] or plain segments
  const segments = convention.split(delimiter);
  const keys = segments.map(s => {
    const match = s.match(/\[(.+?)\]/);
    return match ? match[1] : s.trim();
  }).filter(Boolean);

  return { keys, delimiter };
}

/**
 * Parse a single campaign name against the naming convention.
 */
export function parseCampaignName(
  campaignName: string,
  convention: string
): NamingResult {
  const { keys, delimiter } = parseNamingPattern(convention);

  if (keys.length === 0) {
    return { campaignName, segments: {}, matches: true, namingError: false };
  }

  const parts = campaignName.split(delimiter);
  const segments: Record<string, string> = {};

  if (parts.length < keys.length) {
    // Not enough segments → naming error
    keys.forEach((k, i) => { segments[k] = parts[i] || ""; });
    return { campaignName, segments, matches: false, namingError: true };
  }

  keys.forEach((k, i) => { segments[k] = parts[i] || ""; });
  return { campaignName, segments, matches: true, namingError: false };
}

// ─── 2. Market Tagging ───────────────────────────────────────────────────

/**
 * Extract ISO market codes from campaign names. Checks both the first
 * segment (e.g. "FR_TOF_...") and parsed Market segment.
 */
export function extractMarkets(rows: UnifiedRow[], convention: string): Record<string, boolean> {
  const presence: Record<string, boolean> = {};
  for (const code of KNOWN_MARKETS) {
    presence[code] = false;
  }

  for (const row of rows) {
    const parsed = parseCampaignName(row.campaignName, convention);
    const marketValue = (parsed.segments["Market"] || parsed.segments["market"] || "").toUpperCase();

    // Check if market value is a known code
    if (KNOWN_MARKETS.includes(marketValue as MarketCode)) {
      // Only mark green if the campaign also matches naming convention
      if (parsed.matches) {
        presence[marketValue] = true;
      }
    }

    // Also check first 2-3 chars of campaign name as fallback
    const prefix = row.campaignName.toUpperCase().slice(0, 3).replace(/[^A-Z]/g, "").slice(0, 2);
    if (KNOWN_MARKETS.includes(prefix as MarketCode) && parsed.matches) {
      presence[prefix] = true;
    }
  }

  return presence;
}

// ─── 3. Platform Consistency Score ───────────────────────────────────────

/**
 * For a single platform's rows, compute the consistency score:
 * score = (campaigns matching naming convention / total campaigns) * 100
 */
export function computePlatformConsistency(
  rows: UnifiedRow[],
  platform: string,
  convention: string
): PlatformConsistencyScore {
  // Deduplicate by campaign name
  const uniqueNames = [...new Set(rows.map(r => r.campaignName))];

  const namingResults = uniqueNames.map(name => parseCampaignName(name, convention));
  const matching = namingResults.filter(r => r.matches).length;
  const score = uniqueNames.length > 0 ? Math.round((matching / uniqueNames.length) * 100) : 0;

  const marketPresence = extractMarkets(rows, convention);

  return {
    platform,
    totalCampaigns: uniqueNames.length,
    matchingCampaigns: matching,
    score,
    marketPresence,
    namingResults,
  };
}

// ─── 4. Business Model Sort Order ────────────────────────────────────────

/**
 * Returns a category priority order based on the business model.
 * Lower number = higher priority in the action items table.
 */
function getCategoryPriority(categoryName: string, model: string): number {
  const name = categoryName.toLowerCase();

  if (model === "B2B") {
    if (name.includes("conversion") || name.includes("kpi")) return 0;
    if (name.includes("lead")) return 1;
    if (name.includes("audience") || name.includes("targeting")) return 2;
    if (name.includes("bid") || name.includes("budget")) return 3;
  }

  if (model === "D2C" || model === "B2C") {
    if (name.includes("feed") || name.includes("e-commerce") || name.includes("ecommerce") || name.includes("shopping")) return 0;
    if (name.includes("conversion") || name.includes("kpi")) return 1;
    if (name.includes("creative") || name.includes("ad copy")) return 2;
    if (name.includes("audience") || name.includes("targeting")) return 3;
  }

  return 10; // default
}

/**
 * Sort action items based on business model weighting.
 */
export function sortActionItems<T extends { category: string; maturity: string }>(
  items: T[],
  model: string
): T[] {
  const maturityOrder: Record<string, number> = { Champion: 0, Expert: 1, Advanced: 2, Basic: 3 };

  return [...items].sort((a, b) => {
    // Primary: business model category priority
    const catDiff = getCategoryPriority(a.category, model) - getCategoryPriority(b.category, model);
    if (catDiff !== 0) return catDiff;
    // Secondary: maturity level
    return (maturityOrder[a.maturity] ?? 4) - (maturityOrder[b.maturity] ?? 4);
  });
}

// ─── 5. Full Dashboard State Computation ─────────────────────────────────

/**
 * Master function: takes all uploaded data + brand context, returns
 * everything the dashboard needs to render dynamic scores.
 */
export function computeDashboardState(
  allRows: UnifiedRow[],
  brandContext: BrandContext
): DashboardState {
  // Group rows by platform
  const byPlatform = new Map<string, UnifiedRow[]>();
  for (const row of allRows) {
    const existing = byPlatform.get(row.platform) || [];
    existing.push(row);
    byPlatform.set(row.platform, existing);
  }

  // Compute per-platform consistency
  const consistencyScores: Record<string, PlatformConsistencyScore> = {};
  for (const [platform, rows] of byPlatform) {
    consistencyScores[platform] = computePlatformConsistency(
      rows,
      platform,
      brandContext.namingConvention
    );
  }

  // Aggregate market presence across all platforms
  const globalMarkets: Record<string, boolean> = {};
  for (const code of KNOWN_MARKETS) {
    globalMarkets[code] = Object.values(consistencyScores).some(
      cs => cs.marketPresence[code]
    );
  }

  // Weighted maturity: Data Consistency 30%, Strategic Alignment 40%, Best Practices 30%
  const platformScores = Object.values(consistencyScores);
  const avgConsistency = platformScores.length > 0
    ? platformScores.reduce((s, p) => s + p.score, 0) / platformScores.length
    : 0;

  // Strategic alignment: bonus if uploaded platforms match model priorities
  const strategicScore = computeStrategicAlignment(consistencyScores, brandContext.model);

  // Best practices: base from static audit data (kept as-is from auditData)
  // We'll blend in the static omnichannelScore later in the UI
  const bestPractices = 50; // baseline; the static audit data provides the real value

  const overallMaturity = Math.round(
    avgConsistency * 0.3 +
    strategicScore * 0.4 +
    bestPractices * 0.3
  );

  return {
    consistencyScores,
    overallMaturity,
    marketHealth: globalMarkets,
  };
}

/**
 * Strategic alignment score: are the "right" platforms being used
 * and are they well-structured?
 */
function computeStrategicAlignment(
  scores: Record<string, PlatformConsistencyScore>,
  model: string
): number {
  const priorityPlatforms: Record<string, string[]> = {
    B2B: ["google", "linkedin", "bing"],
    B2C: ["meta", "google", "tiktok", "pinterest"],
    D2C: ["meta", "tiktok", "google", "pinterest"],
  };

  const priorities = priorityPlatforms[model] || Object.keys(scores);
  if (priorities.length === 0) return 50;

  let totalWeight = 0;
  let weightedScore = 0;

  for (let i = 0; i < priorities.length; i++) {
    const weight = priorities.length - i; // higher priority = higher weight
    const cs = scores[priorities[i]];
    if (cs) {
      totalWeight += weight;
      weightedScore += cs.score * weight;
    } else {
      // Platform not uploaded — penalize
      totalWeight += weight;
      weightedScore += 0;
    }
  }

  return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 50;
}

// ─── 6. Market Tag Status for Audit Table ────────────────────────────────

/**
 * For a given market code and platform, check if that market
 * has valid campaign data with correct naming.
 */
export function getMarketTagStatus(
  marketCode: string,
  dashboardState: DashboardState | null
): "pass" | "fail" | "unknown" {
  if (!dashboardState) return "unknown";
  const code = marketCode.toUpperCase();
  if (code in dashboardState.marketHealth) {
    return dashboardState.marketHealth[code] ? "pass" : "fail";
  }
  return "unknown";
}
