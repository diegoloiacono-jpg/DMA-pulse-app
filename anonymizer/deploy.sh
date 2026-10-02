#!/usr/bin/env bash
# DMA Pulse — deploy the BigQuery anonymizer (google_ads -> anonymized_data)
# Usage: ./anonymizer/deploy.sh
# Optional: SCHEDULE="every day 07:00" ./anonymizer/deploy.sh
#
# Idempotent: re-running updates the setup objects and leaves an existing
# schedule in place (delete it in the console / `bq rm --transfer_config` to change it).
set -euo pipefail

PROJECT="paid-media-2a86"
SRC_DATASET="google_ads"
DST_DATASET="anonymized_data"
KEYS_DATASET="anonymization_keys"
SA_NAME="dma-pulse-anonymizer"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
DISPLAY_NAME="DMA Pulse anonymizer"
# Pick a time after the daily Data Transfer refresh of google_ads has finished.
SCHEDULE="${SCHEDULE:-every day 07:00}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v gcloud >/dev/null 2>&1 || { echo "ERROR: gcloud not found — https://cloud.google.com/sdk/docs/install"; exit 1; }
command -v bq >/dev/null 2>&1 || { echo "ERROR: bq not found (ships with the gcloud SDK)"; exit 1; }
# Python is only used to JSON-encode the query. Prefer uv, fall back to a system python.
if command -v uv >/dev/null 2>&1; then
  PY="uv run --no-project python"
elif command -v python3 >/dev/null 2>&1; then
  PY="python3"
elif command -v python >/dev/null 2>&1; then
  PY="python"
else
  echo "ERROR: need uv or python to JSON-encode the query"; exit 1
fi

gcloud config set project "${PROJECT}" --quiet

# ── Step 1: Location of the source dataset ─────────────────────────────────
echo ""
echo "==> [1/5] Detecting location of ${PROJECT}:${SRC_DATASET}..."
LOCATION="$(bq show --format=prettyjson "${PROJECT}:${SRC_DATASET}" | sed -n 's/.*"location": "\([^"]*\)".*/\1/p' | head -n1)"
[[ -n "${LOCATION}" ]] || { echo "ERROR: could not detect dataset location"; exit 1; }
echo "    Location: ${LOCATION}"

# ── Step 2: APIs + service account ─────────────────────────────────────────
echo ""
echo "==> [2/5] Enabling APIs and creating service account (if needed)..."
gcloud services enable bigquery.googleapis.com bigquerydatatransfer.googleapis.com \
  --project="${PROJECT}" --quiet

if gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT}" --quiet >/dev/null 2>&1; then
  echo "    Service account already exists."
else
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="DMA Pulse anonymizer" --project="${PROJECT}" --quiet
fi

# ── Step 3: Datasets, tables and function ──────────────────────────────────
echo ""
echo "==> [3/5] Running setup.sql..."
sed "s/__LOCATION__/${LOCATION}/g" "${DIR}/setup.sql" \
  | bq query --use_legacy_sql=false --location="${LOCATION}" --project_id="${PROJECT}" >/dev/null

# ── Step 4: IAM (least privilege) ──────────────────────────────────────────
echo ""
echo "==> [4/5] Granting IAM..."
# Read the raw data, write the anonymized copy and the key tables — nothing else.
# Dataset-level grants, so the SA can't touch any other dataset in the project.
grant_dataset_role() {
  local dataset="$1" role="$2"
  echo "GRANT \`${role}\` ON SCHEMA \`${PROJECT}.${dataset}\` TO 'serviceAccount:${SA_EMAIL}'" \
    | bq query --use_legacy_sql=false --location="${LOCATION}" --project_id="${PROJECT}" >/dev/null
}
grant_dataset_role "${SRC_DATASET}"  "roles/bigquery.dataViewer"
grant_dataset_role "${DST_DATASET}"  "roles/bigquery.dataEditor"
grant_dataset_role "${KEYS_DATASET}" "roles/bigquery.dataEditor"
gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/bigquery.jobUser" \
  --condition=None --quiet >/dev/null

# ── Step 5: Scheduled query ────────────────────────────────────────────────
echo ""
echo "==> [5/5] Creating scheduled query (if needed)..."
EXISTING="$(bq ls --transfer_config --transfer_location="${LOCATION}" --project_id="${PROJECT}" --format=json 2>/dev/null || echo '[]')"
if echo "${EXISTING}" | grep -q "\"displayName\": \"${DISPLAY_NAME}\""; then
  echo "    Scheduled query '${DISPLAY_NAME}' already exists, skipping."
else
  PARAMS="$(${PY} -c'import json,sys; print(json.dumps({"query": sys.stdin.read()}))' < "${DIR}/anonymize.sql")"
  bq mk --transfer_config \
    --project_id="${PROJECT}" \
    --location="${LOCATION}" \
    --data_source=scheduled_query \
    --display_name="${DISPLAY_NAME}" \
    --schedule="${SCHEDULE}" \
    --service_account_name="${SA_EMAIL}" \
    --params="${PARAMS}"
fi

echo ""
echo "Done. Next:"
echo "  1. Add brand terms (see anonymizer/README.md), then"
echo "  2. Trigger the first run from the BigQuery console (Scheduled queries -> '${DISPLAY_NAME}' -> Run now)."
