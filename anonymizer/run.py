"""DMA Pulse anonymizer runner — a `bq`-free alternative to deploy.sh.

Usage (from the repo root, no install needed):
  uv run --with google-cloud-bigquery --with google-cloud-bigquery-datatransfer anonymizer/run.py setup
  uv run ... anonymizer/run.py grants      # needs the service account to exist (see README)
  uv run ... anonymizer/run.py schedule    # creates the daily scheduled query
  uv run ... anonymizer/run.py run         # runs anonymize.sql once, now
  uv run ... anonymizer/run.py verify      # row-count + leak checks (should print nothing)

Uses Application Default Credentials (`gcloud auth application-default login`).
"""
import sys
from pathlib import Path

from google.cloud import bigquery

PROJECT = "paid-media-2a86"
SRC_DATASET = "google_ads"
DST_DATASET = "anonymized_data"
KEYS_DATASET = "anonymization_keys"
SA_EMAIL = f"dma-pulse-anonymizer@{PROJECT}.iam.gserviceaccount.com"
DISPLAY_NAME = "DMA Pulse anonymizer"
SCHEDULE = "every day 07:00"  # after the daily Data Transfer refresh of google_ads
HERE = Path(__file__).parent

client = bigquery.Client(project=PROJECT)
LOCATION = client.get_dataset(f"{PROJECT}.{SRC_DATASET}").location


def read(name: str) -> str:
    return (HERE / name).read_text(encoding="utf-8")


def execute(sql: str, label: str):
    print(f"==> {label}...")
    job = client.query(sql, location=LOCATION)
    rows = list(job.result())
    print(f"    done ({job.job_id})")
    return rows


def setup():
    execute(read("setup.sql").replace("__LOCATION__", LOCATION), "setup.sql")


def grants():
    # Dataset-level grants so the service account can't touch anything else.
    for dataset, role in [
        (SRC_DATASET, "roles/bigquery.dataViewer"),
        (DST_DATASET, "roles/bigquery.dataEditor"),
        (KEYS_DATASET, "roles/bigquery.dataEditor"),
    ]:
        execute(
            f"GRANT `{role}` ON SCHEMA `{PROJECT}.{dataset}` TO 'serviceAccount:{SA_EMAIL}'",
            f"grant {role} on {dataset}",
        )


def schedule():
    from google.cloud import bigquery_datatransfer
    from google.protobuf import struct_pb2

    dts = bigquery_datatransfer.DataTransferServiceClient()
    parent = f"projects/{PROJECT}/locations/{LOCATION}"
    params = struct_pb2.Struct()
    params.update({"query": read("anonymize.sql")})
    for cfg in dts.list_transfer_configs(parent=parent):
        if cfg.display_name == DISPLAY_NAME:
            # The schedule holds a copy of anonymize.sql, so re-publish it.
            from google.protobuf import field_mask_pb2

            cfg.params = params
            dts.update_transfer_config(
                transfer_config=cfg,
                update_mask=field_mask_pb2.FieldMask(paths=["params"]),
            )
            print(f"Updated the query of '{DISPLAY_NAME}'.")
            return
    cfg = dts.create_transfer_config(
        request={
            "parent": parent,
            "service_account_name": SA_EMAIL,
            "transfer_config": bigquery_datatransfer.TransferConfig(
                display_name=DISPLAY_NAME,
                data_source_id="scheduled_query",
                params=params,
                schedule=SCHEDULE,
            ),
        }
    )
    print(f"Created {cfg.name}")


def run():
    rows = execute(read("anonymize.sql"), "anonymize.sql")
    for r in rows:
        print("   ", dict(r))


def verify():
    # verify.sql is a script with several SELECTs; result() only returns the
    # last one, so collect rows from every child job.
    print("==> verify.sql...")
    job = client.query(read("verify.sql"), location=LOCATION)
    job.result()
    problems = []
    for child in client.list_jobs(parent_job=job.job_id):
        if child.statement_type == "SELECT":
            # Only the labelled checks; skips the helper SELECTs behind SET statements.
            problems += [dict(r) for r in child.result() if "check_name" in r.keys()]
    print("OK: nothing to report." if not problems else "PROBLEMS FOUND:")
    for p in problems:
        print("   ", p)


COMMANDS = {"setup": setup, "grants": grants, "schedule": schedule, "run": run, "verify": verify}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]]()
