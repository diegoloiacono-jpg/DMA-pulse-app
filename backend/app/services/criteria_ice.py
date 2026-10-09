"""Impact / Confidence / Ease (1-5) per audit topic.

Source: documents/_Paid Search DMA pulse Criteria (2026).docx.
Keyed "category::topic_lower". Tuple order: (impact, confidence, ease).
"""
from __future__ import annotations

# Topics absent from the 2026 criteria sheet keep their previous impact and use a
# neutral confidence/ease until the sheet covers them.
DEFAULT_ICE: tuple[float, float, float] = (3.0, 3.0, 3.0)

CRITERIA_ICE: dict[str, tuple[float, float, float]] = {
    # campaign_setup
    "campaign_setup::campaign naming convention": (2, 4, 5),
    "campaign_setup::campaign status hygiene": (4, 4, 5),
    "campaign_setup::bidding strategy": (5, 5, 5),
    "campaign_setup::budget allocation": (5, 5, 5),
    "campaign_setup::campaign type mix": (3, 4, 3),
    "campaign_setup::scheduling & dayparting": (2, 4, 5),
    "campaign_setup::data density": (4, 5, 5),
    # audience_targeting
    "audience_targeting::audience segmentation": (4, 4, 5),
    "audience_targeting::remarketing lists": (2, 4, 3),
    "audience_targeting::similar audiences / lookalikes": (5, 4, 3),
    "audience_targeting::demographic targeting": (2, 4, 4),
    "audience_targeting::geo targeting precision": (4, 4, 5),
    "audience_targeting::exclusion lists": (5, 4, 4),
    # conversion_kpi
    "conversion_kpi::conversion tracking setup": (5, 5, 3),
    "conversion_kpi::conversion categories": (5, 5, 5),
    "conversion_kpi::primary vs secondary conversions": (5, 4, 4),
    "conversion_kpi::roas / cpa targets": (5, 4, 4),
    "conversion_kpi::target stability": (4, 3, 3),
    "conversion_kpi::attribution model": (5, 4, 4),
    "conversion_kpi::cross-device conversions": (3, 3, 3),
    # feeds_catalogue
    "feeds_catalogue::product feed completeness": (5, 5, 3),
    "feeds_catalogue::product title optimisation": (4, 4, 3),
    "feeds_catalogue::feed segmentation": (3, 4, 3),
    "feeds_catalogue::shopping campaign structure": (4, 3, 3),
    "feeds_catalogue::dynamic remarketing feed": (5, 3, 3),
    "feeds_catalogue::conversational attributes": (2, 3, 2),
    # creative_content
    "creative_content::responsive search ad coverage": (4, 4, 4),
    "creative_content::asset group ad strength": (3, 3, 3),
    "creative_content::headline / description variety": (4, 4, 3),
    "creative_content::image & video assets": (3, 3, 2),
    "creative_content::ad policy compliance": (4, 4, 3),
    "creative_content::ad copy relevance": (4, 3, 4),
    # keyword_strategy
    "keyword_strategy::keyword match type distribution": (5, 5, 5),
    "keyword_strategy::negative keyword coverage": (4, 4, 3),
    "keyword_strategy::keyword quality scores": (4, 4, 2),
    "keyword_strategy::keyword status hygiene": (4, 3, 4),
    "keyword_strategy::ad group keyword structure": (4, 4, 3),
    "keyword_strategy::dsa / dynamic ad groups": (3, 2, 2),
    # ai_readiness (formerly pmax_performance)
    "ai_readiness::asset group strength": (4, 3, 3),
    "ai_readiness::audience signal quality": (3, 3, 2),
    "ai_readiness::smart bidding configuration": (3, 4, 4),
    "ai_readiness::pmax vs. standard campaign balance": (4, 5, 4),
    "ai_readiness::pmax vs standard campaign balance": (4, 5, 4),
    "ai_readiness::ai max": (4, 3, 4),
    "ai_readiness::native ai-driven generative tools in pmax": (3, 3, 3),
    # not in the 2026 sheet: impact carried over from the previous table
    "ai_readiness::pmax campaign adoption": (5, 3, 3),
    "ai_readiness::native ai-driven generative tools in ai max": (3, 3, 3),
}


def get_ice(category: str, topic: str) -> tuple[float, float, float]:
    key = f"{category.lower()}::{topic.lower()}"
    return CRITERIA_ICE.get(key, DEFAULT_ICE)
