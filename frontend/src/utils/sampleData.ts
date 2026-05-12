/**
 * Sample Data Injector — Predictive Onboarding
 *
 * Generates a realistic mix of manual scores AND mock campaign rows to populate the dashboard
 * so users can see the Spider Chart, Platform Health, and Action Items in action.
 * Also provides "Not Applicable" items per business model and strategic guesses.
 */

import { platforms, type MaturityLevel } from "@/data/auditData";
import type { BusinessModel } from "./brandContext";
import { type ManualScoreMap, type ManualScore, makeScoreKey } from "./auditCriteria";
import type { UnifiedRow } from "@/lib/metricBridge";
import type { UploadedFile } from "@/components/FileUpload";

// ─── Sample Score Distribution ───────────────────────────────────────────

/** Generate a realistic spread of scores for demo purposes */
export function generateSampleScores(model: BusinessModel): ManualScoreMap {
  const scores: ManualScoreMap = {};
  const rng = seedRandom(42); // deterministic for consistency

  for (const p of platforms) {
    // Artefact B2B doesn't operate on Snapchat/TikTok — keep scores very low
    const isInactivePlatform = p.id === "snapchat" || p.id === "tiktok";
    // Artefact B2B win: highlight LinkedIn ABM strength
    const isLinkedInB2BWin = model === "B2B" && p.id === "linkedin";

    for (const cat of p.categories) {
      for (const topic of cat.topics) {
        const key = makeScoreKey(p.id, cat.name, topic.id);

        // Check if this topic should be N/A for the business model
        if (isNotApplicable(cat.name, topic.topic, model)) {
          scores[key] = 3; // Mark as Champion (effectively N/A — doesn't tank score)
          continue;
        }

        if (isInactivePlatform) {
          // ~95% score 0, ~5% score 1
          scores[key] = rng() < 0.95 ? 0 : 1;
          continue;
        }

        // B2B win on LinkedIn — ABM / Account-based topics → Champion
        if (isLinkedInB2BWin) {
          const t = topic.topic.toLowerCase();
          const isABM = t.includes("account-based") || t.includes("matched account") || t.includes("abm");
          if (isABM) { scores[key] = 3; continue; }
          // Lift the rest of LinkedIn one notch above baseline
          const score = getSampleScore(topic.maturity, rng);
          scores[key] = Math.min(3, score + 1) as ManualScore;
          continue;
        }

        // Score based on maturity level + some randomness
        const score = getSampleScore(topic.maturity, rng);
        scores[key] = score;
      }
    }
  }

  return scores;
}

/** Deterministic pseudo-random for repeatable demos */
function seedRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Generate a score weighted by maturity level */
function getSampleScore(maturity: MaturityLevel, rng: () => number): ManualScore {
  const r = rng();
  switch (maturity) {
    case "Basic":
      // Most are scored 2-3 (already done), some 1
      return r < 0.3 ? 1 : r < 0.7 ? 2 : 3;
    case "Advanced":
      // Mixed: some done, some not
      return r < 0.2 ? 0 : r < 0.5 ? 1 : r < 0.8 ? 2 : 3;
    case "Expert":
      // Mostly not done yet
      return r < 0.4 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3;
    case "Champion":
      // Rarely achieved
      return r < 0.6 ? 0 : r < 0.85 ? 1 : 2;
  }
}

// ─── Business Model "Not Applicable" Items ───────────────────────────────

const B2B_NOT_APPLICABLE_KEYWORDS = [
  "shopping feed", "dpa", "dynamic product", "product catalogue",
  "shoppable", "collection ads", "shop now", "product set",
  "feed based dsa", "merchant center", "gmc", "pmax for shopping",
  "shopping campaign", "product listing", "catalog sales",
];

const B2C_NOT_APPLICABLE_KEYWORDS = [
  "lead gen", "lead form", "linkedin", "crm integration",
  "lead quality", "mql", "sql", "lead scoring",
];

export function isNotApplicable(categoryName: string, topicText: string, model: BusinessModel): boolean {
  const lower = topicText.toLowerCase();
  const catLower = categoryName.toLowerCase();

  if (model === "B2B") {
    return B2B_NOT_APPLICABLE_KEYWORDS.some(kw => lower.includes(kw) || catLower.includes(kw));
  }
  if (model === "B2C" || model === "D2C") {
    return B2C_NOT_APPLICABLE_KEYWORDS.some(kw => lower.includes(kw) || catLower.includes(kw));
  }
  return false;
}

// ─── Strategic Guess Based on Business Model ─────────────────────────────

interface StrategicGuess {
  headline: string;
  opportunities: string[];
  platforms: string[];
}

