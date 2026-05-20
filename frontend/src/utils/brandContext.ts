/**
 * Shared Brand Context state — lifted out of BrandContextForm so
 * dashboardLogic and every component can read the same values.
 */

export type BusinessModel = "B2B" | "B2C" | "D2C" | "";

/** Platform option keys shown in Brand Context platform selector.
 *  These map 1:1 to platform IDs in src/data/auditData.ts where applicable.
 *  "reddit" is listed but has no audit dataset yet. */
export type PlatformKey =
  | "sea-google"
  | "sea-bing"
  | "meta"
  | "linkedin"
  | "tiktok"
  | "snapchat"
  | "reddit";

export interface PlatformOption {
  key: PlatformKey;
  label: string;
  available: boolean; // false → coming soon (no dataset)
}

export const PLATFORM_OPTIONS: PlatformOption[] = [
  { key: "sea-google", label: "Google Ads", available: true },
  { key: "sea-bing", label: "Microsoft Ads", available: true },
  { key: "meta", label: "Meta", available: true },
  { key: "linkedin", label: "LinkedIn", available: true },
  { key: "tiktok", label: "TikTok", available: true },
  { key: "snapchat", label: "Snapchat", available: true },
  { key: "reddit", label: "Reddit", available: false },
];

export interface BrandContext {
  brandName: string;
  model: BusinessModel;
  namingConvention: string;   // e.g. "[Market]_[Funnel]_[Objective]"
  demographics: string;
  /** Platforms the brand actively runs — drives which tabs appear */
  selectedPlatforms: PlatformKey[];
  /** Industry vertical — used to calibrate keyword quality score thresholds */
  industry?: string;
  /** Whether the brand has CRM data available for customer match audiences */
  hasCrmData?: boolean;
  /** Whether the brand has a product feed (Shopping / PMax feed campaigns) */
  hasProductFeed?: boolean;
}

export const DEFAULT_BRAND_CONTEXT: BrandContext = {
  brandName: "",
  model: "",
  namingConvention: "",
  demographics: "",
  selectedPlatforms: PLATFORM_OPTIONS.filter(p => p.available).map(p => p.key),
  industry: "",
  hasCrmData: false,
  hasProductFeed: false,
};

/** Fixed benchmark used by the radar chart (previously dynamic). */
export function getEffectiveBenchmark(_ctx: BrandContext): number {
  return 70;
}
