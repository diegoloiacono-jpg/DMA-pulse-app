import os
from dotenv import load_dotenv
from google.cloud import bigquery

load_dotenv()

GCP_PROJECT: str = os.getenv("GCP_PROJECT", "coi-innovation-testing-8166")
BQ_DATASET: str = os.getenv("BQ_DATASET", "google_ads_audit")
ACCOUNT_SUFFIX: str = os.getenv("ACCOUNT_SUFFIX", "9149667192")

SPECIALIST_MODEL: str = f"{GCP_PROJECT}.{BQ_DATASET}.gemini_3_auditor"
SCORING_MODEL: str = f"{GCP_PROJECT}.{BQ_DATASET}.gemini_model"

# Initialised once at import time; uses Application Default Credentials automatically.
bq_client: bigquery.Client = bigquery.Client(project=GCP_PROJECT)
