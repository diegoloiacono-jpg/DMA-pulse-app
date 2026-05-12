/**
 * Audit Criteria Scoring Engine
 *
 * Converts the static DMA audit data into a live, interactive scoring system.
 * Each topic can be manually scored 0–3 (Not Set → Champion).
 * Scores flow into platform health bars + spider chart via weighted averages,
 * with business-model multipliers applied to category weights.
 *
 * Hybrid Logic: Blends 50% Data-Verified + 50% Consultant-Verified scores.
 * Non-CSV-verifiable topics (e.g. DV360 "Sellers.json", "Frequency Caps")
 * are flagged as "attestation-required" and scored only via manual toggles.
 */

import type { Platform, PlatformCategory, MaturityLevel } from "@/data/auditData";
import type { BusinessModel } from "./brandContext";
import type { UnifiedRow } from "@/lib/metricBridge";

// ─── Manual Score Scale ──────────────────────────────────────────────────
export type ManualScore = 0 | 1 | 2 | 3;

export const SCORE_LABELS: Record<ManualScore, string> = {
  0: "Not Set",
  1: "Basic",
  2: "Advanced",
  3: "Expert / Champion",
};

export const SCORE_TO_MATURITY: Record<ManualScore, MaturityLevel | null> = {
  0: null,
  1: "Basic",
  2: "Advanced",
  3: "Champion",
};

/** Composite key: "platformId::categoryName::topicId" */
export type ScoreKey = string;

export function makeScoreKey(platformId: string, categoryName: string, topicId: number): ScoreKey {
  return `${platformId}::${categoryName}::${topicId}`;
}

/** All manual scores keyed by composite key */
export type ManualScoreMap = Record<ScoreKey, ManualScore>;

// ─── Attestation: topics that cannot be verified from CSV data ───────────

/**
 * Topics containing these keywords are flagged as "attestation-required" —
 * they represent platform configurations, policies, or setups that
 * don't appear in standard CSV exports.
 */
const ATTESTATION_KEYWORDS = [
  "sellers.json", "frequency", "brand safety", "inclusion list", "exclusion list",
  "naming convention tool", "sdf files", "floodlight", "cm360", "rich media",
  "hpto", "interscroller", "dco", "brand lift", "attribution model",
  "dda model", "custom attribution", "ad-sequen", "grasp",
  "deals", "guaranteed deal", "private deal", "inventory buying",
  "predictive audiences", "bqml", "crm list", "real time crm",
  "consent mode", "enhanced conversion", "server-side", "offline conversion",
  "google tag", "gtm", "pixel", "capi", "conversion api",
];

