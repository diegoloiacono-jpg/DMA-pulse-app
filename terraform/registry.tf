resource "google_artifact_registry_repository" "dma_pulse" {
  location      = var.region
  repository_id = var.artifact_repo
  format        = "DOCKER"
  description   = "DMA Pulse Docker images"

  depends_on = [google_project_service.apis]
}
