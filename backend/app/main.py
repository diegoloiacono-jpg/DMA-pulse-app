import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.routers import audit, validation
from app.config import GCP_PROJECT, bq_client

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


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/datasets")
def list_datasets() -> dict:
    datasets = [d.dataset_id for d in bq_client.list_datasets(project=GCP_PROJECT)]
    return {"datasets": sorted(datasets)}
