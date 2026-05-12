/**
 * AI-Ready Audit Logic
 *
 * Detects PMax campaigns, VBB strategies, and AI-reliance levels
 * from Google Ads data. Produces warnings, score adjustments,
 * and auto-injected action items.
 */

import type { UnifiedRow } from "@/lib/metricBridge";

// ─── Types ───────────────────────────────────────────────────────────────

export interface AIAuditResult {
  hasPMax: boolean;
  hasVBB: boolean;
  hasManualCPC: boolean;
  visibilityScore: number;          // % of spend through PMax/Smart
  aiRelianceLevel: "low" | "medium" | "high" | "critical";
  pmaxCampaignCount: number;
  smartCampaignCount: number;
  totalGoogleCampaigns: number;
  assetGroupPenalties: AssetGroupPenalty[];
  vbbBoost: number;                 // +15% or 0
  warnings: AIWarning[];
  injectedActions: InjectedAction[];
  bidStrategies: Record<string, number>; // strategy → campaign count
}

export interface AssetGroupPenalty {
  campaignName: string;
  assetGroupCount: number;
  penalty: string;
}

export interface AIWarning {
  type: "info" | "warning" | "critical";
  title: string;
  message: string;
}

export interface InjectedAction {
  topic: string;
  category: string;
  maturity: string;
  priority: number;
  action: string;
}

// ─── Detection Helpers ───────────────────────────────────────────────────

function isPMaxCampaign(row: UnifiedRow): boolean {
  const name = row.campaignName.toLowerCase();
  return (
    name.includes("pmax") ||
    name.includes("performance max") ||
    name.includes("p-max") ||
    (row as any).campaignType?.toLowerCase() === "performance max" ||
    (row as any).campaignType?.toLowerCase() === "performance_max"
  );
}

function isSmartCampaign(row: UnifiedRow): boolean {
  const name = row.campaignName.toLowerCase();
  return (
    name.includes("smart") ||
    (row as any).campaignType?.toLowerCase() === "smart"
  );
}

function getBidStrategy(row: UnifiedRow): string {
  const strategy = ((row as any).bidStrategyType || "").toLowerCase().trim();
  if (!strategy) {
    // Infer from campaign name
    const name = row.campaignName.toLowerCase();
    if (name.includes("troas") || name.includes("target roas")) return "target roas";
    if (name.includes("tcpa") || name.includes("target cpa")) return "target cpa";
    if (name.includes("max conv") || name.includes("maximize conversion")) return "maximize conversions";
    if (name.includes("max value") || name.includes("maximize value")) return "maximize conversion value";
    if (name.includes("manual cpc") || name.includes("mcpc")) return "manual cpc";
    if (name.includes("ecpc") || name.includes("enhanced cpc")) return "enhanced cpc";
    return "unknown";
  }
  return strategy;
}

function isVBBStrategy(strategy: string): boolean {
  return (
    strategy.includes("target roas") ||
    strategy.includes("maximize conversion value") ||
    strategy.includes("max conv value")
  );
}

function isLegacyStrategy(strategy: string): boolean {
  return (
    strategy.includes("manual cpc") ||
    strategy.includes("manual cpv") ||
    strategy.includes("manual cpm")
  );
}

// ─── Main Analysis ───────────────────────────────────────────────────────

