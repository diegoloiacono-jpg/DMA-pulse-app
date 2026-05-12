#!/usr/bin/env bash
# DMA Pulse — full deploy to GCP Cloud Run via Terraform + Cloud Build
# Usage: ./deploy.sh
set -euo pipefail

PROJECT="coi-innovation-testing-8166"
REGION="europe-west1"
IMAGE_PREFIX="${REGION}-docker.pkg.dev/${PROJECT}/dma-pulse"

# ── Prerequisites ──────────────────────────────────────────────────────────
command -v terraform >/dev/null 2>&1 || { echo "ERROR: terraform not found. Install from https://developer.hashicorp.com/terraform/install"; exit 1; }
command -v gcloud   >/dev/null 2>&1 || { echo "ERROR: gcloud not found. Install from https://cloud.google.com/sdk/docs/install"; exit 1; }

gcloud config set project "${PROJECT}" --quiet

# ── Step 1: Terraform init ─────────────────────────────────────────────────
echo ""
echo "==> [1/7] Initialising Terraform..."
cd terraform
terraform init -upgrade -input=false

# ── Step 2: Infrastructure (APIs, registry, IAM) ───────────────────────────
echo ""
echo "==> [2/7] Provisioning infrastructure..."
terraform apply \
  -target=google_project_service.apis \
  -target=google_artifact_registry_repository.dma_pulse \
  -target=google_service_account.backend \
  -target=google_project_iam_member.backend_bq_user \
  -target=google_project_iam_member.backend_bq_data_viewer \
  -target=google_project_iam_member.cloudbuild_ar_writer \
  -target=google_project_iam_member.cloudbuild_run_developer \
  -input=false -auto-approve
cd ..

# ── Step 3: Build + push backend image ────────────────────────────────────
echo ""
echo "==> [3/7] Building backend image via Cloud Build..."
gcloud builds submit backend \
  --tag="${IMAGE_PREFIX}/backend:latest" \
  --project="${PROJECT}"

# ── Step 4: Deploy backend Cloud Run service ──────────────────────────────
echo ""
echo "==> [4/7] Deploying backend Cloud Run service..."
cd terraform
terraform apply \
  -target=google_cloud_run_v2_service.backend \
  -target=google_cloud_run_v2_service_iam_member.backend_public \
  -var="backend_image=${IMAGE_PREFIX}/backend:latest" \
  -input=false -auto-approve

BACKEND_URL=$(terraform output -raw backend_url)
echo "    Backend URL: ${BACKEND_URL}"
cd ..

# ── Step 5: Build + push frontend image (with backend URL baked in) ───────
echo ""
echo "==> [5/7] Building frontend image via Cloud Build..."
gcloud builds submit frontend \
  --config=frontend/cloudbuild.yaml \
  --substitutions="_IMAGE=${IMAGE_PREFIX}/frontend:latest,_VITE_API_URL=${BACKEND_URL}" \
  --project="${PROJECT}"

# ── Step 6: Deploy frontend Cloud Run service ─────────────────────────────
echo ""
echo "==> [6/7] Deploying frontend Cloud Run service..."
cd terraform
terraform apply \
  -target=google_cloud_run_v2_service.frontend \
  -target=google_cloud_run_v2_service_iam_member.frontend_public \
  -var="backend_image=${IMAGE_PREFIX}/backend:latest" \
  -var="frontend_image=${IMAGE_PREFIX}/frontend:latest" \
  -input=false -auto-approve

FRONTEND_URL=$(terraform output -raw frontend_url)
echo "    Frontend URL: ${FRONTEND_URL}"

# ── Step 7: Lock down backend CORS to frontend URL ────────────────────────
echo ""
echo "==> [7/7] Updating backend CORS to allow frontend origin only..."
terraform apply \
  -var="backend_image=${IMAGE_PREFIX}/backend:latest" \
  -var="frontend_image=${IMAGE_PREFIX}/frontend:latest" \
  -var="allowed_origins=${FRONTEND_URL}" \
  -input=false -auto-approve
cd ..

echo ""
echo "✓ Deployment complete!"
echo "  Frontend : ${FRONTEND_URL}"
echo "  Backend  : ${BACKEND_URL}/health"
