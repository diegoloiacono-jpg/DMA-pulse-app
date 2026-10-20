from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.config import DEFAULT_ACCOUNT_ID, SEO_BQ_DATASET
from app.models.audit import (
    AuditRunRequest,
    AuditState,
    AuditStatus,
    ScoringOutput,
    SeoAuditParams,
)
from app.services.bigquery import resolve_account_id
from app.services.data_extraction import extract_audit_data
from app.services.seo_pipeline import extract_seo_audit_data, normalise_site, run_seo_specialist
from app.services.specialist import run_specialist_agent

router = APIRouter()

# In-memory store — sufficient for local/single-process use
audit_sessions: dict[str, AuditState] = {}


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _run_pipeline(audit_id: str, account_id: str, dataset: str | None = None, lookback_days: int = 30) -> None:
    """Background task: extract data then run the specialist agent."""
    state = audit_sessions[audit_id]

    try:
        # --- Extraction ---
        state.status = AuditStatus.EXTRACTING
        state.updated_at = _now()
        audit_data = extract_audit_data(account_id, dataset=dataset, lookback_days=lookback_days)

        # --- Specialist ---
        state.status = AuditStatus.SPECIALIST_RUNNING
        state.updated_at = _now()
        state.specialist_results = run_specialist_agent(audit_data, state.brand_context)

        state.status = AuditStatus.SPECIALIST_REVIEW
        state.updated_at = _now()

    except Exception as exc:
        state.status = AuditStatus.FAILED
        state.error = str(exc)
        state.updated_at = _now()


def _run_seo_pipeline(audit_id: str, params: SeoAuditParams) -> None:
    """Background task for the SEO platform: same steps and statuses as _run_pipeline."""
    state = audit_sessions[audit_id]

    try:
        state.status = AuditStatus.EXTRACTING
        state.updated_at = _now()
        audit_data = extract_seo_audit_data(params, state.brand_context)

        state.status = AuditStatus.SPECIALIST_RUNNING
        state.updated_at = _now()
        state.specialist_results = run_seo_specialist(audit_data, state.brand_context, params)

        state.status = AuditStatus.SPECIALIST_REVIEW
        state.updated_at = _now()

    except Exception as exc:
        state.status = AuditStatus.FAILED
        state.error = str(exc)
        state.updated_at = _now()


def _start_seo_audit(payload: AuditRunRequest, background_tasks: BackgroundTasks) -> dict:
    if not payload.seo or not normalise_site(payload.seo.domain):
        raise HTTPException(status_code=422, detail="An SEO audit needs seo.domain (e.g. www.client.nl)")
    audit_id = str(uuid.uuid4())
    now = _now()
    # Scoring picks the platform from selectedPlatforms[0] (routers/validation.py)
    brand_context = payload.brand_context.model_copy(update={"selectedPlatforms": ["seo"]})
    audit_sessions[audit_id] = AuditState(
        audit_id=audit_id,
        brand_context=brand_context,
        status=AuditStatus.PENDING,
        created_at=now,
        updated_at=now,
    )
    background_tasks.add_task(_run_seo_pipeline, audit_id, payload.seo)
    return {"audit_id": audit_id, "status": AuditStatus.PENDING}


@router.get("/seo/support")
def seo_support() -> dict:
    """Lets the SEO tab check that this backend runs SEO audits (older ones would ignore platform)."""
    return {"seo": True, "dataset": SEO_BQ_DATASET}


@router.post("/run", response_model=dict)
def run_audit(payload: AuditRunRequest, background_tasks: BackgroundTasks) -> dict:
    """Kick off a new audit and immediately return the audit_id."""
    if payload.platform == "seo":
        return _start_seo_audit(payload, background_tasks)
    audit_id = str(uuid.uuid4())
    dataset = payload.dataset or None
    # An account picked in the UI is already in the dataset's own ID space. Only
    # the configured default is a real ID that may need mapping (anonymized data).
    account_id = payload.account_id or resolve_account_id(DEFAULT_ACCOUNT_ID, dataset)
    lookback_days = payload.lookback_days
    now = _now()

    audit_sessions[audit_id] = AuditState(
        audit_id=audit_id,
        brand_context=payload.brand_context,
        status=AuditStatus.PENDING,
        created_at=now,
        updated_at=now,
    )

    background_tasks.add_task(_run_pipeline, audit_id, account_id, dataset, lookback_days)
    return {"audit_id": audit_id, "status": AuditStatus.PENDING}


@router.get("/{audit_id}", response_model=AuditState)
def get_audit(audit_id: str) -> AuditState:
    """Poll the current state of an audit."""
    state = audit_sessions.get(audit_id)
    if not state:
        raise HTTPException(status_code=404, detail="Audit not found")
    return state


@router.get("/{audit_id}/results", response_model=ScoringOutput)
def get_results(audit_id: str) -> ScoringOutput:
    """Return the final ScoringOutput (only available when status == complete)."""
    state = audit_sessions.get(audit_id)
    if not state:
        raise HTTPException(status_code=404, detail="Audit not found")
    if state.status != AuditStatus.COMPLETE or not state.scoring_output:
        raise HTTPException(status_code=409, detail=f"Audit not complete (status: {state.status})")
    return state.scoring_output
