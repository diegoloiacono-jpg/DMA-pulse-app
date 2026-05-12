from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel

from app.models.brand import BrandContext


class AuditStatus(str, Enum):
    PENDING = "pending"
    EXTRACTING = "extracting"
    SPECIALIST_RUNNING = "specialist_running"
    SPECIALIST_REVIEW = "specialist_review"
    SCORING_RUNNING = "scoring_running"
    SCORING_REVIEW = "scoring_review"
    COMPLETE = "complete"
    FAILED = "failed"


class SpecialistResult(BaseModel):
    topic: str
    category: str
    status: Literal["pass", "fail", "warn"]
    level: Literal["basic", "advanced", "expert", "champion"]
    # Human-readable pointer to the BigQuery column(s) that informed this result
    source: str
    action: str
    explanation: str
    human_override: bool = False


class CategoryScore(BaseModel):
    name: str
    score: float        # 0–100 weighted
    pass_rate: float    # % topics with level >= advanced
    weight: float       # base weight before business-model multipliers


class PrioritizedWin(BaseModel):
    topic: str
    category: str
    impact: float       # 1–10
    confidence: float   # 1–10
    ease: float         # 1–10
    priority_score: float   # (impact * confidence * ease), capped at 10
    action: str
    explanation: str


class ScoringOutput(BaseModel):
    platform_id: str
    category_scores: list[CategoryScore]
    platform_score: float           # 0–100 business-model-adjusted
    omnichannel_score: float | None = None
    maturity_label: Literal["Basic", "Advanced", "Expert", "Champion"]
    quick_wins: list[PrioritizedWin]


class AuditRunRequest(BaseModel):
    brand_context: BrandContext
    account_id: str | None = None   # overrides ACCOUNT_SUFFIX from env if provided


class AuditState(BaseModel):
    audit_id: str
    brand_context: BrandContext
    status: AuditStatus = AuditStatus.PENDING
    specialist_results: list[SpecialistResult] = []
    scoring_output: ScoringOutput | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime
