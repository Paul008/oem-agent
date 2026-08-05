terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# Service Token for automated testing (available for future use)
resource "cloudflare_zero_trust_access_service_token" "e2e" {
  account_id = var.cloudflare_account_id
  name       = "moltbot-e2e-${var.test_run_id}"
  duration   = "8760h"
}

# R2 bucket for E2E tests (isolated from production)
resource "cloudflare_r2_bucket" "e2e" {
  account_id = var.cloudflare_account_id
  name       = "moltbot-e2e-${var.test_run_id}"
  location   = "WNAM"
}

# The shell fixture creates the Access application and service-auth policy
# before deploying the Worker, so the workers.dev hostname is never public.
