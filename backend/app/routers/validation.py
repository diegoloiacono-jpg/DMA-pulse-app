from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.models.audit import AuditStatus, SpecialistResult
from app.routers.audit import audit_sessions
from app.services.scoring import run_scoring_agent

router = APIRouter()


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


class SpecialistValidationPayload(BaseModel):
    # Only the topics the human changed; all others are kept as-is
    overrides: list[SpecialistResult] = []


class ScoringValidationPayload(BaseModel):
    approved: bool


def _run_scoring(audit_id: str) -> None:
    """Background task: run the scoring agent after specialist validation."""
    state = audit_sessions[audit_id]
    try:
        state.status = AuditStatus.SCORING_RUNNING
        state.updated_at = _now()

        state.scoring_output = run_scoring_agent(
            results=state.specialist_results,
            brand_model=state.brand_context.model,
            platform_id=state.brand_context.selectedPlatforms[0]
            if state.brand_context.selectedPlatforms
            else "sea-google",
        )

        state.status = AuditStatus.SCORING_REVIEW
        state.updated_at = _now()

    except Exception as exc:
        state.status = AuditStatus.FAILED
        state.updated_at = _now()
        state.error = str(exc)


@router.post("/{audit_id}/validate/specialist")
def validate_specialist(
    audit_id: str,
    payload: SpecialistValidationPayload,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Human approves (and optionally overrides) specialist results.
    Transitions state to SCORING_RUNNING and fires the scoring agent.
    """
    state = audit_sessions.get(audit_id)
    if not state:
        raise HTTPException(status_code=404, detail="Audit not found")
    if state.status != AuditStatus.SPECIALIST_REVIEW:
        raise HTTPException(
            status_code=409,
            detail=f"Expected status specialist_review, got {state.status}",
        )

    # Merge overrides: replace matching topics, keep everything else
    if payload.overrides:
        override_map = {(o.category, o.topic): o for o in payload.overrides}
        merged = []
        for r in state.specialist_results:
            key = (r.category, r.topic)
            if key in override_map:
                overridden = override_map[key]
                overridden.human_override = True
                merged.append(overridden)
            else:
                merged.append(r)
        state.specialist_results = merged

    state.updated_at = _now()
    background_tasks.add_task(_run_scoring, audit_id)
    return {"audit_id": audit_id, "status": AuditStatus.SCORING_RUNNING}


@router.post("/{audit_id}/validate/scoring")
def validate_scoring(
    audit_id: str,
    payload: ScoringValidationPayload,
) -> dict:
    """
    Human approves the scoring output.
    If approved → COMPLETE.  If not → back to SCORING_REVIEW (analyst can re-run).
    """
    state = audit_sessions.get(audit_id)
    if not state:
        raise HTTPException(status_code=404, detail="Audit not found")
    if state.status != AuditStatus.SCORING_REVIEW:
        raise HTTPException(
            status_code=409,
            detail=f"Expected status scoring_review, got {state.status}",
        )

    if payload.approved:
        state.status = AuditStatus.COMPLETE
    # If not approved the analyst can adjust specialist results and re-call validate/specialist
    # so we leave the state at SCORING_REVIEW for now

    state.updated_at = _now()
    return {"audit_id": audit_id, "status": state.status}
