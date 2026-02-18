#!/bin/bash
# Minimal OpenClaw startup for debugging
set -e

echo "Starting OpenClaw with minimal configuration..."

# Create config directory
mkdir -p /root/.openclaw

# Run openclaw gateway directly without onboard
exec openclaw gateway \
  --port 18789 \
  --bind lan \
  --allow-unconfigured \
  --verbose
