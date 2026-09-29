#!/usr/bin/env bash
# DMA Pulse — deploy to GCP Cloud Run
# Usage: ./deploy.sh [prod|dev]     (defaults to prod)
# Usage with auth: GOOGLE_CLIENT_ID=xxx ./deploy.sh [prod|dev]
set -euo pipefail

ENV="${1:-prod}"
case "${ENV}" in
  prod) SUFFIX="" ;;
  dev)  SUFFIX="-dev" ;;
  *) echo "ERROR: unknown environment '${ENV}' (expected 'prod' or 'dev')"; exit 1 ;;
esac
echo "Deploying environment: ${ENV}"

PROJECT="paid-media-2a86"
REGION="europe-west1"
REPO="europe-west1-docker.pkg.dev/${PROJECT}/dma-pulse"
# prod keeps the :latest tag for backward compatibility; dev gets its own tag
# so the two environments never share an image.
if [[ "${ENV}" == "prod" ]]; then
  BACKEND_IMAGE="${REPO}/backend:latest"
  FRONTEND_IMAGE="${REPO}/frontend:latest"
else
  BACKEND_IMAGE="${REPO}/backend:${ENV}"
  FRONTEND_IMAGE="${REPO}/frontend:${ENV}"
fi
SA_NAME="dma-pulse-backend"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
# Durable store for saved brand contexts (one JSON object per context).
CONTEXT_BUCKET="${PROJECT}-dma-pulse-contexts${SUFFIX}"
# Cloud Build source-upload staging. Deliberately NOT the auto-managed
# per-project `${PROJECT}_cloudbuild` bucket: that bucket only grants access
# via legacy project-level ACLs (Editor/Owner/Viewer), so a plain IAM role
# binding for a non-primitive-role caller (e.g. a scoped CI service account)
# can still 403 on source upload even with Storage Admin granted. A bucket we
# create ourselves, with uniform bucket-level access, is IAM-only and doesn't
# have this gotcha. Shared across environments — it only ever holds
# short-lived source tarballs, nothing environment-specific.
BUILD_STAGING_BUCKET="${PROJECT}-dma-pulse-build-staging"
BACKEND_SERVICE="dma-pulse-backend${SUFFIX}"
FRONTEND_SERVICE="dma-pulse-frontend${SUFFIX}"

# Google OAuth Client ID — restricts login to @artefact.com accounts
# Not a secret: this value is embedded in the public frontend JS bundle.
# Left empty by default: OAuth client IDs are project-scoped, so the old
# project's client ID must NOT be reused here. Pass GOOGLE_CLIENT_ID=xxx
# once a client has been created under this project's OAuth consent screen.
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"

command -v gcloud >/dev/null 2>&1 || { echo "ERROR: gcloud not found — https://cloud.google.com/sdk/docs/install"; exit 1; }

# This org disables the default Compute Engine service account
# (constraints/iam.automaticIamGrantsForDefaultServiceAccounts), so Cloud
# Build must be told explicitly to build as a user-managed SA instead — the
# auto-generated cloudbuild.gserviceaccount.com is itself a default/Google-
# managed account and gcloud rejects it for --service-account. Reuse the
# backend SA (granted roles/cloudbuild.builds.builder below) for builds.
CLOUDBUILD_SA="projects/${PROJECT}/serviceAccounts/${SA_EMAIL}"

gcloud config set project "${PROJECT}" --quiet

# ── Step 1: Enable APIs ────────────────────────────────────────────────────
echo ""
echo "==> [1/7] Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  bigquery.googleapis.com \
  aiplatform.googleapis.com \
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

# ── Step 2b: Brand-context bucket ─────────────────────────────────────────
echo ""
echo "==> [2b] Creating brand-context bucket (if needed)..."
if gcloud storage buckets describe "gs://${CONTEXT_BUCKET}" --project="${PROJECT}" --quiet >/dev/null 2>&1; then
  echo "    Bucket gs://${CONTEXT_BUCKET} already exists."
else
  gcloud storage buckets create "gs://${CONTEXT_BUCKET}" \
    --location="${REGION}" \
    --project="${PROJECT}" --quiet
fi

# Applied unconditionally, not just on create: a bucket that already exists may
# predate these settings (or have been created by something else), and skipping
# the update would leave saved contexts world-readable or unversioned.
# Versioning makes an accidental overwrite of a saved context recoverable.
gcloud storage buckets update "gs://${CONTEXT_BUCKET}" \
  --versioning \
  --uniform-bucket-level-access \
  --public-access-prevention \
  --project="${PROJECT}" --quiet >/dev/null 2>&1 \
  || echo "    ⚠️  Could not apply bucket hardening (versioning / uniform access / public-access prevention)."

# ── Step 2c: Cloud Build staging bucket ───────────────────────────────────
echo ""
echo "==> [2c] Creating Cloud Build staging bucket (if needed)..."
if gcloud storage buckets describe "gs://${BUILD_STAGING_BUCKET}" --project="${PROJECT}" --quiet >/dev/null 2>&1; then
  echo "    Bucket gs://${BUILD_STAGING_BUCKET} already exists."