export function getStrategicGuess(model: BusinessModel, platformName: string): StrategicGuess {
  if (model === "B2B") {
    return {
      headline: `Based on your B2B model, your main opportunity is to reduce Lead Leakage by 15% through CRM-backfilled conversion tracking and improve Lead Quality via enhanced audience targeting on ${platformName}.`,
      opportunities: [
        "Reduce Lead Leakage via CAPI",
        "Lead Quality through Matched Audiences",
        "Enhanced Conversions for Leads",
        "Account-Based Targeting",
      ],
      platforms: ["Google Ads", "Bing Ads", "DV360"],
    };
  }
  if (model === "D2C") {
    return {
      headline: `Based on your D2C Business Model, we expect your main opportunities for ${platformName} to be in Shopping Feed Quality, ROAS Optimization, and Creative Testing.`,
      opportunities: [
        "Shopping Feed & Product Catalogue",
        "ROAS & Revenue Tracking",
        "Dynamic Product Ads (DPA)",
        "Creative A/B Testing at Scale",
      ],
      platforms: ["Google Ads", "Meta", "TikTok", "Pinterest"],
    };
  }
  if (model === "B2C") {
    return {
      headline: `Based on your B2C Business Model, we expect your main opportunities for ${platformName} to be in Audience Reach, Creative Formats, and Conversion Optimization.`,
      opportunities: [
        "Audience Expansion & Lookalikes",
        "Video & Interactive Creative Formats",
        "Conversion Rate Optimization",
        "Cross-Platform Frequency Management",
      ],
      platforms: ["Meta", "TikTok", "Google Ads", "Snapchat"],
    };
  }
  return {
    headline: `Select a Business Model in Settings to get personalized audit predictions for ${platformName}.`,
    opportunities: [
      "Naming Convention Consistency",
      "Conversion Tracking Setup",
      "Audience Strategy",
      "Budget Allocation",
    ],
    platforms: [],
  };
}

// ─── Naming Convention Ghost Preview ─────────────────────────────────────

export interface NamingPreview {
  perfect: string;
  failing: string;
  pattern: string;
}

export function getNamingGhostPreview(convention: string): NamingPreview | null {
  if (!convention.trim()) return null;

  // Parse the convention pattern
  const parts = convention.match(/\[([^\]]+)\]/g);
  if (!parts || parts.length < 2) return null;

  const delimiter = convention.includes("_") ? "_" : convention.includes("-") ? "-" : "_";
  const keys = parts.map(p => p.replace(/[\[\]]/g, ""));

  // Generate example values
  const exampleValues: Record<string, string> = {
    "Market": "FR",
    "Country": "FR",
    "Funnel": "TOF",
    "Stage": "TOF",
    "Objective": "Prospecting",
    "Goal": "Conversions",
    "Audience": "LAL_1pct",
    "Creative": "VID_30s",
    "Format": "RSA",
    "Campaign": "Brand_Search",
    "Channel": "Search",
    "Product": "CoreProduct",
    "Language": "EN",
    "Device": "Mobile",
    "Targeting": "InMarket",
  };

  const failValues: Record<string, string> = {
    "Market": "france",
    "Country": "france",
    "Funnel": "top funnel",
    "Stage": "awareness",
    "Objective": "brand awareness campaign",
    "Goal": "leads",
    "Audience": "all users",
    "Creative": "creative 1",
    "Format": "ad",
    "Campaign": "Campaign (1)",
    "Channel": "paid",
    "Product": "product",
    "Language": "english",
    "Device": "all",
    "Targeting": "broad",
  };

  const perfectParts = keys.map(k => exampleValues[k] || k.toUpperCase().slice(0, 4));
  const failingParts = keys.map(k => failValues[k] || k.toLowerCase());

  return {
    perfect: perfectParts.join(delimiter),
    failing: failingParts.join(" - "),
    pattern: keys.map(k => `[${k}]`).join(delimiter),
  };
}

// ─── Deep Sample Data: Mock Campaign Rows ────────────────────────────────

