from typing import Literal
from pydantic import BaseModel


class SeoContext(BaseModel):
    """Brand context fields that only the SEO platform uses (see seo/SEO_METRICS.md)."""
    siteUrl: str = ""
    brandTerms: list[str] = []
    competitors: list[str] = []
    pageTypes: dict[str, str] = {}
    keywordMappingUrl: str = ""
    keywordMappingDate: str = ""
    # Not asked in the SEO form: None = unknown (False/0 would make topics not applicable)
    hasOnlineSales: bool | None = None
    lowSearchVolume: bool | None = None
    locations: int | None = None
    reviewPlatforms: list[str] = []
    expectedProfiles: list[str] = []
    aiBotPolicy: dict[str, str] = {}
    snippetExceptions: list[str] = []
    aiShoppingPlatforms: list[str] = []


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
