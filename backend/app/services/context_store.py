"""Durable storage for saved brand contexts, backed by Google Cloud Storage.

Brand contexts used to live in browser localStorage, so they were per-browser
and vanished whenever someone switched machine or cleared site data.

Layout: one JSON object per context at `contexts/{id}.json`.

Storing each context as its own object (rather than a single contexts.json) means
concurrent saves from different analysts can never clobber one another — there is
no read-modify-write cycle to race. Listing is a prefix scan, which is fine at the
scale this sees (tens of contexts, not thousands).
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from google.api_core import exceptions as gcloud_exc
from google.cloud import storage

from app.config import CONTEXT_BUCKET, GCP_PROJECT

logger = logging.getLogger(__name__)

_PREFIX = "contexts/"
# Ids come from the client (crypto.randomUUID) — constrain them before they are
# interpolated into an object path so a crafted id cannot escape the prefix.
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

_client: storage.Client | None = None
_bucket_handle: storage.Bucket | None = None


def _bucket() -> storage.Bucket:
    """Return a handle to the contexts bucket.

    Deliberately does NOT create the bucket. Provisioning belongs to deploy.sh,
    which also applies uniform access, public-access prevention and versioning —
    creating it here would silently produce a bucket without those settings, and
    would require granting the runtime service account bucket-create rights it
    otherwise does not need. The handle is cached, so there is no existence
    check on the request path.
    """
    global _client, _bucket_handle
    if _bucket_handle is None:
        if _client is None:
            _client = storage.Client(project=GCP_PROJECT)
        _bucket_handle = _client.bucket(CONTEXT_BUCKET)
    return _bucket_handle


def valid_id(context_id: str) -> bool:
    return bool(_ID_RE.match(context_id))


def _blob_name(context_id: str) -> str:
    return f"{_PREFIX}{context_id}.json"


def list_contexts() -> list[dict[str, Any]]:
    """Return every saved context, newest first."""
    out: list[dict[str, Any]] = []
    for blob in _bucket().list_blobs(prefix=_PREFIX):
        if not blob.name.endswith(".json"):
            continue
        try:
            out.append(json.loads(blob.download_as_bytes()))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            # One corrupt object must not break the whole list.
            logger.warning("Skipping unreadable context %s: %s", blob.name, exc)
    out.sort(key=lambda c: str(c.get("savedAt", "")), reverse=True)
    return out


def get_context(context_id: str) -> dict[str, Any] | None:
    blob = _bucket().blob(_blob_name(context_id))
    try:
        return json.loads(blob.download_as_bytes())
    except gcloud_exc.NotFound:
        return None


def put_context(context_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    blob = _bucket().blob(_blob_name(context_id))
    blob.upload_from_string(
        json.dumps(payload, ensure_ascii=False),
        content_type="application/json",
    )
    return payload


def delete_context(context_id: str) -> bool:
    blob = _bucket().blob(_blob_name(context_id))
    try:
        blob.delete()
        return True
    except gcloud_exc.NotFound:
        return False
