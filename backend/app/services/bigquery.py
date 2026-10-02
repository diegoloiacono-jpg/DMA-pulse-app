from __future__ import annotations

import logging
from datetime import date, timedelta

import pandas as pd
from google.cloud import bigquery

from app.config import GCP_PROJECT, bq_client

logger = logging.getLogger(__name__)


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


def resolve_account_id(account_id: str, dataset: str | None = None) -> str:
    """Translate a real account ID to its anonymized value when reading an
    anonymized dataset (anonymizer/ remaps account IDs), so a configured default
    account keeps working. Any other dataset, an unmapped ID, or an unreadable
    mapping returns the ID unchanged.
    """
    from app.config import ANON_KEYS_DATASET, BQ_DATASET

    ds = dataset or BQ_DATASET
    if not ds.startswith("anonymized") or not account_id:
        return account_id
    try:
        df = run_query(
            f"SELECT anonymized_value FROM `{GCP_PROJECT}.{ANON_KEYS_DATASET}._anon_mapping` "
            "WHERE entity_type = 'ACCOUNT_ID' AND original_value = @account_id LIMIT 1",
            [account_param(account_id)],
        )
    except Exception:
        logger.warning("Could not read the account ID mapping; using the ID as given")
        return account_id
    return str(df.iloc[0, 0]) if not df.empty else account_id


def resolve_account_names(names: list[str], dataset: str | None = None) -> dict[str, str]:
    """Map anonymized account names (e.g. 'account003') back to the real names,
    for display only. Returns {} for non-anonymized datasets or when the mapping
    can't be read, so callers fall back to the names as stored. The anonymizer
    keeps names upper-cased, so the real names come back upper-cased.
    """
    from app.config import ANON_KEYS_DATASET, BQ_DATASET

    ds = dataset or BQ_DATASET
    if not ds.startswith("anonymized") or not names:
        return {}
    try:
        df = run_query(
            f"SELECT anonymized_value, term FROM `{GCP_PROJECT}.{ANON_KEYS_DATASET}._anon_sensitive_terms` "
            "WHERE entity_type = 'ACCOUNT' AND anonymized_value IN UNNEST(@names)",
            [bigquery.ArrayQueryParameter("names", "STRING", names)],
        )
    except Exception:
        logger.warning("Could not read the account name mapping; showing names as stored")
        return {}
    return dict(zip(df["anonymized_value"], df["term"]))


def cutoff_date_param(lookback_days: int, name: str = "cutoff_date") -> bigquery.ScalarQueryParameter:
    """Query parameter for `WHERE DATE >= @cutoff_date`, computed from a lookback window in days."""
    return bigquery.ScalarQueryParameter(name, "DATE", date.today() - timedelta(days=lookback_days))


def latest_row_qualifier(*key_cols: str) -> str:
    """QUALIFY clause selecting the most recent row per key — replaces the old
    _PARTITIONTIME "latest snapshot" pattern now that every row is just DATE-stamped.
    """
    keys = ", ".join(key_cols)
    return f"QUALIFY ROW_NUMBER() OVER (PARTITION BY {keys} ORDER BY DATE DESC) = 1"