const PLATFORM_CAMPAIGNS: Record<string, { names: string[]; types: string[] }> = {
  google: {
    names: [
      "FR_TOF_Prospecting_Brand_Search_RSA",
      "DE_MOF_Retargeting_Generic_Search_RSA",
      "UK_BOF_Conversion_CustomerMatch_LeadScoring",
      "NL_TOF_Awareness_PMax_Display",
      "ES_MOF_Consideration_DSA_Search",
      "FR_BOF_Conversion_EnhancedConversions_Leads",
      "IT_TOF_Prospecting_Competitor_Search",
      "BE_MOF_Retargeting_PMax_Video",
      "FR_TOF_Awareness_YouTube_TrueView",
      "DE_BOF_Conversion_CustomerMatch_CRM",
      "Campaign (1) - Copy",
      "test campaign do not use",
    ],
    types: ["Search", "PMax", "CustomerMatch", "Display", "Video"],
  },
  meta: {
    names: [
      "FR_TOF_CAPI_LeadGen_Conversions",
      "DE_MOF_Retargeting_LeadForm_CRM",
      "UK_BOF_CustomAud_Carousel_LeadGen",
      "NL_TOF_BroadInt_Collection_Traffic",
      "ES_MOF_Engagement_Stories_Reach",
      "FR_BOF_CAPI_LeadScoring_Conversions",
      "IT_TOF_Interest_Video_Awareness",
      "Summer Sale 2024",
      "test_creative_v2",
    ],
    types: ["Conversions", "Traffic", "Awareness", "LeadGen"],
  },
  linkedin: {
    names: [
      "FR_TOF_ABM_MatchedAccounts_LeadGen",
      "DE_MOF_JobTitle_DocumentAds_LeadGen",
      "UK_BOF_CRM_Retargeting_LeadGenForm",
      "NL_TOF_ABM_FortuneList_BrandAwareness",
      "US_MOF_Lookalike_VideoAds_Consideration",
      "FR_BOF_ABM_DecisionMakers_ConversationAds",
      "DE_TOF_ThoughtLeadership_Boost_Engagement",
      "UK_MOF_AccountList_CarouselAds_LeadGen",
    ],
    types: ["LeadGen", "BrandAwareness", "WebsiteVisits", "Conversation"],
  },
  dv360: {
    names: [
      "FR_TOF_Programmatic_1PD_Prospecting",
      "DE_MOF_CTV_Whitelist_InMarket",
      "UK_BOF_Native_FirstPartyData_Conversion",
      "NL_TOF_DOOH_Whitelist_B2B",
      "ES_MOF_Audio_Podcast_Consideration",
      "BE_BOF_Display_1PD_AccountBased",
    ],
    types: ["Display", "Video", "CTV", "Native", "Audio"],
  },
  bing: {
    names: [
      "FR_TOF_Brand_Search_Bing",
      "DE_MOF_Generic_LeadGen_Bing",
      "UK_BOF_Retargeting_RSA_Bing",
      "NL_TOF_Competitor_Search_Bing",
    ],
    types: ["Search", "LeadGen"],
  },
  tiktok: {
    names: [
      "FR_TOF_Spark_TopView_Awareness",
      "DE_MOF_InFeed_LeadGen_Conversions",
      "UK_BOF_Dynamic_LeadForm_Sales",
      "tiktok brand test Q2",
    ],
    types: ["TopView", "InFeed", "Spark"],
  },
  pinterest: {
    names: [
      "FR_TOF_LeadGen_PinAds_Traffic",
      "DE_MOF_Collections_Retargeting",
      "UK_BOF_Whitepaper_Conversions",
    ],
    types: ["LeadGen", "Collections", "Standard"],
  },
  snapchat: {
    names: [
      "FR_TOF_Snap_Story_Awareness",
      "DE_MOF_Filters_Engagement",
      "UK_BOF_LeadGen_Conversions",
    ],
    types: ["Story", "Filters", "LeadGen"],
  },
};

function generateMockRows(platformKey: string, rng: () => number): UnifiedRow[] {
  const config = PLATFORM_CAMPAIGNS[platformKey];
  if (!config) return [];

  return config.names.map((name, i) => {
    const spend = Math.round((500 + rng() * 9500) * 100) / 100;
    const impressions = Math.round(spend * (80 + rng() * 200));
    const clicks = Math.round(impressions * (0.01 + rng() * 0.06));
    const conversions = Math.round(clicks * (0.02 + rng() * 0.12));
    const revenue = Math.round(conversions * (15 + rng() * 85) * 100) / 100;

    return {
      campaignId: `${platformKey}-camp-${i + 1}`,
      campaignName: name,
      platform: platformKey,
      spend,
      impressions,
      clicks,
      conversions,
      revenue,
      engagementIndex: Math.round((clicks / Math.max(impressions, 1)) * 10000) / 100,
      costPerResult: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : 0,
      returnOnSpend: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
      clickThroughRate: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      conversionRate: clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : 0,
      dailyBudget: Math.round(spend / 30),
      sourceFile: `${platformKey}_sample_export.csv`,
      sourceRow: i + 2,
      campaignType: config.types[i % config.types.length],
      bidStrategyType: platformKey === "google" ? ["Target CPA", "Max Conversions", "Target ROAS", "Manual CPC"][i % 4] : undefined,
    };
  });
}

/** Generate deep sample data: mock UploadedFile entries for all platforms */
export function generateSampleFiles(): UploadedFile[] {
  const rng = seedRandom(99);
  const platformToId: Record<string, string> = {
    google: "sea-google",
    meta: "meta",
    linkedin: "linkedin",
    dv360: "dv360",
    bing: "sea-bing",
    tiktok: "tiktok",
    pinterest: "pinterest",
    snapchat: "snapchat",
  };

  return Object.entries(PLATFORM_CAMPAIGNS).map(([key]) => {
    const rows = generateMockRows(key, rng);
    return {
      id: `sample-${key}`,
      name: `${key}_sample_export.csv`,
      platform: key,
      rows: rows.length,
      columns: ["Campaign", "Spend", "Impressions", "Clicks", "Conversions", "Revenue"],
      status: "ready" as const,
      data: rows,
    };
  });
}
