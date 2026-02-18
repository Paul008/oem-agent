#!/bin/bash
# Test OpenClaw installation
set -x

echo "=== OpenClaw Installation Test ==="

echo "Checking openclaw binary..."
which openclaw || echo "openclaw not in PATH"

echo "Checking openclaw version..."
openclaw --version || echo "openclaw --version failed"

echo "Checking node version..."
node --version

echo "Checking npm packages..."
npm list -g openclaw || echo "openclaw not in npm global packages"

echo "Starting openclaw gateway with minimal config..."
openclaw gateway --help || echo "openclaw gateway --help failed"

# Try to start with absolute minimal settings
echo "Attempting to start gateway..."
openclaw gateway --port 18789 --allow-unconfigured --verbose || echo "Gateway start failed with exit code $?"

echo "=== Test Complete ==="
sleep infinity
