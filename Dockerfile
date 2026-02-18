# Sandbox Container — OpenClaw OEM Agent
# Based on Moltworker Sandbox SDK patterns
# Uses cloudflare/sandbox base image with OpenClaw gateway

FROM docker.io/cloudflare/sandbox:0.7.2

# Install system dependencies first (including xz-utils for node tarball)
RUN apt-get update && apt-get install -y --no-install-recommends \
    xz-utils \
    ca-certificates \
    rclone \
    && rm -rf /var/lib/apt/lists/*

# Install Node 22 (replace sandbox default Node 20)
ARG NODE_VERSION=22.13.1
ARG TARGETARCH
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-$([ "$TARGETARCH" = "arm64" ] && echo "arm64" || echo "x64").tar.xz" | tar -xJf - --strip-components=1 -C /usr/local

# Install pnpm and OpenClaw
RUN npm install -g pnpm@9.15.0 openclaw@2026.2.15

# Create config directories (legacy .clawdbot path preserved for compatibility)
RUN mkdir -p /root/.openclaw /root/.clawdbot

# Create clawd workspace directory
RUN mkdir -p /root/clawd/skills

# Build cache bust: 2026-02-18-v8-minimal-test
COPY start-openclaw-simple.sh /usr/local/bin/start-openclaw.sh
RUN chmod +x /usr/local/bin/start-openclaw.sh

# Copy custom skills if available
COPY skills/ /root/clawd/skills/

WORKDIR /root/clawd

# Expose gateway port
EXPOSE 18789

# Gateway will be started by start-openclaw.sh via the Worker
CMD ["sleep", "infinity"]
