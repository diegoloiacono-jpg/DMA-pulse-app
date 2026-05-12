/**
 * Data Processor — Smart Mapper utilities
 *
 * Handles column auto-matching, data sanitization (currency stripping,
 * number parsing), and localStorage-based mapping memory per brand.
 */

// ─── Required Fields ─────────────────────────────────────────────────────

export const REQUIRED_FIELDS = [
  { key: "campaignName", label: "Campaign Name", description: "Campaign identifier" },
  { key: "spend", label: "Spend", description: "Total cost / amount spent" },
  { key: "impressions", label: "Impressions", description: "Number of ad impressions" },
  { key: "clicks", label: "Clicks", description: "Number of clicks or interactions" },
  { key: "conversions", label: "Conversions", description: "Conversion / result count" },
] as const;

export const OPTIONAL_FIELDS = [
  { key: "revenue", label: "Revenue", description: "Conversion value / revenue" },
  { key: "date", label: "Date", description: "Reporting date" },
  { key: "campaignId", label: "Campaign ID", description: "Unique campaign identifier" },
  { key: "dailyBudget", label: "Daily Budget", description: "Campaign daily budget" },
  { key: "location", label: "Location", description: "Country / region" },
] as const;

export type FieldKey = (typeof REQUIRED_FIELDS)[number]["key"] | (typeof OPTIONAL_FIELDS)[number]["key"];
export type ColumnMapping = Record<FieldKey, string | null>;

// ─── Auto-Matching (Fuzzy) ───────────────────────────────────────────────

const FIELD_SYNONYMS: Record<string, string[]> = {
  campaignName: ["campaign name", "campaign", "campaign_name", "ad set name", "ad group", "insertion order", "line item"],
  spend: ["spend", "cost", "amount spent", "amount spent (usd)", "total spent", "media cost", "spend in account currency"],
  impressions: ["impressions", "impr.", "impr", "impression", "total reach"],
  clicks: ["clicks", "link clicks", "clicks (all)", "interactions", "outbound clicks", "swipe ups"],
  conversions: ["conversions", "results", "purchases", "leads", "total conversions"],
  revenue: ["revenue", "conversion value", "conv. value", "purchase conversion value", "total conversion value"],
  date: ["date", "day", "reporting starts", "start date", "gregorian date"],
  campaignId: ["campaign id", "campaign_id", "advertiser id"],
  dailyBudget: ["daily budget", "budget", "avg. daily budget"],
  location: ["location", "country", "region", "country/territory", "geographic region"],
};

/**
 * Auto-detect column mapping from CSV headers using fuzzy matching.
 */
export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: Partial<ColumnMapping> = {};
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    // Exact match first
    const exactIdx = normalizedHeaders.findIndex(h => synonyms.includes(h));
    if (exactIdx !== -1) {
      mapping[field as FieldKey] = headers[exactIdx];
      continue;
    }

    // Partial match
    const partialIdx = normalizedHeaders.findIndex(h =>
      synonyms.some(s => h.includes(s) || s.includes(h))
    );
    if (partialIdx !== -1) {
      mapping[field as FieldKey] = headers[partialIdx];
    }
  }

  // Fill missing with null
  const allFields = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
  for (const f of allFields) {
    if (!(f.key in mapping)) {
      mapping[f.key] = null;
    }
  }

  return mapping as ColumnMapping;
}

// ─── Data Sanitization ──────────────────────────────────────────────────

export interface SanitizationResult {
  value: number;
  wasClean: boolean;
  error?: string;
}

/**
 * Strip currency symbols ($, €, £, ¥) and thousands separators,
 * then parse to float. Handles "1,200.50", "$1.200,50" (EU format), etc.
 */
export function sanitizeNumericValue(raw: string): SanitizationResult {
  if (!raw || raw.trim() === "" || raw.trim() === "-" || raw.trim() === "—") {
    return { value: 0, wasClean: true };
  }

  // Strip currency symbols and whitespace
  let cleaned = raw.replace(/[$€£¥₹\s]/g, "").trim();

  // Handle percentage
  const isPercent = cleaned.endsWith("%");
  if (isPercent) cleaned = cleaned.slice(0, -1);

  // Detect EU format (1.200,50) vs US format (1,200.50)
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma > lastDot && lastComma !== -1) {
    // EU format: dots are thousands, comma is decimal
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // US format: commas are thousands
    cleaned = cleaned.replace(/,/g, "");
  }

  const num = parseFloat(cleaned);
  if (isNaN(num)) {
    return { value: 0, wasClean: false, error: `Invalid number: "${raw}"` };
  }

  return { value: num, wasClean: true };
}

/**
 * Validate that a column's data is numeric.
 * Returns errors for the first few invalid rows.
 */
export function validateNumericColumn(
  rows: Record<string, string>[],
  columnName: string,
  fieldLabel: string,
): string[] {
  const errors: string[] = [];
  let checked = 0;

  for (let i = 0; i < Math.min(rows.length, 100); i++) {
    const val = rows[i][columnName];
    if (!val || val.trim() === "") continue;
    checked++;
    const result = sanitizeNumericValue(val);
    if (!result.wasClean) {
      errors.push(`Row ${i + 2}: ${result.error}`);
      if (errors.length >= 3) break;
    }
  }

  if (errors.length > 0) {
    return [`Invalid data format in ${fieldLabel} column (${columnName}):`, ...errors];
  }
  return [];
}

// ─── Mapping Memory (localStorage) ───────────────────────────────────────

const STORAGE_KEY = "dma-column-mappings";

interface StoredMappings {
  [brandKey: string]: {
    mapping: ColumnMapping;
    platform: string;
    savedAt: string;
  };
}

function getMappingStorageKey(brandName: string, platform: string): string {
  return `${brandName.toLowerCase().trim()}::${platform}`;
}

/**
 * Save a column mapping for a brand + platform combo.
 */
export function saveMappingMemory(
  brandName: string,
  platform: string,
  mapping: ColumnMapping,
): void {
  try {
    const stored: StoredMappings = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const key = getMappingStorageKey(brandName, platform);
    stored[key] = { mapping, platform, savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // localStorage not available
  }
}

/**
 * Load a previously saved mapping for a brand + platform combo.
 */
export function loadMappingMemory(
  brandName: string,
  platform: string,
): ColumnMapping | null {
  try {
    const stored: StoredMappings = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const key = getMappingStorageKey(brandName, platform);
    return stored[key]?.mapping ?? null;
  } catch {
    return null;
  }
}

/**
 * Check if a saved mapping exists.
 */
export function hasSavedMapping(brandName: string, platform: string): boolean {
  return loadMappingMemory(brandName, platform) !== null;
}
