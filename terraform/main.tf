terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # Uncomment to store state in GCS (create the bucket manually first):
  # backend "gcs" {
  #   bucket = "coi-innovation-testing-8166-tfstate"
  #   prefix = "dma-pulse"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  image_prefix = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_repo}"
}
