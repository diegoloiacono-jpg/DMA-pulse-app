#!/usr/bin/env bash
# Deploy Meta → BigQuery extractor as a Cloud Function (2nd gen)
# Usage:
#   META_ACCESS_TOKEN=<long-lived-token> META_ACCOUNT_ID=<account_id> ./deploy.sh
#
# The function can also accept these as POST body params at call time.
set -euo pipefail

PROJECT="coi-innovation-testing-8166"
REGION="europe-west1"
FUNCTION_NAME="meta-extractor"
META_DATASET="${META_DATASET:-meta_data}"

# Passed in or left blank (can be supplied at call time via POST body)
META_ACCESS_TOKEN="${META_ACCESS_TOKEN:-}"
META_ACCOUNT_ID="${META_ACCOUNT_ID:-}"

command -v gcloud >/dev/null 2>&1 || { echo "ERROR: gcloud not found"; exit 1; }
gcloud config set project "${PROJECT}" --quiet

echo "==> Enabling Cloud Functions API..."
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  --project="${PROJECT}" --quiet

echo "==> Ensuring BigQuery dataset '${META_DATASET}' exists..."
bq --project_id="${PROJECT}" show "${META_DATASET}" 2>/dev/null || \
  bq --project_id="${PROJECT}" mk --dataset \
    --location=EU \
    "${PROJECT}:${META_DATASET}"

ENV_VARS="GCP_PROJECT=${PROJECT},META_DATASET=${META_DATASET}"
if [[ -n "${META_ACCESS_TOKEN}" ]]; then
  ENV_VARS="${ENV_VARS},META_ACCESS_TOKEN=${META_ACCESS_TOKEN}"
fi
if [[ -n "${META_ACCOUNT_ID}" ]]; then
  ENV_VARS="${ENV_VARS},META_ACCOUNT_ID=${META_ACCOUNT_ID}"
fi

echo "==> Deploying function '${FUNCTION_NAME}'..."
gcloud functions deploy "${FUNCTION_NAME}" \
  --gen2 \
  --region="${REGION}" \
  --runtime=python312 \
  --source=. \
  --entry-point=run_extraction \
  --trigger-http \
  --allow-unauthenticated \
  --memory=512Mi \
  --timeout=540s \
  --set-env-vars="${ENV_VARS}" \
  --project="${PROJECT}" \
  --quiet

FUNCTION_URL=$(gcloud functions describe "${FUNCTION_NAME}" \
  --gen2 \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --format="value(serviceConfig.uri)")

echo ""
echo "✓ Deployed: ${FUNCTION_URL}"
echo ""
echo "  Trigger a run:"
echo "  curl -X POST ${FUNCTION_URL} \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"account_id\": \"YOUR_ACCOUNT_ID\"}'"
