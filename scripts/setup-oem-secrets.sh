#!/bin/bash
# Setup OEM Agent secrets for Cloudflare Workers
# Run this script to configure all required secrets for the OEM Agent

set -e

echo "=== OEM Agent Secrets Setup ==="
echo ""
echo "This script will configure the following secrets:"
echo "  - SUPABASE_URL (required)"
echo "  - SUPABASE_SERVICE_ROLE_KEY (required)"
echo "  - GROQ_API_KEY (required)"
echo "  - TOGETHER_API_KEY (optional)"
echo "  - SLACK_WEBHOOK_URL (optional)"
echo "  - BRAVE_API_KEY (optional - for OEM discovery)"
echo "  - PERPLEXITY_API_KEY (optional - for OEM discovery)"
echo ""

# Required secrets
echo "=== Required Secrets ==="

echo "Setting SUPABASE_URL..."
npx wrangler secret put SUPABASE_URL

echo "Setting SUPABASE_SERVICE_ROLE_KEY..."
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY

echo "Setting GROQ_API_KEY..."
npx wrangler secret put GROQ_API_KEY

# Optional secrets
echo ""
echo "=== Optional Secrets ==="
echo "(Press Ctrl+C to skip, or enter empty value)"

read -p "Set TOGETHER_API_KEY? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npx wrangler secret put TOGETHER_API_KEY
fi

read -p "Set SLACK_WEBHOOK_URL? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npx wrangler secret put SLACK_WEBHOOK_URL
fi

# Discovery API secrets
echo ""
echo "=== Discovery API Secrets (for oem-build-price-discover skill) ==="

read -p "Set BRAVE_API_KEY? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npx wrangler secret put BRAVE_API_KEY
fi

read -p "Set PERPLEXITY_API_KEY? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npx wrangler secret put PERPLEXITY_API_KEY
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To verify secrets are set, run:"
echo "  npx wrangler secret list"
echo ""
echo "To deploy the worker with new secrets:"
echo "  npm run deploy"