export function analyzeAIReadiness(rows: UnifiedRow[]): AIAuditResult {
  const googleRows = rows.filter(r => r.platform === "google");

  if (googleRows.length === 0) {
    return emptyResult();
  }

  // Dedupe campaigns
  const campaignMap = new Map<string, UnifiedRow[]>();
  for (const row of googleRows) {
    const key = row.campaignName || row.campaignId;
    const existing = campaignMap.get(key) || [];
    existing.push(row);
    campaignMap.set(key, existing);
  }

  const campaigns = [...campaignMap.entries()];
  const totalCampaigns = campaigns.length;

  let pmaxCount = 0;
  let smartCount = 0;
  let pmaxSpend = 0;
  let smartSpend = 0;
  let totalSpend = 0;
  const bidStrategies: Record<string, number> = {};
  const assetGroupPenalties: AssetGroupPenalty[] = [];

  for (const [name, campRows] of campaigns) {
    const campSpend = campRows.reduce((s, r) => s + r.spend, 0);
    totalSpend += campSpend;

    const isPmax = campRows.some(isPMaxCampaign);
    const isSmart = campRows.some(isSmartCampaign);

    if (isPmax) {
      pmaxCount++;
      pmaxSpend += campSpend;

      // Asset Group check: unique "ad group" or asset group entries
      const uniqueGroups = new Set(campRows.map(r => (r as any).adGroupName || r.campaignId));
      if (uniqueGroups.size <= 1) {
        assetGroupPenalties.push({
          campaignName: name,
          assetGroupCount: uniqueGroups.size,
          penalty: "Creative Diversity — only 1 Asset Group detected",
        });
      }
    }

    if (isSmart) {
      smartCount++;
      smartSpend += campSpend;
    }

    // Bid strategy
    const strategy = getBidStrategy(campRows[0]);
    bidStrategies[strategy] = (bidStrategies[strategy] || 0) + 1;
  }

  const hasPMax = pmaxCount > 0;
  const aiSpend = pmaxSpend + smartSpend;
  const visibilityScore = totalSpend > 0 ? Math.round((aiSpend / totalSpend) * 100) : 0;

  // VBB detection
  const vbbStrategies = Object.entries(bidStrategies).filter(([s]) => isVBBStrategy(s));
  const hasVBB = vbbStrategies.length > 0;
  const vbbBoost = hasVBB ? 15 : 0;

  // Legacy detection
  const legacyStrategies = Object.entries(bidStrategies).filter(([s]) => isLegacyStrategy(s));
  const hasManualCPC = legacyStrategies.length > 0;

  // AI reliance level
  const aiRelianceLevel: AIAuditResult["aiRelianceLevel"] =
    visibilityScore > 80 ? "critical" :
    visibilityScore > 60 ? "high" :
    visibilityScore > 30 ? "medium" : "low";

  // Build warnings
  const warnings: AIWarning[] = [];

  if (aiRelianceLevel === "critical") {
    warnings.push({
      type: "critical",
      title: "High AI-Reliance Detected",
      message: `${visibilityScore}% of Google Ads spend flows through PMax/Smart campaigns. Ensure first-party data signals are robust to maintain steering quality. Consider brand exclusions and audience signal diversification.`,
    });
  } else if (aiRelianceLevel === "high") {
    warnings.push({
      type: "warning",
      title: "Elevated AI Spend",
      message: `${visibilityScore}% of spend is AI-driven (PMax/Smart). Monitor search term visibility and ensure proper conversion value rules are configured.`,
    });
  }

  if (hasManualCPC) {
    const legacyCount = legacyStrategies.reduce((s, [, c]) => s + c, 0);
    warnings.push({
      type: "warning",
      title: "Legacy Bid Strategy Detected",
      message: `${legacyCount} campaign${legacyCount > 1 ? "s" : ""} still use Manual CPC. Consider migrating to Value-Based Bidding (Target ROAS / Maximize Conversion Value) for improved AI optimization.`,
    });
  }

  for (const penalty of assetGroupPenalties) {
    warnings.push({
      type: "warning",
      title: `Creative Diversity Issue — ${penalty.campaignName}`,
      message: `Only ${penalty.assetGroupCount} Asset Group detected. PMax campaigns benefit from 3-5 diverse Asset Groups with varied creative themes.`,
    });
  }

  if (hasVBB) {
    warnings.push({
      type: "info",
      title: "Value-Based Bidding Active",
      message: `VBB detected across ${vbbStrategies.reduce((s, [, c]) => s + c, 0)} campaigns. Strategic Maturity boosted by +15%. Ensure conversion value rules and profit margins are correctly configured.`,
    });
  }

  // PMax action items
  const injectedActions: InjectedAction[] = [];
  if (hasPMax) {
    injectedActions.push(
      {
        topic: "Implement Brand Exclusions to protect organic equity",
        category: "PMax Optimization",
        maturity: "Advanced",
        priority: 25,
        action: "Add brand keyword exclusions at the account or campaign level to prevent PMax from cannibalizing branded search traffic.",
      },
      {
        topic: "Audit Video Assets to avoid auto-generated 'Slideshow' ads",
        category: "PMax Optimization",
        maturity: "Expert",
        priority: 20,
        action: "Upload dedicated video creatives (15s + 30s) for each Asset Group. Without them, Google auto-generates low-quality slideshow videos.",
      },
      {
        topic: "Connect Offline Conversion tracking to provide 'Profit' signals to the AI",
        category: "PMax Optimization",
        maturity: "Champion",
        priority: 22,
        action: "Set up Offline Conversion Import (OCI) or Enhanced Conversions for Leads to feed profit-level data back to Google's AI for better optimization.",
      },
    );
  }

  if (hasManualCPC) {
    injectedActions.push({
      topic: "Migrate from Manual CPC to Smart Bidding",
      category: "Bid Strategy",
      maturity: "Basic",
      priority: 27,
      action: "Transition Manual CPC campaigns to Target ROAS or Maximize Conversion Value. Run a 2-week test with a 10% budget allocation before full migration.",
    });
  }

  return {
    hasPMax,
    hasVBB,
    hasManualCPC,
    visibilityScore,
    aiRelianceLevel,
    pmaxCampaignCount: pmaxCount,
    smartCampaignCount: smartCount,
    totalGoogleCampaigns: totalCampaigns,
    assetGroupPenalties,
    vbbBoost,
    warnings,
    injectedActions,
    bidStrategies,
  };
}

function emptyResult(): AIAuditResult {
  return {
    hasPMax: false,
    hasVBB: false,
    hasManualCPC: false,
    visibilityScore: 0,
    aiRelianceLevel: "low",
    pmaxCampaignCount: 0,
    smartCampaignCount: 0,
    totalGoogleCampaigns: 0,
    assetGroupPenalties: [],
    vbbBoost: 0,
    warnings: [],
    injectedActions: [],
    bidStrategies: {},
  };
}