else
  gcloud storage buckets create "gs://${BUILD_STAGING_BUCKET}" \
    --location="${REGION}" \
    --uniform-bucket-level-access \
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
     --role="roles/bigquery.dataViewer" --quiet 2>/dev/null && \
   gcloud projects add-iam-policy-binding "${PROJECT}" \
     --member="serviceAccount:${SA_EMAIL}" \
     --role="roles/cloudbuild.builds.builder" --quiet 2>/dev/null && \
   gcloud projects add-iam-policy-binding "${PROJECT}" \
     --member="serviceAccount:${SA_EMAIL}" \
     --role="roles/aiplatform.user" --quiet 2>/dev/null; then
  # Scoped to the one bucket rather than project-wide storage access.
  gcloud storage buckets add-iam-policy-binding "gs://${CONTEXT_BUCKET}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/storage.objectAdmin" \
    --project="${PROJECT}" --quiet >/dev/null 2>&1 \
    || echo "    ⚠️  Could not grant bucket access — saved contexts will not persist."
  # Read-only: this SA only needs to fetch the source tarball Cloud Build stages here.
  gcloud storage buckets add-iam-policy-binding "gs://${BUILD_STAGING_BUCKET}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/storage.objectViewer" \
    --project="${PROJECT}" --quiet >/dev/null 2>&1 \
    || echo "    ⚠️  Could not grant build-staging bucket access — builds may fail to fetch source."
  echo "    BigQuery + Vertex AI + Cloud Build + context-bucket + build-staging roles granted."
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
  echo "     gcloud projects add-iam-policy-binding ${PROJECT} \\"
  echo "       --member=serviceAccount:${SA_EMAIL} \\"
  echo "       --role=roles/cloudbuild.builds.builder"
  echo ""
  echo "     gcloud projects add-iam-policy-binding ${PROJECT} \\"
  echo "       --member=serviceAccount:${SA_EMAIL} \\"
  echo "       --role=roles/aiplatform.user"
  echo ""
  echo "  Continuing deployment — backend will deploy but BigQuery/Vertex AI calls / builds will fail until roles are granted."
fi

# ── Step 4: Build + push backend ──────────────────────────────────────────
echo ""
echo "==> [4/7] Building backend image..."
if ! gcloud builds submit backend \
       --config=backend/cloudbuild.yaml \
       --substitutions="_IMAGE=${BACKEND_IMAGE}" \
       --service-account="${CLOUDBUILD_SA}" \
       --gcs-source-staging-dir="gs://${BUILD_STAGING_BUCKET}/source" \
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
BACKEND_ENV="GCP_PROJECT=${PROJECT},BQ_DATASET=google_ads,DEFAULT_ACCOUNT_ID=3676622146,MODEL_DATASET=google_ads_audit,CONTEXT_BUCKET=${CONTEXT_BUCKET}"
if [[ -n "${GOOGLE_CLIENT_ID}" ]]; then
  BACKEND_ENV="${BACKEND_ENV},GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}"
fi

gcloud run deploy "${BACKEND_SERVICE}" \
  --image="${BACKEND_IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --service-account="${SA_EMAIL}" \
  --allow-unauthenticated \
  --set-env-vars="${BACKEND_ENV}" \
  --memory=1Gi \
  --cpu=1 \
  --project="${PROJECT}" --quiet

BACKEND_URL=$(gcloud run services describe "${BACKEND_SERVICE}" \
  --region="${REGION}" --project="${PROJECT}" \
  --format="value(status.url)")
echo "    Backend URL: ${BACKEND_URL}"

# Update CORS to backend URL (allows frontend *.run.app by regex in code)
gcloud run services update "${BACKEND_SERVICE}" \
  --region="${REGION}" --project="${PROJECT}" --quiet \
  --update-env-vars="ALLOWED_ORIGINS=${BACKEND_URL}"

# ── Step 6: Build + push frontend (backend URL + OAuth client ID baked in) ──
echo ""
echo "==> [6/7] Building frontend image..."
gcloud builds submit frontend \
  --config=frontend/cloudbuild.yaml \
  --substitutions="_IMAGE=${FRONTEND_IMAGE},_API_URL=${BACKEND_URL},_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}" \
  --service-account="${CLOUDBUILD_SA}" \
  --gcs-source-staging-dir="gs://${BUILD_STAGING_BUCKET}/source" \
  --project="${PROJECT}"

# ── Step 7: Deploy frontend Cloud Run ─────────────────────────────────────
echo ""
echo "==> [7/7] Deploying frontend..."
gcloud run deploy "${FRONTEND_SERVICE}" \
  --image="${FRONTEND_IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --project="${PROJECT}" --quiet

FRONTEND_URL=$(gcloud run services describe "${FRONTEND_SERVICE}" \
  --region="${REGION}" --project="${PROJECT}" \
  --format="value(status.url)")

# Lock backend CORS to the actual frontend URL
gcloud run services update "${BACKEND_SERVICE}" \
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
