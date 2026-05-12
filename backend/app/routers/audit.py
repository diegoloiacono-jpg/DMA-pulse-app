from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.config import ACCOUNT_SUFFIX
from app.models.audit import (
    AuditRunRequest,
    AuditState,
    AuditStatus,
    ScoringOutput,
)
from app.services.data_extraction import extract_audit_data
from app.services.specialist import run_specialist_agent

router = APIRouter()

# In-memory store — sufficient for local/single-process use
audit_sessions: dict[str, AuditState] = {}


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _run_pipeline(audit_id: str, suffix: str) -> None:
    """Background task: extract data then run the specialist agent."""
    state = audit_sessions[audit_id]

    try:
        # --- Extraction ---
        state.status = AuditStatus.EXTRACTING
        state.updated_at = _now()
        audit_data = extract_audit_data(suffix)

        # --- Specialist ---
        state.status = AuditStatus.SPECIALIST_RUNNING
        state.updated_at = _now()
        state.specialist_results = run_specialist_agent(audit_data)

        state.status = AuditStatus.SPECIALIST_REVIEW
        state.updated_at = _now()

    except Exception as exc:
        state.status = AuditStatus.FAILED
        state.error = str(exc)
        state.updated_at = _now()


@router.post("/run", response_model=dict)
def run_audit(payload: AuditRunRequest, background_tasks: BackgroundTasks) -> dict:
    """Kick off a new audit and immediately return the audit_id."""
    audit_id = str(uuid.uuid4())
    suffix = payload.account_id or ACCOUNT_SUFFIX
    now = _now()

    audit_sessions[audit_id] = AuditState(
        audit_id=audit_id,
        brand_context=payload.brand_context,
        status=AuditStatus.PENDING,
        created_at=now,
        updated_at=now,
    )

    background_tasks.add_task(_run_pipeline, audit_id, suffix)
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