export function isAttestationRequired(topicText: string, platformId: string): boolean {
  const lower = topicText.toLowerCase();
  // All DV360 topics default to attestation unless clearly metric-based
  if (platformId === "dv360") {
    const metricKeywords = ["spend", "impression", "click", "conversion", "cpa", "roas", "budget"];
    if (metricKeywords.some(k => lower.includes(k))) return false;
    return true;
  }
  return ATTESTATION_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── DV360 Warnings ─────────────────────────────────────────────────────

export interface DV360Warning {
  type: "high-priority";
  title: string;
  message: string;
}

/**
 * Detect DV360-specific issues from uploaded data.
 * If App spend > 90% and model is B2B → high-priority warning.
 */
export function getDV360Warnings(
  rows: UnifiedRow[],
  model: BusinessModel,
): DV360Warning[] {
  const warnings: DV360Warning[] = [];
  const dv360Rows = rows.filter(r => r.platform === "dv360" || r.platform === "google");

  if (dv360Rows.length === 0) return warnings;

  // Check for App vs Web distribution using location/campaign name heuristics
  const appRows = dv360Rows.filter(r => {
    const name = r.campaignName.toLowerCase();
    return name.includes("app") || name.includes("mobile app") || name.includes("in-app");
  });

  const totalSpend = dv360Rows.reduce((s, r) => s + r.spend, 0);
  const appSpend = appRows.reduce((s, r) => s + r.spend, 0);

  if (totalSpend > 0 && appSpend / totalSpend > 0.9 && model === "B2B") {
    warnings.push({
      type: "high-priority",
      title: "App Spend Anomaly — B2B",
      message: `${Math.round((appSpend / totalSpend) * 100)}% of DV360 spend is on App inventory. For B2B, this typically indicates wasted budget — consider shifting to Web-only exchanges.`,
    });
  }

  return warnings;
}

// ─── Business Model Weight Multipliers ───────────────────────────────────

const B2B_BOOSTS: Record<string, number> = {
  "conversion & kpi": 1.5,
  "lead": 1.5,
  "audiences / targeting": 1.3,
  "bid & budget": 1.2,
  "attribution model": 1.3,
};

const B2C_D2C_BOOSTS: Record<string, number> = {
  "feed": 1.5,
  "e-commerce": 1.5,
  "ecommerce": 1.5,
  "shopping": 1.5,
  "creative": 1.3,
  "ad copy": 1.3,
  "conversion & kpi": 1.2,
  "audiences / targeting": 1.2,
  "creatives": 1.3,
};

function getCategoryMultiplier(categoryName: string, model: BusinessModel): number {
  const lower = categoryName.toLowerCase();
  const boosts = model === "B2B" ? B2B_BOOSTS : (model === "B2C" || model === "D2C") ? B2C_D2C_BOOSTS : {};

  for (const [keyword, mult] of Object.entries(boosts)) {
    if (lower.includes(keyword)) return mult;
  }
  return 1.0;
}

// ─── Scoring Functions ───────────────────────────────────────────────────

/** Score a single category (0–100) from manual scores */
export function scoreCategoryManual(
  platformId: string,
  category: PlatformCategory,
  scores: ManualScoreMap,
): number {
  if (category.topics.length === 0) return 0;

  let totalPoints = 0;
  let maxPoints = 0;

  for (const topic of category.topics) {
    const key = makeScoreKey(platformId, category.name, topic.id);
    const score = scores[key] ?? 0;
    totalPoints += score;
    maxPoints += 3; // max per topic
  }

  return maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
}

/** Score an entire platform (weighted average across categories, with business model multipliers) */
export function scorePlatformManual(
  platform: Platform,
  scores: ManualScoreMap,
  model: BusinessModel,
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const cat of platform.categories) {
    const catScore = scoreCategoryManual(platform.id, cat, scores);
    const multiplier = getCategoryMultiplier(cat.name, model);
    const adjustedWeight = cat.weight * multiplier;

    totalWeight += adjustedWeight;
    weightedSum += catScore * adjustedWeight;
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

/** Score all platforms → omnichannel average */
export function scoreOmnichannelManual(
  platforms: Platform[],
  scores: ManualScoreMap,
  model: BusinessModel,
): number {
  if (platforms.length === 0) return 0;
  const total = platforms.reduce((s, p) => s + scorePlatformManual(p, scores, model), 0);
  return Math.round(total / platforms.length);
}

/** Get per-category scores for spider chart — uses pass-rate (score >= 2 = passed) to match CategoryBreakdown */
export function getCategoryScoresForRadar(
  platform: Platform,
  scores: ManualScoreMap,
): Array<{ id: number; name: string; weight: number; score: number; topics: [] }> {
  return platform.categories.map((cat, i) => ({
    id: i,
    name: cat.name,
    weight: cat.weight,
    score: getCategoryPassRate(platform.id, cat, scores),
    topics: [] as [],
  }));
}

/** Calculate category pass rate (0–100): % of topics with manual score >= 2 OR static pass.
 *  This is the single source of truth used by both Radar Chart and Category Breakdown. */
export function getCategoryPassRate(
  platformId: string,
  category: PlatformCategory,
  scores: ManualScoreMap,
): number {
  if (category.topics.length === 0) return 0;
  let passed = 0;
  for (const topic of category.topics) {
    const key = makeScoreKey(platformId, category.name, topic.id);
    const manualScore = scores[key];
    if (manualScore !== undefined && manualScore >= 2) {
      passed++;
    } else if (manualScore === undefined) {
      // Fallback to static scores
      const vals = Object.values(topic.scores).filter(v => v !== null);
      if (vals.length > 0 && vals.every(v => v)) passed++;
    }
  }
  return Math.round((passed / category.topics.length) * 100);
}

/** Check if any manual scores exist */
export function hasManualScores(scores: ManualScoreMap): boolean {
  return Object.values(scores).some(v => v > 0);
}

/** Count scored vs total topics for a platform */
export function getScoredCount(
  platform: Platform,
  scores: ManualScoreMap,
): { scored: number; total: number } {
  let scored = 0;
  let total = 0;

  for (const cat of platform.categories) {
    for (const topic of cat.topics) {
      total++;
      const key = makeScoreKey(platform.id, cat.name, topic.id);
      if ((scores[key] ?? 0) > 0) scored++;
    }
  }

  return { scored, total };
}

// ─── Confidence Score ────────────────────────────────────────────────────

export type ConfidenceLevel = "high" | "medium" | "low" | "none";

export interface ConfidenceInfo {
  level: ConfidenceLevel;
  label: string;
  dataPercent: number;   // % of score backed by CSV data
  manualPercent: number; // % from manual attestation
}

/**
 * Compute confidence level for a platform's audit.
 * High = mostly CSV-backed, Low = mostly manual toggles.
 */
export function getConfidence(
  platformId: string,
  hasUploadedData: boolean,
  manualScores: ManualScoreMap,
  platform: Platform,
): ConfidenceInfo {
  const { scored, total } = getScoredCount(platform, manualScores);
  const manualRatio = total > 0 ? scored / total : 0;

  if (hasUploadedData && manualRatio > 0.5) {
    return { level: "high", label: "High Confidence", dataPercent: 60, manualPercent: 40 };
  }
  if (hasUploadedData && manualRatio <= 0.5) {
    return { level: "medium", label: "Medium Confidence", dataPercent: 70, manualPercent: 30 };
  }
  if (!hasUploadedData && manualRatio > 0.3) {
    return { level: "low", label: "Low Confidence", dataPercent: 0, manualPercent: 100 };
  }
  return { level: "none", label: "Not Assessed", dataPercent: 0, manualPercent: 0 };
}
