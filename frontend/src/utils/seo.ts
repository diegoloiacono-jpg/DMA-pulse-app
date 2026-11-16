import type { SeoMaturity } from "@/lib/apiClient";

/** Label for an SEO maturity result: "Basic (not yet complete)" when even Basic is not reached. */
export function seoMaturityText(maturity: SeoMaturity | null | undefined, fallback: string): string {
  return maturity && !maturity.basic_complete ? "Basic (not yet complete)" : fallback;
}
