// Auto-generated from KNOW_Artefact_Digital_Maturity_Accelerator_DMA_Global_edition.xlsx

export type MaturityLevel = "Basic" | "Advanced" | "Expert" | "Champion";
export type ScoreStatus = "excellent" | "good" | "warning" | "poor" | "critical";

export interface PlatformTopic {
  id: number;
  topic: string;
  maturity: MaturityLevel;
  scores: Record<string, boolean | null>;
  details: string;
  action: string;
}

export interface PlatformCategory {
  id: number;
  name: string;
  weight: number;
  score: number;
  topics: PlatformTopic[];
}

export interface Platform {
  id: string;
  name: string;
  shortName: string;
  markets: string[];
  categories: PlatformCategory[];
  weightedScore: number;
  totalTopics: number;
  sourceSheet: string;
}

export function getScoreStatus(score: number): ScoreStatus {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "warning";
  if (score >= 20) return "poor";
  return "critical";
}

export function getMaturityColor(level: MaturityLevel): string {
  switch (level) {
    case "Champion": return "bg-score-excellent/15 text-score-excellent";
    case "Expert": return "bg-score-good/15 text-score-good";
    case "Advanced": return "bg-score-warning/15 text-score-warning";
    case "Basic": return "bg-score-poor/15 text-score-poor";
  }
}

function calcCategoryScore(topics: PlatformTopic[], markets: string[]): number {
  if (topics.length === 0 || markets.length === 0) return 0;
  let passed = 0;
  let total = 0;
  for (const t of topics) {
    for (const m of markets) {
      if (t.scores[m] !== null && t.scores[m] !== undefined) {
        total++;
        if (t.scores[m] === true) passed++;
      }
    }
  }
  return total > 0 ? Math.round((passed / total) * 100) : 0;
}

function calcWeightedAvg(categories: PlatformCategory[]): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const c of categories) {
    totalWeight += c.weight;
    weightedSum += c.score * c.weight;
  }
  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;
}

