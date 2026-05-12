from typing import Literal
from pydantic import BaseModel


class BrandContext(BaseModel):
    brandName: str
    model: Literal["B2B", "B2C", "D2C"]
    namingConvention: str = ""
    markets: list[str] = []
    selectedPlatforms: list[str] = ["sea-google"]
