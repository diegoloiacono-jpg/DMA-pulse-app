output "backend_url" {
  value       = google_cloud_run_v2_service.backend.uri
  description = "Cloud Run URL for the FastAPI backend"
}

output "frontend_url" {
  value       = google_cloud_run_v2_service.frontend.uri
  description = "Cloud Run URL for the React frontend"
}
