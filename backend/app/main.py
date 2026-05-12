import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import audit, validation

app = FastAPI(title="DMA Pulse API", version="0.1.0")

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:8080,http://localhost:5173")
_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"https://.*\.run\.app" if "*" in _raw_origins else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(audit.router, prefix="/api/audit", tags=["audit"])
app.include_router(validation.router, prefix="/api/audit", tags=["validation"])


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
