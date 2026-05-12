from __future__ import annotations

import pandas as pd
from google.cloud import bigquery

from app.config import GCP_PROJECT, bq_client


def run_query(sql: str, params: list[bigquery.ScalarQueryParameter] | None = None) -> pd.DataFrame:
    """Execute a BigQuery SQL string and return the result as a DataFrame."""
    job_config = bigquery.QueryJobConfig(query_parameters=params or [])
    job = bq_client.query(sql, job_config=job_config)
    return job.result().to_dataframe()


def table(name: str, suffix: str) -> str:
    """Return a fully-qualified table reference: `project.dataset.name_suffix`."""
    from app.config import BQ_DATASET
    return f"`{GCP_PROJECT}.{BQ_DATASET}.{name}_{suffix}`"
