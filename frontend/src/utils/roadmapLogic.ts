/**
 * Roadmap Logic — Prioritization Engine
 *
 * Assigns Impact (1-10) and Effort (1-10) to every audit topic,
 * then computes Priority = Impact² / Effort to surface Quick Wins.
 * Business model calibration boosts relevant categories by +3 Impact.
 */

import type { Platform, PlatformTopic, MaturityLevel } from "@/data/auditData";
import type { BusinessModel } from "./brandContext";
import { type ManualScoreMap, makeScoreKey } from "./auditCriteria";

// ─── Impact & Effort Heuristics ──────────────────────────────────────────

/** Base impact by maturity level — Basic items have most room for improvement */
const MATURITY_IMPACT: Record<MaturityLevel, number> = {
  Basic: 8,
  Advanced: 6,
  Expert: 4,
  Champion: 3,
};

/** Base effort by maturity level — Basic is easiest to fix */
const MATURITY_EFFORT: Record<MaturityLevel, number> = {
  Basic: 3,
  Advanced: 5,
  Expert: 7,
  Champion: 9,
};

/** Category-specific impact adjustments */
const CATEGORY_IMPACT: Record<string, number> = {
  "conversion & kpi": 9,
  "conversion & kpis": 9,
  "keywords": 7,
  "audiences / targeting": 7,
  "audiences & targeting": 7,
  "targeting": 7,
  "bid management": 6,
  "feed quality and gmc": 8,
  "feeds & catalogs": 8,
  "pmax for shopping": 7,
  "creative & content": 6,
  "creatives": 6,
  "message": 5,
  "extensions": 5,
  "automation": 6,
  "attribution model": 7,
  "attribution": 7,
  "campaign setup": 6,
  "reporting": 4,
};

/** Category-specific effort adjustments */
const CATEGORY_EFFORT: Record<string, number> = {
  "conversion & kpi": 4,
  "conversion & kpis": 4,
  "keywords": 4,
  "extensions": 2,
  "bid management": 5,
  "feed quality and gmc": 7,
  "feeds & catalogs": 6,
  "pmax for shopping": 6,
  "creative & content": 6,
  "creatives": 6,
  "automation": 7,
  "attribution model": 8,
  "attribution": 8,
  "campaign setup": 3,
  "reporting": 3,
  "targeting": 5,
  "audiences / targeting": 5,
  "audiences & targeting": 5,
  "message": 4,
};

/** B2B impact boosts (+3) */
const B2B_BOOST_CATEGORIES = [
  "conversion & kpi", "conversion & kpis",
  "audiences / targeting", "audiences & targeting", "targeting",
  "attribution model", "attribution",
];

/** D2C/B2C impact boosts (+3) */
const D2C_BOOST_CATEGORIES = [
  "feed quality and gmc", "feeds & catalogs", "pmax for shopping",
  "creative & content", "creatives", "message",
];

// ─── Scoring ─────────────────────────────────────────────────────────────

export interface PrioritizedItem {
  topic: string;
  category: string;
  platformId: string;
  platformName: string;
  maturity: MaturityLevel;
  topicId: number;
  impact: number;
  effort: number;
  priorityScore: number;
  potentialIncrease: number; // estimated maturity % increase
  scores: Record<string, boolean | null>;
  details: string;
  action: string;
}

export type FilterMode = "all" | "quick-wins" | "big-bets";

function getImpact(categoryName: string, maturity: MaturityLevel, model: BusinessModel): number {
  const lower = categoryName.toLowerCase();
  let base = CATEGORY_IMPACT[lower] ?? MATURITY_IMPACT[maturity];

  // Business model calibration
  if (model === "B2B" && B2B_BOOST_CATEGORIES.some(c => lower.includes(c))) {
    base = Math.min(base + 3, 10);
  }
  if ((model === "D2C" || model === "B2C") && D2C_BOOST_CATEGORIES.some(c => lower.includes(c))) {
    base = Math.min(base + 3, 10);
  }

  return base;
}

function getEffort(categoryName: string, maturity: MaturityLevel): number {
  const lower = categoryName.toLowerCase();
  return CATEGORY_EFFORT[lower] ?? MATURITY_EFFORT[maturity];
}

