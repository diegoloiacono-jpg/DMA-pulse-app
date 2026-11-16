from typing import Literal
from pydantic import BaseModel


class SeoContext(BaseModel):
    """Brand context fields that only the SEO platform uses (see seo/SEO_METRICS.md). The SEO tab has no form for them:
    apply_pulse_context fills them from the SEO pulse run (the n8n form, table pulse_runs)."""
    siteUrl: str = ""
    brandTerms: list[str] = []
    competitors: list[str] = []
    # None = unknown (False would make topics not applicable)
    hasOnlineSales: bool | None = None
    isNotable: bool | None = None
    trainingBots: Literal["allow", "block"] | None = None
    snippetExceptions: list[str] = []


class BrandContext(BaseModel):
    brandName: str
    model: Literal["B2B", "B2C", "D2C"]
    namingConvention: str = ""
    demographics: str = ""
    markets: list[str] = []
    selectedPlatforms: list[str] = ["sea-google"]
    industry: str = ""
    hasCrmData: bool = False
    hasProductFeed: bool = False
    # Only filled for SEO audits; Google Ads ignores it
    seo: SeoContext | None = None
