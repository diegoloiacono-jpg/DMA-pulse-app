import os
from dotenv import load_dotenv
from google.cloud import bigquery

load_dotenv()

GCP_PROJECT: str    = os.getenv("GCP_PROJECT",    "coi-innovation-testing-8166")
BQ_DATASET: str     = os.getenv("BQ_DATASET",     "bwj_google_ads")
ACCOUNT_SUFFIX: str = os.getenv("ACCOUNT_SUFFIX", "6600502562")
MODEL_DATASET: str  = os.getenv("MODEL_DATASET",  "google_ads_audit")

SPECIALIST_MODEL: str = f"{GCP_PROJECT}.{MODEL_DATASET}.gemini_3_auditor"
SCORING_MODEL: str    = f"{GCP_PROJECT}.{MODEL_DATASET}.gemini_model"

# Initialised once at import time; uses Application Default Credentials automatically.
bq_client: bigquery.Client = bigquery.Client(project=GCP_PROJECT)
