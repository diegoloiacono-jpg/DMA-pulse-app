variable "project_id" {
  default = "coi-innovation-testing-8166"
}

variable "region" {
  default = "europe-west1"
}

variable "artifact_repo" {
  default = "dma-pulse"
}

variable "backend_image" {
  description = "Full Artifact Registry image URL for the backend"
  default     = "europe-west1-docker.pkg.dev/coi-innovation-testing-8166/dma-pulse/backend:latest"
}

variable "frontend_image" {
  description = "Full Artifact Registry image URL for the frontend"
  default     = "europe-west1-docker.pkg.dev/coi-innovation-testing-8166/dma-pulse/frontend:latest"
}

variable "allowed_origins" {
  description = "Comma-separated CORS origins for the backend (set to frontend URL after first deploy)"
  default     = "*"
}

variable "bq_dataset" {
  default = "google_ads_audit"
}

variable "account_suffix" {
  default = "9149667192"
}
