import type { SeoContextPayload, SeoMaturity } from "@/lib/apiClient";

/** Empty SEO brand context (all fields of seo/SEO_METRICS.md, "Brand context"). */
export const DEFAULT_SEO_CONTEXT: SeoContextPayload = {
  siteUrl: "",
  brandTerms: [],
  competitors: [],
  pageTypes: {},
  keywordMappingUrl: "",
  keywordMappingDate: "",
  hasOnlineSales: false,
  lowSearchVolume: false,
  locations: 0,
  reviewPlatforms: [],
  expectedProfiles: [],
  aiBotPolicy: {},
  snippetExceptions: [],
  aiShoppingPlatforms: [],
};

/** Label for an SEO maturity result: "Basic (not yet complete)" when even Basic is not reached. */
export function seoMaturityText(maturity: SeoMaturity | null | undefined, fallback: string): string {
  return maturity && !maturity.basic_complete ? "Basic (not yet complete)" : fallback;
}