function calcPriority(impact: number, effort: number): number {
  return effort > 0 ? Math.round((impact * impact / effort) * 10) / 10 : 0;
}

/** Estimate the maturity % increase if this item is fixed (scored to Champion) */
function estimateIncrease(platform: Platform, categoryName: string): number {
  const cat = platform.categories.find(c => c.name === categoryName);
  if (!cat || cat.topics.length === 0) return 0;
  // Each topic at Champion adds 3/3 = 100% for that slot
  // Category contribution = weight / totalWeight * (1/totalTopics * 100)
  const totalWeight = platform.categories.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return 0;
  const catContribution = (cat.weight / totalWeight) * 100;
  const perTopicContribution = catContribution / cat.topics.length;
  return Math.round(perTopicContribution * 10) / 10;
}

// ─── Main Functions ──────────────────────────────────────────────────────

/** Build prioritized list from all platforms */
export function buildPrioritizedItems(
  platforms: Platform[],
  model: BusinessModel,
  manualScores: ManualScoreMap = {},
): PrioritizedItem[] {
  const items: PrioritizedItem[] = [];

  for (const p of platforms) {
    for (const c of p.categories) {
      for (const t of c.topics) {
        const impact = getImpact(c.name, t.maturity, model);
        const effort = getEffort(c.name, t.maturity);
        const priorityScore = calcPriority(impact, effort);
        const potentialIncrease = estimateIncrease(p, c.name);

        items.push({
          topic: t.topic,
          category: c.name,
          platformId: p.id,
          platformName: p.shortName,
          maturity: t.maturity,
          topicId: t.id,
          impact,
          effort,
          priorityScore,
          potentialIncrease,
          scores: t.scores,
          details: t.details,
          action: t.action,
        });
      }
    }
  }

  // Sort by priority score descending
  return items.sort((a, b) => b.priorityScore - a.priorityScore);
}

/** Get top N unscored items — one per platform for cross-platform diversity */
export function getTopStrategicWins(
  platforms: Platform[],
  model: BusinessModel,
  manualScores: ManualScoreMap,
  count: number = 3,
): PrioritizedItem[] {
  const all = buildPrioritizedItems(platforms, model, manualScores);

  // Filter to unscored items
  const unscored = all.filter(item => {
    const key = makeScoreKey(item.platformId, item.category, item.topicId);
    return (manualScores[key] ?? 0) === 0;
  });

  // Pick the highest-impact item from each unique platform
  const seenPlatforms = new Set<string>();
  const diverseWins: PrioritizedItem[] = [];

  for (const item of unscored) {
    if (diverseWins.length >= count) break;
    if (seenPlatforms.has(item.platformId)) continue;
    seenPlatforms.add(item.platformId);
    diverseWins.push(item);
  }

  // If we couldn't fill from unique platforms, pad with remaining top items
  if (diverseWins.length < count) {
    for (const item of unscored) {
      if (diverseWins.length >= count) break;
      if (!diverseWins.includes(item)) {
        diverseWins.push(item);
      }
    }
  }

  return diverseWins;
}

/** One top win per platform — ranked by Priority (Impact² / Effort), unscored only */
export function getTopWinPerPlatform(
  platforms: Platform[],
  model: BusinessModel,
  manualScores: ManualScoreMap,
): PrioritizedItem[] {
  const all = buildPrioritizedItems(platforms, model, manualScores);
  const unscored = all.filter(item => {
    const key = makeScoreKey(item.platformId, item.category, item.topicId);
    return (manualScores[key] ?? 0) === 0;
  });

  const bestByPlatform = new Map<string, PrioritizedItem>();
  for (const item of unscored) {
    const existing = bestByPlatform.get(item.platformId);
    if (!existing || item.priorityScore > existing.priorityScore) {
      bestByPlatform.set(item.platformId, item);
    }
  }

  // Preserve platform order from input
  return platforms
    .map(p => bestByPlatform.get(p.id))
    .filter((x): x is PrioritizedItem => Boolean(x));
}

/** Filter items by mode */
export function filterByMode(items: PrioritizedItem[], mode: FilterMode): PrioritizedItem[] {
  switch (mode) {
    case "quick-wins":
      return items.filter(i => i.effort < 4);
    case "big-bets":
      return items.filter(i => i.impact > 8);
    default:
      return items;
  }
}
