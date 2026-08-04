import os
from dotenv import load_dotenv
from google.cloud import bigquery

load_dotenv()

GCP_PROJECT: str         = os.getenv("GCP_PROJECT",         "paid-media-2a86")
BQ_DATASET: str          = os.getenv("BQ_DATASET",          "google_ads")
DEFAULT_ACCOUNT_ID: str  = os.getenv("DEFAULT_ACCOUNT_ID",  "3676622146")
DEFAULT_LOOKBACK_DAYS: int = int(os.getenv("DEFAULT_LOOKBACK_DAYS", "30"))
MODEL_DATASET: str       = os.getenv("MODEL_DATASET",       "google_ads_audit")

SPECIALIST_MODEL: str = f"{GCP_PROJECT}.{MODEL_DATASET}.gemini_3_auditor"
SCORING_MODEL: str    = f"{GCP_PROJECT}.{MODEL_DATASET}.gemini_model"

# Initialised once at import time; uses Application Default Credentials automatically.
bq_client: bigquery.Client = bigquery.Client(project=GCP_PROJECT)
