resource "google_cloud_run_v2_service" "backend" {
  name     = "dma-pulse-backend"
  location = var.region

  template {
    service_account = google_service_account.backend.email

    containers {
      image = var.backend_image

      ports {
        container_port = 8080
      }

      env {
        name  = "GCP_PROJECT"
        value = var.project_id
      }
      env {
        name  = "BQ_DATASET"
        value = var.bq_dataset
      }
      env {
        name  = "ACCOUNT_SUFFIX"
        value = var.account_suffix
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = var.allowed_origins
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "backend_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
