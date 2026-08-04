from __future__ import annotations

from datetime import date, timedelta

import pandas as pd
from google.cloud import bigquery

from app.config import GCP_PROJECT, bq_client


def run_query(sql: str, params: list[bigquery.ScalarQueryParameter] | None = None) -> pd.DataFrame:
    """Execute a BigQuery SQL string and return the result as a DataFrame."""
    job_config = bigquery.QueryJobConfig(query_parameters=params or [])
    job = bq_client.query(sql, job_config=job_config)
    return job.result().to_dataframe()


def table(name: str, dataset: str | None = None) -> str:
    """Return a fully-qualified table reference: `project.dataset.name`.

    The Supermetrics export has no per-account table suffix — every account
    is a row in the same flat table, filtered via account_param() instead.
    """
    from app.config import BQ_DATASET
    ds = dataset or BQ_DATASET
    return f"`{GCP_PROJECT}.{ds}.{name}`"


def account_param(account_id: str) -> bigquery.ScalarQueryParameter:
    """Query parameter for `WHERE ACCOUNT_ID = @account_id`."""
    return bigquery.ScalarQueryParameter("account_id", "STRING", account_id)


def cutoff_date_param(lookback_days: int, name: str = "cutoff_date") -> bigquery.ScalarQueryParameter:
    """Query parameter for `WHERE DATE >= @cutoff_date`, computed from a lookback window in days."""
    return bigquery.ScalarQueryParameter(name, "DATE", date.today() - timedelta(days=lookback_days))


def latest_row_qualifier(*key_cols: str) -> str:
    """QUALIFY clause selecting the most recent row per key — replaces the old
    _PARTITIONTIME "latest snapshot" pattern now that every row is just DATE-stamped.
    """
    keys = ", ".join(key_cols)
    return f"QUALIFY ROW_NUMBER() OVER (PARTITION BY {keys} ORDER BY DATE DESC) = 1"
