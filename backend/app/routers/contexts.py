"""Saved brand context CRUD — durable replacement for browser localStorage."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.brand import BrandContext
from app.services import context_store

router = APIRouter()


class SavedContext(BaseModel):
    """Mirrors the frontend SavedContext shape so the client can round-trip it."""

    id: str
    label: str
    context: BrandContext
    savedAt: str = ""


class SavedContextPayload(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    context: BrandContext


def _require_valid_id(context_id: str) -> None:
    if not context_store.valid_id(context_id):
        raise HTTPException(status_code=400, detail="Invalid context id")


@router.get("", response_model=list[SavedContext])
def list_contexts() -> list[SavedContext]:
    try:
        raw = context_store.list_contexts()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Context store unavailable: {str(exc)[:200]}") from exc
    # Skip anything that no longer matches the schema rather than failing the
    # whole list — an old or hand-edited object shouldn't block the dropdown.
    out: list[SavedContext] = []
    for item in raw:
        try:
            out.append(SavedContext(**item))
        except Exception:
            continue
    return out


@router.put("/{context_id}", response_model=SavedContext)
def put_context(context_id: str, payload: SavedContextPayload) -> SavedContext:
    _require_valid_id(context_id)
    entry = SavedContext(
        id=context_id,
        label=payload.label,
        context=payload.context,
        savedAt=datetime.now(tz=timezone.utc).isoformat(),
    )
    try:
        context_store.put_context(context_id, entry.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not save context: {str(exc)[:200]}") from exc
    return entry


@router.delete("/{context_id}")
def delete_context(context_id: str) -> dict:
    _require_valid_id(context_id)
    try:
        deleted = context_store.delete_context(context_id)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not delete context: {str(exc)[:200]}") from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Context not found")
    return {"id": context_id, "deleted": True}