function buildPlatforms(): Platform[] {
  const raw: Array<{ id: string; name: string; shortName: string; markets: string[]; sourceSheet: string; categories: Array<{ name: string; weight: number; topics: PlatformTopic[] }> }> = [
  {
    "id": "sea-google",
    "name": "SEA \u2014 Google Ads",
    "shortName": "Google Ads",
    "markets": [
      "FR",
      "NL",
      "DE",
      "ES",
      "UK",
      "US",
      "IT"
    ],
    "sourceSheet": "SEA - Google Ads",
    "categories": [
      {
        "name": "Keywords",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Low amount of keywords; generic keywords without including searc intent",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Account structure (based on Hagakure)",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Keyword research",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Standard Namig Convention",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Set-up base range of keywords",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Campaign segmentation based on customer journey",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Negative keyword list",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Mcc Account",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Expand account to search engines beyond Google Ads",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Implement broad match keywords",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Implement DSA ad groups",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 12,
            "topic": "Feed based DSA ad groups",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 13,
            "topic": "Third party tooling for using feed based keywords",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 14,
            "topic": "Use business feeds to create large keyword range",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Audiences / targeting",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Basic demographics and audiences",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Location targeting",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Remarketing lists",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Import Google Analytics remarketing audiences",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Import Google Analyics audiences based on purchase behaviour / category interest",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Import Google Analyics audiences based on page visits",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Import CRM lists",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Import Google Analyics predictive audiences",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Incorporate all audiences above in the campaign settings",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Use Instant BQML - Purchase, Product or Churn propensity",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Real time CRM lists integration",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Conversion & KPI",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Conversion set-up",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Conversion tags are implemented in GTM",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Focus on increasing amount of conversions",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Conversion data (ensure conversion data)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Enhanced Conversions For lead generation Implemented",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "KPI based strategy (ROAS or CPA)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Segment your targets (based on contribution value)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Focus on growing revenue/ conversions against tROAS/tCPA",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Implement third party tracking tool (cross-marketing channel reporting)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Integrate business level KPI data into Google Ads (margin)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Import cancellation and returns for a precise final ROAS",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 12,
            "topic": "Steer on POAS, incremental ROAS/CPA",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Attribution",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Conversion settings are set to the right attribtuion model",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Conversion settings are set to DDA model",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Import business data (scripting/ API). E.g.: returnrates, CLV, order frequency",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Setup deduplicated conversion tracking",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Setup conversion framework based on micro and macro conversions",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Bid Management",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Simple automated bid strategies (e.g.: SIS 90-95)",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Import Google Analytics remarketing audiences based on non convertors",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Segment bid strategies based on performance",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Smart bidding with VBB and othe applicable data enrichments",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Extensions",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Campaign level ad extensions",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Account level ad extensions",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Expand use of extensions",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Campaing level ad extensions (4)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Account level ad extensions (4)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Tailor campaign level ad extensions to needs",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Tailor adgroup level ad extensions to needs for individual ad groups",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Message",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Ad group tailored ads",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "RSA reflect steps in customer journey",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Customer based RSAs based on broad contextual signals",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Tailored ad text by using contextual signals",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Automation",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Set-up labeling tools",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Set-up enable/pause rules",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Set-up alerts for major drops",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Leverage 3rd party tooling for account hygience (aka running audits)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Set-up automated reporting",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Cross platform or cross-account management tools",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Tooling that helps delivering proactive optimization opportunities",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Value based bidding (e.g.: Optimyzer)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Automated account reviews (e.g.: Wordstream)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Scalable keywords (e.g.: SpyFu)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Feed Quality and GMC",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Provide high-quality data: titles, descriptions and specs",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Provide high-quality data: image quality",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Provide up-to-date data",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Use of corresponding google categories",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Absence of disapproved items",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "use of product type and custom labels to signal that a product is high-priority",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Automatic product updates and image improvements on",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Use of GMC reports and dashboards",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Prioritize your most valuable products when allocating budget",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Optimize with Promotion",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Display Product Rating",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "PMax for Shopping",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Separated campaigns according to product categories or target goal",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Use of 1st part data in Google signals (both customer match and website /addtocart/converters)",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Create multiple asset groups within the same campaign to bundle assets that should serve in sets",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Target segmentation",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Enable automatically created assets",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Enable final URL expansion and use URL exclusion",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Use of customer acquisition goal",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Use account/campaign-level negative keywords",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Use of Brand exclusion in PMax",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Customize Signal for different campaigns and asset groups",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Smart bidding with VBB and other applicable data enrichments",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "ES": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      }
    ]
  },
  {
    "id": "sea-bing",
    "name": "SEA \u2014 Bing",
    "shortName": "Bing",
    "markets": [
      "FR",
      "NL",
      "DE",
      "BE",
      "UK",
      "US",
      "IT"
    ],
    "sourceSheet": "SEA - Bing",
    "categories": [
      {
        "name": "Keywords",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Low amount of keywords; generic keywords without including searc intent",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Account structure (based on Hagakure)",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Keyword research",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Standard Namig Convention",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Set-up base range of keywords",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Campaign segmentation based on customer journey",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Negative keyword list",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Mcc Account",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Expand account to search engines beyond Google Ads",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Implement broad match keywords",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Implement DSA ad groups",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 12,
            "topic": "Feed based DSA ad groups",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 13,
            "topic": "Third party tooling for using feed based keywords",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 14,
            "topic": "Use business feeds to create large keyword range",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Audiences / targeting",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Basic demographics and audiences",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Location targetting",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Remarketing lists",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Import Google Analytics remarketing audiences",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Import Google Analyics audiences based on page visits",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Incorporate all audiences above in the campaignsettings",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Import CRM lists",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Import 1st party data based audiences",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Create custom look-a-like audiences based on 1st party",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Conversion & KPI",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Conversion set-up",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Conversion tags are implemented in GTM",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Focus on increasing amount of conversions",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Conversion data (ensure conversion data)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Enhanced Conversions For lead generation Implemented",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "KPI based strategy (ROAS or CPA)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Segment your targets (based on contribution value)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Focus on growing revenue/ conversions against tROAS/tCPA",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Implement third party tracking tool (cross-marketing channel reporting)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Integrate business level KPI data into Google Ads (margin)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Steer on POAS, incremental ROAS/CPA",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Attribution",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Conversion settings are set to the right attribtuion model",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Conversion settings are set to DDA model",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Import business data (scripting/ API). E.g.: returnrates, CLV, order frequency",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Setup deduplicated conversion tracking",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Setup conversion framework based on micro and macro conversions",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Bid Management",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Simple automated bid strategies (e.g.: SIS 90-95)",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Import Google Analytics remarketing audiences based on non convertors",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Segment bid strategies based on performance",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Smart bidding with VBB and othe applicable data enrichments",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Extensions",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Campaign level ad extensions",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Account level ad extensions",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Expand use of extensions",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Campaing level ad extensions (4)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Account level ad extensions (4)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Tailor campaign level ad extensions to needs",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Tailor adgroup level ad extensions to needs for individual ad groups",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Message",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Ad group tailored ads",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "RSA reflect steps in customer journey",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Customer based RSAs based on broad contextual signals",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Tailored ad text by using contextual signals",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Automation",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Set-up labeling tools",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Set-up enable/pause rules",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Set-up alerts for major drops",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Leverage 3rd party tooling for account hygience (aka running audits)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Set-up automated reporting",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Cross platform or cross-account management tools",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Tooling that helps delivering proactive optimization opportunities",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Value based bidding (e.g.: Optimyzer)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Automated account reviews (e.g.: Wordstream)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Scalable keywords (e.g.: SpyFu)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      }
    ]
  },
  {
    "id": "meta",
    "name": "Meta Ads",
    "shortName": "Meta",
    "markets": [
      "FR",
      "NL",
      "DE",
      "BE",
      "UK",
      "US",
      "IT"
    ],
    "sourceSheet": "META",
    "categories": [
      {
        "name": "Campaign setup",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Campaign setup based on algorithms",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Organized structure",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Simple structure (easy to understand)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Naming convention on campaign level",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Naming convention on ad group level",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Naming convention on ad level",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Structure in line with offer on the website",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Lookback windows",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Advantage+ Sales Plus campaigns for ecommerce",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Build campaign setups via Excel or external tooling (e.g. Smartly / ByCape.io)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Have a naming convention tool integration (grasp)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Audiences & targeting",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Language targeting",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Age targeting",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Demographic targeting",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Specific placement targeting",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Dedicated campaign per market",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Is there an audience framework in place (and used for targeting?)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Is there a persona in place from client side (the ideal customer)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Retargeting audiences",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Inplatform audiences (followers, retarget video viewers)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Event based audiences (on pixel events)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Bid adjustments per audience",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 12,
            "topic": "Customer Match audiences",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 13,
            "topic": "Is the Advantage+ Audiences set up used?",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 14,
            "topic": "Audience Segments established",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 15,
            "topic": "Customer Data Platform (CDP) integration",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Conversion & KPI",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "General goal for Meta (total)",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "The Meta pixel has been installed on the website",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Campaigns use the same Pixel across the funnel",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Monthly performance check in on KPI's",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "A clear KPI framework with goals per funnel",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Classic events are made (view, add to cart, purchase)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Soft conversion have been added (such as a quality visit)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Conversion API setup",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Goal per type of customer (new customer or returning customer)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Customer life time value",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Feeds & Catalogs",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "There is a productfeed connected from the \"backend\" to Meta",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "There are top performing product lists in use",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "There are seasonality lists available",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Catalogue match rate (last 28d) >90%",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Pixel is connected to the catalog",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Shopping weight has been added to catalog",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Client is working with a feedmanagementtool",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Creative & content",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Usage of image ads",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Usage of video ads",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Usage of call to actions",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Usage of brand name in the image",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Copy Length",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Rotation mode of creatives",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "3-4 ad texts per ad",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Carousel ads",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Collection ads",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Both square as story images to match placement sizes",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Multi-Advertiser Ads",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 12,
            "topic": "Dynamic Product Ads (DPA)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 13,
            "topic": "If dynamic formats used (carousel, collection), is Meta allowed to automatically show the best performing variation?",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 14,
            "topic": "Are the Advantage+ Creative Enhancements activated?",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 15,
            "topic": "Dynamic Creative Optimization (DCO) - via tooling or other options",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Reporting",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Gathering insights from campaign overview",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Pre-defined Meta reports per funnel",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Meta & website insights (GA)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "A/B testing in Meta (experiments)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Budget management (check if budgets are aligned with objectives)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Monthly reporting meetings",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Real time data dasboard",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Consisted testing framework including hyptohesis",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Brand lift studies",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Conversion lift studies in Meta",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Marketing mix modeling",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      }
    ]
  },
  {
    "id": "linkedin",
    "name": "LinkedIn Ads",
    "shortName": "LinkedIn",
    "markets": ["FR", "NL", "DE", "BE", "UK", "US", "IT"],
    "sourceSheet": "LINKEDIN",
    "categories": [
      {
        "name": "Campaign setup",
        "weight": 100,
        "topics": [
          { "id": 1, "topic": "Objective-based campaign structure (Lead Gen / Brand / Website Visits)", "maturity": "Basic", "scores": {"FR":true,"NL":true,"DE":true,"BE":false,"UK":true,"US":true,"IT":false}, "details": "", "action": "" },
          { "id": 2, "topic": "Campaign Group hierarchy aligned with funnel stage", "maturity": "Advanced", "scores": {"FR":true,"NL":false,"DE":true,"BE":false,"UK":true,"US":true,"IT":false}, "details": "", "action": "" },
          { "id": 3, "topic": "Naming convention on campaign group level", "maturity": "Advanced", "scores": {"FR":true,"NL":true,"DE":true,"BE":false,"UK":true,"US":false,"IT":false}, "details": "", "action": "" },
          { "id": 4, "topic": "Naming convention on campaign level", "maturity": "Advanced", "scores": {"FR":true,"NL":true,"DE":true,"BE":false,"UK":true,"US":false,"IT":false}, "details": "", "action": "" },
          { "id": 5, "topic": "Bid strategy aligned with objective (Max Delivery / Cost Cap / Manual)", "maturity": "Expert", "scores": {"FR":false,"NL":false,"DE":false,"BE":false,"UK":false,"US":false,"IT":false}, "details": "", "action": "" },
          { "id": 6, "topic": "Frequency capping configured at campaign group", "maturity": "Expert", "scores": {"FR":false,"NL":false,"DE":false,"BE":false,"UK":false,"US":false,"IT":false}, "details": "", "action": "" }
        ]
      },
      {
        "name": "Audiences & targeting",
        "weight": 130,
        "topics": [
          { "id": 7, "topic": "Account-Based Marketing (Matched Account Lists uploaded)", "maturity": "Champion", "scores": {"FR":true,"NL":true,"DE":true,"BE":true,"UK":true,"US":true,"IT":true}, "details": "ABM lists synced from CRM cover 92% of target accounts.", "action": "Maintain monthly CRM → LinkedIn account list refresh." },
          { "id": 8, "topic": "Job Title / Seniority / Function targeting layered", "maturity": "Advanced", "scores": {"FR":true,"NL":true,"DE":true,"BE":false,"UK":true,"US":true,"IT":false}, "details": "", "action": "" },
          { "id": 9, "topic": "Matched Audiences — Website Retargeting via Insight Tag", "maturity": "Advanced", "scores": {"FR":true,"NL":false,"DE":true,"BE":false,"UK":true,"US":true,"IT":false}, "details": "", "action": "" },
          { "id": 10, "topic": "Lookalike / Predictive Audiences built from CRM lists", "maturity": "Expert", "scores": {"FR":false,"NL":false,"DE":false,"BE":false,"UK":false,"US":false,"IT":false}, "details": "", "action": "" },
          { "id": 11, "topic": "Audience exclusions (existing customers, employees, suppliers)", "maturity": "Advanced", "scores": {"FR":true,"NL":false,"DE":true,"BE":false,"UK":true,"US":true,"IT":false}, "details": "", "action": "" },
          { "id": 12, "topic": "Audience size kept above 50k for delivery efficiency", "maturity": "Expert", "scores": {"FR":false,"NL":false,"DE":false,"BE":false,"UK":false,"US":false,"IT":false}, "details": "", "action": "" }
        ]
      },
      {
        "name": "Conversion & lead gen",
        "weight": 130,
        "topics": [
          { "id": 13, "topic": "Lead Gen Forms enabled with pre-fill", "maturity": "Advanced", "scores": {"FR":true,"NL":true,"DE":true,"BE":false,"UK":true,"US":true,"IT":false}, "details": "", "action": "" },
          { "id": 14, "topic": "CRM Integration — leads sync to Salesforce / HubSpot in real-time", "maturity": "Champion", "scores": {"FR":false,"NL":false,"DE":false,"BE":false,"UK":false,"US":false,"IT":false}, "details": "", "action": "Connect LinkedIn Lead Gen Forms to Salesforce via native integration to eliminate manual exports." },
          { "id": 15, "topic": "Lead Routing rules — assign by region / vertical within 5 min", "maturity": "Expert", "scores": {"FR":false,"NL":false,"DE":false,"BE":false,"UK":false,"US":false,"IT":false}, "details": "", "action": "" },
          { "id": 16, "topic": "Conversion Tracking via Insight Tag (page-level)", "maturity": "Basic", "scores": {"FR":true,"NL":true,"DE":true,"BE":true,"UK":true,"US":true,"IT":true}, "details": "", "action": "" },
          { "id": 17, "topic": "Conversions API (CAPI) implemented for offline/server events", "maturity": "Expert", "scores": {"FR":false,"NL":false,"DE":false,"BE":false,"UK":false,"US":false,"IT":false}, "details": "", "action": "" },
          { "id": 18, "topic": "Pipeline value tracked per campaign (revenue back to LinkedIn)", "maturity": "Champion", "scores": {"FR":false,"NL":false,"DE":false,"BE":false,"UK":false,"US":false,"IT":false}, "details": "", "action": "" }
        ]
      },
      {
        "name": "Creative & content",
        "weight": 100,
        "topics": [
          { "id": 19, "topic": "Single Image, Video, Carousel and Document ads tested", "maturity": "Advanced", "scores": {"FR":true,"NL":true,"DE":true,"BE":false,"UK":true,"US":true,"IT":false}, "details": "", "action": "" },
          { "id": 20, "topic": "Thought Leadership Ads (boosting employee posts)", "maturity": "Expert", "scores": {"FR":false,"NL":false,"DE":false,"BE":false,"UK":false,"US":false,"IT":false}, "details": "", "action": "" },
          { "id": 21, "topic": "Vertical / square video assets for mobile feed", "maturity": "Advanced", "scores": {"FR":true,"NL":false,"DE":true,"BE":false,"UK":true,"US":false,"IT":false}, "details": "", "action": "" },
          { "id": 22, "topic": "Conversation / Message Ads with branching CTAs", "maturity": "Expert", "scores": {"FR":false,"NL":false,"DE":false,"BE":false,"UK":false,"US":false,"IT":false}, "details": "", "action": "" },
          { "id": 23, "topic": "Creative refresh cadence ≤ 6 weeks to combat fatigue", "maturity": "Advanced", "scores": {"FR":false,"NL":false,"DE":false,"BE":false,"UK":false,"US":false,"IT":false}, "details": "", "action": "" }
        ]
      },
      {
        "name": "Reporting & attribution",
        "weight": 100,
        "topics": [
          { "id": 24, "topic": "Cost per Lead reported per campaign group", "maturity": "Basic", "scores": {"FR":true,"NL":true,"DE":true,"BE":true,"UK":true,"US":true,"IT":true}, "details": "", "action": "" },
          { "id": 25, "topic": "MQL → SQL conversion rate tracked back to campaign", "maturity": "Expert", "scores": {"FR":false,"NL":false,"DE":false,"BE":false,"UK":false,"US":false,"IT":false}, "details": "", "action": "" },
          { "id": 26, "topic": "ABM dashboards showing account engagement scoring", "maturity": "Champion", "scores": {"FR":false,"NL":false,"DE":false,"BE":false,"UK":false,"US":false,"IT":false}, "details": "", "action": "" },
          { "id": 27, "topic": "Multi-touch attribution including LinkedIn touchpoints", "maturity": "Champion", "scores": {"FR":false,"NL":false,"DE":false,"BE":false,"UK":false,"US":false,"IT":false}, "details": "", "action": "" }
        ]
      }
    ]
  },
  {
    "id": "pinterest",
    "name": "Pinterest Ads",
    "shortName": "Pinterest",
    "markets": [
      "FR",
      "NL",
      "DE",
      "BE",
      "UK",
      "US",
      "IT"
    ],
    "sourceSheet": "PINTEREST",
    "categories": [
      {
        "name": "Campaign setup",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Campaign setup based on algorithms",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Organized structure",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Simple structure (easy to understand)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Naming convention on campaign level",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Naming convention on ad group level",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Naming convention on ad level",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Structure in line with offer on the website",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Attribution windows",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Pinterest Performance+ Campaigns",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Build campaign setups via Excel or external tooling (e.g. Smartly / ByCape.io)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Have a naming convention tool integration (grasp)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Audiences & targeting",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Language targeting",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Age targeting",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Demographic targeting",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Dedicated campaign per market",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Is there an audience framework in place (and used for targeting?)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Is there a persona in place from client side (the ideal customer)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Pinterest Performance+ targeting activated",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Device targeting",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Retargeting audiences",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Specific placement targeting",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Inplatform audiences (followers, retarget video viewers)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 12,
            "topic": "Event based audiences (on pixel events)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 14,
            "topic": "Customer Match audiences",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 15,
            "topic": "Customer Data Platform (CDP) integration",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Conversion & KPI",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "General goal for Pinterest (total)",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Monthly performance check in on KPI's",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "A clear KPI framework with goals per funnel",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "The Pinterest Tag has been installed on the website",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Classic events are made (view, add to cart, purchase)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Soft conversion have been added (such as a quality visit)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Conversion API setup",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Feeds & Catalogs",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Catalogue is connected to Pinterest",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "There are top performing product lists in use",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "There are seasonality lists available",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Feedhealth 90%",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Shopping weight has been added to catalog",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Client is working with a feedmanagementtool",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Catalogue is used in the campaigns",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Creative & content",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Usage of image ads",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Usage of video ads",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Usage of call to actions",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Usage of brand name in the image",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Copy Length",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Rotation mode of creatives",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Carousel ads",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Idea/Quiz ads",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Shopping Ads",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Creative testing framework in place (based on e.g. 6 pillars of attention)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Premiere Spotlight Ads",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 12,
            "topic": "Dynamic Creative Optimization (DCO) - via tooling or other options",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Reporting",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Gathering insights from campaign overview",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Pinterest & website insights (GA)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "A/B testing in Pinterest",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Monthly reporting meetings",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Real time data dasboard",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Consisted testing framework including hyptohesis",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Brand lift studies",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Marketing mix modeling",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      }
    ]
  },
  {
    "id": "tiktok",
    "name": "TikTok Ads",
    "shortName": "TikTok",
    "markets": [
      "FR",
      "NL",
      "DE",
      "BE",
      "UK",
      "US",
      "IT"
    ],
    "sourceSheet": "TikTok",
    "categories": [
      {
        "name": "Campaign setup",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Campaign setup based on algorithms",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Organized structure",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Simple structure (easy to understand)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Naming convention on campaign level",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Naming convention on ad group level",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Naming convention on ad level",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Structure in line with offer on the website",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Attribution windows",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Smart+ Campaign",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Search Campaign",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Build campaign setups via Excel or external tooling",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 12,
            "topic": "Have a naming convention tool integration (grasp)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Audiences & targeting",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Language targeting",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Age targeting",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Demographic targeting",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Dedicated campaign per market",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Is Video download/sharing allowed?",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "User Comments allowed",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Is there an audience framework in place (and used for targeting?)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Is there a persona in place from client side (the ideal customer)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Device targeting",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Retargeting audiences",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Specific placement targeting",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 12,
            "topic": "Inplatform audiences (followers, retarget video viewers)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 13,
            "topic": "Event based audiences (on pixel events)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 14,
            "topic": "Bid control added",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 15,
            "topic": "Customer List audiences",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 16,
            "topic": "Customer Data Platform (CDP) integration",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 17,
            "topic": "Comments Management",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Conversion & KPI",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "General goal for TikTok (total)",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Monthly performance check in on KPI's",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "A clear KPI framework with goals per funnel",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "The pixel has been installed on the website",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Classic events are made (view, add to cart, purchase)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Soft conversion have been added (such as a quality visit)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Events API setup",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Creative & content",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Usage of image ads",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Usage of video ads",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Usage of carousel ads",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Usage of call to actions",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Usage of brand name in the image, videos",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "TikTok accout connected",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Rotation mode of creatives",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Copy length",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Music added to the image ads",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Search ads",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 12,
            "topic": "Smart Creatives Automation",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 13,
            "topic": "Product Information Tagged",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 14,
            "topic": "Carousel ads automated (smart covers)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 15,
            "topic": "Dynamic Creative Optimization (DCO) - via tooling or other options",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 16,
            "topic": "Content Ads (TopView, Branded Hashtags, etc)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Reporting",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Gathering insights from campaign overview",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Pre-defined TikTok reports per funnel",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "TikTok & website insights (GA)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Split testing in TikTok (experiments)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Monthly reporting meetings",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Real time data dasboard",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Consisted testing framework including hyptohesis",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Brand lift studies",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Marketing mix modeling",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      }
    ]
  },
  {
    "id": "snapchat",
    "name": "Snapchat Ads",
    "shortName": "Snapchat",
    "markets": [
      "FR",
      "NL",
      "DE",
      "BE",
      "UK",
      "US",
      "IT"
    ],
    "sourceSheet": "Snapchat",
    "categories": [
      {
        "name": "Campaign setup",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Campaign setup based on algorithms",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Organized structure",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Simple structure (easy to understand)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Naming convention on campaign level",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Naming convention on ad group level",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Naming convention on ad level",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Structure in line with offer on the website",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Attribution windows",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Automatic Page View Campaign",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Build campaign setups via Excel or external tooling",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Have a naming convention tool integration (grasp)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Audiences & targeting",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Language targeting",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Age targeting",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Demographic targeting",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Dedicated campaign per market",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Is there an audience framework in place (and used for targeting?)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Is there a persona in place from client side (the ideal customer)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Device targeting",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Retargeting audiences",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Specific placement targeting",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Inplatform audiences (followers, story viewers, retarget video viewers)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Event based audiences (on pixel events)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 12,
            "topic": "Smart Targeting On",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 13,
            "topic": "Bid control added",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 14,
            "topic": "Customer List audiences",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 15,
            "topic": "Customer Data Platform (CDP) integration",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Conversion & KPI",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "General goal for Snapchat (total)",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Monthly performance check in on KPI's",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "A clear KPI framework with goals per funnel",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "The pixel has been installed on the website",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Classic events are made (view, add to cart, purchase)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Soft conversion have been added (such as a quality visit)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Conversion API setup",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Feeds & Catalogs",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Catalogue is connected to Pinterest",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "There are top performing product lists in use",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "There are seasonality lists available",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Feedhealth 90%",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Shopping weight has been added to catalog",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Client is working with a feedmanagementtool",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Catalogue is used in the campaigns",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Creative & content",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Usage of image ads",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Usage of video ads",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Usage of story ads",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Usage of call to actions",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Usage of brand name in the image, videos",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Rotation mode of creatives",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Copy length (Brand: Up to 25 characters with spaces, Headline: Up to 34 characters with spaces)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Music added to the ads",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Collection ads",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Commercial ads",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Augmented Reality ads",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Reporting",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Gathering insights from campaign overview",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Snapchat & website insights (GA)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Split testing in Snapchat (experiments)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Monthly reporting meetings",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Real time data dasboard",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Consisted testing framework including hyptohesis",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Brand lift studies",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Marketing mix modeling",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      }
    ]
  },
  {
    "id": "dv360",
    "name": "Display & Video 360",
    "shortName": "DV360",
    "markets": [
      "FR",
      "NL",
      "DE",
      "BE",
      "UK",
      "US",
      "IT"
    ],
    "sourceSheet": "DV360",
    "categories": [
      {
        "name": "Campaign setup",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Single campaign setup (built&forget)",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Creating a inclusion or exclusion list",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Frequency management",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Pacing management",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Accurate budget management between Campaign, IO, Line items",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Brand safety settings",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Naming convention on Campaign, IO and LI level",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Aligned KPI's towards campaign planning",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 9,
            "topic": "Setup using SDF files",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 10,
            "topic": "Device targeting strategy",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 11,
            "topic": "Custom bidding across different campaigns types",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 12,
            "topic": "A naming convention tool to prevent errors and safeguard convention  (e.g.: Grasp)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Targeting",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Use of Google predefined audiences for inclusions",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Use of Google predefined audiences for exclusions",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Working with (local) publishing deals",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Work with extended uses of first party audiences",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Audience strategy based on local personas",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Making use of inentory buying strateg (private deals, guaranteed deals)",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Automated input of 1st, 2nd and 3rd party data",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Conversion & KPIs",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Steer upon appropriate KPI's",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Set up basic Floodlight (all pages)",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Set-up conversion floodlights",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Set-up Google Analytics events",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Soft conversion setup based on different steps of the funnel",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Add soft conversions in campaign setup",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Enhance bid strategies with CLV, feed- and margin based bids",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Attribution model",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "No attribution model in place",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Start comparing different attribution models",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "DDA model is in place for DV360",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Custom attribution model (cookieless, statistical)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Creatives",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Basic IAB format creatives (static)",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Video creatives running (Youtube/ VOD/ Instream/ Outstream)",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Hosting creatives via CM360 for measurement",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "HTML5 banners running with different elements",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Rich media banners  (such as HPTO / Mobile Interscroller)",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Different creatives per step in the funnel",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Creative ad-sequency to boost storytelling",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Customized messages per campaign, funnel and vertical (DCO)",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      },
      {
        "name": "Reporting",
        "weight": 100,
        "topics": [
          {
            "id": 1,
            "topic": "Manually based media metrics",
            "maturity": "Basic",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 2,
            "topic": "Setup brand lift studies",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 3,
            "topic": "Set-up period manual reports",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 4,
            "topic": "Irregular testing",
            "maturity": "Advanced",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 5,
            "topic": "Setup accelerated brand lift studies",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 6,
            "topic": "Automatic in-platform reporting to share with stakeholders",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 7,
            "topic": "Consistent testing and insights framework",
            "maturity": "Expert",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          },
          {
            "id": 8,
            "topic": "Multiple platform reports to develop one truth about campaign insights",
            "maturity": "Champion",
            "scores": {
              "FR": false,
              "NL": false,
              "DE": false,
              "BE": false,
              "UK": false,
              "US": false,
              "IT": false
            },
            "details": "",
            "action": ""
          }
        ]
      }
    ]
  }
];

  return raw.map(p => {
    let catId = 0;
    const categories: PlatformCategory[] = p.categories.map(c => {
      catId++;
      const score = calcCategoryScore(c.topics, p.markets);
      return { id: catId, name: c.name, weight: c.weight, score, topics: c.topics };
    });
    const weightedScore = calcWeightedAvg(categories);
    const totalTopics = categories.reduce((s, c) => s + c.topics.length, 0);
    return { ...p, categories, weightedScore, totalTopics };
  });
}

export const platforms: Platform[] = buildPlatforms();

// Convenience: get only paid platforms (exclude example)
export const paidPlatforms: Platform[] = platforms.filter(p => p.id !== "example");

// Omnichannel weighted score across all platforms
export const omnichannelScore = Math.round(
  platforms.reduce((s, p) => s + p.weightedScore, 0) / platforms.length * 10
) / 10;

export function getPlatformIssues(platform: Platform): PlatformTopic[] {
  return platform.categories.flatMap(c =>
    c.topics.filter(t => {
      const marketVals = Object.values(t.scores).filter(v => v !== null);
      return marketVals.some(v => v === false);
    })
  );
}

export function getChampionMet(platform: Platform): number {
  const championTopics = platform.categories.flatMap(c =>
    c.topics.filter(t => t.maturity === "Champion")
  );
  if (championTopics.length === 0) return 0;
  const fullyMet = championTopics.filter(t => {
    const vals = Object.values(t.scores).filter(v => v !== null);
    return vals.length > 0 && vals.every(v => v === true);
  });
  return Math.round((fullyMet.length / championTopics.length) * 100);
}
