import logging
import os

import re

from fastapi import FastAPI, HTTPException, Request

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.routers import audit, contexts, validation
from app.config import GCP_PROJECT, bq_client
from app.services.bigquery import resolve_account_names, run_query

app = FastAPI(title="DMA Pulse API", version="0.1.0")

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:8080,http://localhost:5173")
_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
ALLOWED_DOMAIN = "artefact.com"
_NO_AUTH_PATHS = {"/health", "/", "/docs", "/openapi.json", "/redoc"}

_google_request = google_requests.Request()


# Auth middleware registered first so CORSMiddleware (added after) wraps it as the outermost layer.
# This ensures CORS headers are always present, including on 401/403 short-circuit responses.
@app.middleware("http")
async def verify_google_token(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path in _NO_AUTH_PATHS or not GOOGLE_CLIENT_ID:
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid Authorization header"})

    token = auth_header[7:]
    try:
        idinfo = id_token.verify_oauth2_token(token, _google_request, GOOGLE_CLIENT_ID)
    except ValueError as exc:
        return JSONResponse(status_code=401, content={"detail": f"Invalid token: {exc}"})

    email: str = idinfo.get("email", "")
    hd: str = idinfo.get("hd", "")
    if not (email.endswith(f"@{ALLOWED_DOMAIN}") or hd == ALLOWED_DOMAIN):
        return JSONResponse(status_code=403, content={"detail": f"Access restricted to @{ALLOWED_DOMAIN} accounts"})

    request.state.user_email = email
    return await call_next(request)


# CORSMiddleware added last = outermost layer, so it adds CORS headers to every response.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"https://.*\.run\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(audit.router, prefix="/api/audit", tags=["audit"])
app.include_router(validation.router, prefix="/api/audit", tags=["validation"])
app.include_router(contexts.router, prefix="/api/contexts", tags=["contexts"])


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/datasets")
def list_datasets() -> dict:
    datasets = [d.dataset_id for d in bq_client.list_datasets(project=GCP_PROJECT)]
    return {"datasets": sorted(datasets)}


_DATASET_ID_RE = re.compile(r"^[A-Za-z0-9_]+$")


@app.get("/api/datasets/{dataset}/accounts")
def list_accounts(dataset: str) -> dict:
    """List the Google Ads accounts blended into a dataset.

    Accounts are keyed by PROFILE_ID (the export's name for the Google Ads
    customer id). The account roster comes from GOOGLEADS_CUSTOMERMETADATA,
    restricted to accounts that actually have campaign stats in the window the
    audit can read — an account present in metadata but with no facts would
    produce an empty audit.
    """
    if not _DATASET_ID_RE.match(dataset):
        raise HTTPException(status_code=400, detail="Invalid dataset name")

    sql = f"""
    WITH with_data AS (
        SELECT PROFILE_ID, MAX(DATE) AS last_date, SUM(COST) AS cost
        FROM `{GCP_PROJECT}.{dataset}.GOOGLEADS_P_CAMPAIGNBASICSTATS`
        GROUP BY PROFILE_ID
    )
    SELECT
        c.PROFILE_ID   AS account_id,
        c.PROFILE      AS account_name,
        d.last_date    AS last_date
    FROM `{GCP_PROJECT}.{dataset}.GOOGLEADS_CUSTOMERMETADATA` c
    JOIN with_data d USING (PROFILE_ID)
    ORDER BY d.cost DESC
    """
    try:
        df = run_query(sql)
    except Exception as exc:
        # Surface the reason instead of 500ing — the UI shows it inline so a
        # schema change here is visible rather than silently degrading to the
        # server-default account.
        logging.warning("list_accounts failed for dataset %s: %s", dataset, exc)
        raise HTTPException(
            status_code=422,
            detail=f"Could not list accounts in dataset '{dataset}': {str(exc)[:200]}",
        ) from exc

    accounts = df.astype(str).to_dict(orient="records")
    # Anonymized datasets: show the real account names in the dropdown. Display
    # only — account_id stays in the dataset's own (anonymized) ID space.
    real_names = resolve_account_names([a["account_name"] for a in accounts], dataset)
    for a in accounts:
        a["account_name"] = real_names.get(a["account_name"], a["account_name"])
    return {"accounts": accounts}
