#!/usr/bin/env bash
# DMA Pulse — deploy to GCP Cloud Run
# Usage: ./deploy.sh
# Usage with auth: GOOGLE_CLIENT_ID=xxx ./deploy.sh
set -euo pipefail

PROJECT="coi-innovation-testing-8166"
REGION="europe-west1"
REPO="europe-west1-docker.pkg.dev/${PROJECT}/dma-pulse"
BACKEND_IMAGE="${REPO}/backend:latest"
FRONTEND_IMAGE="${REPO}/frontend:latest"
SA_NAME="dma-pulse-backend"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

# Google OAuth Client ID — restricts login to @artefact.com accounts
# Not a secret: this value is embedded in the public frontend JS bundle.
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-841637323524-llh1v81uh35r40mgo77je0e6npfpnb7t.apps.googleusercontent.com}"

command -v gcloud >/dev/null 2>&1 || { echo "ERROR: gcloud not found — https://cloud.google.com/sdk/docs/install"; exit 1; }

gcloud config set project "${PROJECT}" --quiet

# ── Step 1: Enable APIs ────────────────────────────────────────────────────
echo ""
echo "==> [1/7] Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  bigquery.googleapis.com \
  --project="${PROJECT}" --quiet

# ── Step 2: Artifact Registry repo ────────────────────────────────────────
echo ""
echo "==> [2/7] Creating Artifact Registry repository (if needed)..."
if gcloud artifacts repositories describe dma-pulse \
     --location="${REGION}" --project="${PROJECT}" --quiet 2>/dev/null; then
  echo "    Repository already exists, skipping."
else
  gcloud artifacts repositories create dma-pulse \
    --repository-format=docker \
    --location="${REGION}" \
    --project="${PROJECT}" --quiet
fi

# ── Step 3: Service account + BigQuery access ──────────────────────────────
echo ""
echo "==> [3/7] Setting up backend service account..."
gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT}" --quiet 2>/dev/null || \
gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="DMA Pulse Backend" \
  --project="${PROJECT}" --quiet

if gcloud projects add-iam-policy-binding "${PROJECT}" \
     --member="serviceAccount:${SA_EMAIL}" \
     --role="roles/bigquery.user" --quiet 2>/dev/null && \
   gcloud projects add-iam-policy-binding "${PROJECT}" \
     --member="serviceAccount:${SA_EMAIL}" \
     --role="roles/bigquery.dataViewer" --quiet 2>/dev/null; then
  echo "    BigQuery roles granted."
else
  echo ""
  echo "  ⚠️  Could not set IAM bindings (insufficient permissions)."
  echo "     Ask a project admin to run these once:"
  echo ""
  echo "     gcloud projects add-iam-policy-binding ${PROJECT} \\"
  echo "       --member=serviceAccount:${SA_EMAIL} \\"
  echo "       --role=roles/bigquery.user"
  echo ""
  echo "     gcloud projects add-iam-policy-binding ${PROJECT} \\"
  echo "       --member=serviceAccount:${SA_EMAIL} \\"
  echo "       --role=roles/bigquery.dataViewer"
  echo ""
  echo "  Continuing deployment — backend will deploy but BigQuery calls will fail until roles are granted."
fi

# ── Step 4: Build + push backend ──────────────────────────────────────────
echo ""
echo "==> [4/7] Building backend image..."
if ! gcloud builds submit backend \
       --config=backend/cloudbuild.yaml \
       --substitutions="_IMAGE=${BACKEND_IMAGE}" \
       --project="${PROJECT}"; then
  echo ""
  echo "  ❌ Cloud Build failed. Two things to try:"
  echo ""
  echo "  A) If the API was just enabled, wait 1-2 minutes and re-run ./deploy.sh"
  echo ""
  echo "  B) If it persists, ask a project admin to grant your account Cloud Build access:"
  echo "     gcloud projects add-iam-policy-binding ${PROJECT} \\"
  echo "       --member=user:$(gcloud config get account) \\"
  echo "       --role=roles/cloudbuild.builds.editor"
  echo ""
  exit 1
fi

# ── Step 5: Deploy backend Cloud Run ──────────────────────────────────────
echo ""
echo "==> [5/7] Deploying backend..."
BACKEND_ENV="GCP_PROJECT=${PROJECT},BQ_DATASET=bwj_google_ads,ACCOUNT_SUFFIX=6600502562,MODEL_DATASET=google_ads_audit"
if [[ -n "${GOOGLE_CLIENT_ID}" ]]; then
  BACKEND_ENV="${BACKEND_ENV},GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}"
fi

gcloud run deploy dma-pulse-backend \
  --image="${BACKEND_IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --service-account="${SA_EMAIL}" \
  --allow-unauthenticated \
  --set-env-vars="${BACKEND_ENV}" \
  --memory=1Gi \
  --cpu=1 \
  --project="${PROJECT}" --quiet

BACKEND_URL=$(gcloud run services describe dma-pulse-backend \
  --region="${REGION}" --project="${PROJECT}" \
  --format="value(status.url)")
echo "    Backend URL: ${BACKEND_URL}"

# Update CORS to backend URL (allows frontend *.run.app by regex in code)
gcloud run services update dma-pulse-backend \
  --region="${REGION}" --project="${PROJECT}" --quiet \
  --update-env-vars="ALLOWED_ORIGINS=${BACKEND_URL}"

# ── Step 6: Build + push frontend (backend URL + OAuth client ID baked in) ──
echo ""
echo "==> [6/7] Building frontend image..."
gcloud builds submit frontend \
  --config=frontend/cloudbuild.yaml \
  --substitutions="_IMAGE=${FRONTEND_IMAGE},_API_URL=${BACKEND_URL},_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}" \
  --project="${PROJECT}"

# ── Step 7: Deploy frontend Cloud Run ─────────────────────────────────────
echo ""
echo "==> [7/7] Deploying frontend..."
gcloud run deploy dma-pulse-frontend \
  --image="${FRONTEND_IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --project="${PROJECT}" --quiet

FRONTEND_URL=$(gcloud run services describe dma-pulse-frontend \
  --region="${REGION}" --project="${PROJECT}" \
  --format="value(status.url)")

# Lock backend CORS to the actual frontend URL
gcloud run services update dma-pulse-backend \
  --region="${REGION}" --project="${PROJECT}" --quiet \
  --update-env-vars="ALLOWED_ORIGINS=${FRONTEND_URL}"

echo ""
echo "✓ Deployment complete!"
echo "  Frontend : ${FRONTEND_URL}"
echo "  Backend  : ${BACKEND_URL}/health"
if [[ -z "${GOOGLE_CLIENT_ID}" ]]; then
  echo ""
  echo "  ⚠️  Auth is DISABLED — GOOGLE_CLIENT_ID was not set."
  echo "     To enable @artefact.com login:"
  echo "     1. Create an OAuth Client ID at https://console.cloud.google.com/apis/credentials?project=${PROJECT}"
  echo "        Type: Web application"
  echo "        Authorized JS origins: ${FRONTEND_URL}"
  echo "     2. Re-run: GOOGLE_CLIENT_ID=<your-client-id> ./deploy.sh"
fi
