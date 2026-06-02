FROM docker.io/cloudflare/sandbox:0.7.0

# Install Node.js 22 (required by OpenClaw) and rclone (for R2 persistence)
# The base image has Node 20, we need to replace it with Node 22
# Using direct binary download for reliability
ENV NODE_VERSION=22.16.0
RUN ARCH="$(dpkg --print-architecture)" \
    && case "${ARCH}" in \
         amd64) NODE_ARCH="x64" ;; \
         arm64) NODE_ARCH="arm64" ;; \
         *) echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;; \
       esac \
    && apt-get update && apt-get install -y xz-utils ca-certificates rclone \
    && curl -fsSLk https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz -o /tmp/node.tar.xz \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm /tmp/node.tar.xz \
    && node --version \
    && npm --version

# Install pnpm globally
RUN npm install -g pnpm

# Install Chromium for OpenClaw browser tool
# Ubuntu 22.04 doesn't have chromium in apt — download Google Chrome .deb instead
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget curl ca-certificates gnupg \
    libxss1 libgbm1 libgtk-3-0 libnss3 \
    fonts-liberation xdg-utils libu2f-udev libvulkan1 \
    && rm -rf /var/lib/apt/lists/*

RUN wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/chrome.deb \
    && apt-get update \
    && (apt-get install -y --no-install-recommends /tmp/chrome.deb \
        || (apt-get install -y --no-install-recommends -f \
            && apt-get install -y --no-install-recommends /tmp/chrome.deb)) \
    && ln -sf /usr/bin/google-chrome-stable /usr/bin/chromium \
    && rm -f /tmp/chrome.deb \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright for OpenClaw browser automation
RUN npm install -g playwright \
    && PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright \
    playwright install chromium

ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
# Google Chrome installs to /usr/bin/google-chrome-stable
# Also create symlink for compatibility
ENV BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Install OpenClaw (formerly clawdbot/moltbot)
# Pin to specific version for reproducible builds
RUN npm install -g openclaw@2026.5.7 \
    && openclaw --version

# Create OpenClaw directories
# Legacy .clawdbot paths are kept for R2 backup migration
RUN mkdir -p /root/.openclaw \
    && mkdir -p /root/clawd \
    && mkdir -p /root/clawd/skills

# Copy startup script
COPY start-openclaw.sh /usr/local/bin/start-openclaw.sh
RUN chmod +x /usr/local/bin/start-openclaw.sh
ENV BUILD_REV=2026-05-08-openclaw-2026.5.7-chromium

# Copy custom skills, workspace files, and documentation
COPY skills/ /root/clawd/skills/
COPY workspace/ /root/clawd/workspace/
COPY workspace-crawler/ /root/clawd/workspace-crawler/
COPY workspace-extractor/ /root/clawd/workspace-extractor/
COPY workspace-designer/ /root/clawd/workspace-designer/
COPY workspace-reporter/ /root/clawd/workspace-reporter/
COPY docs/ /root/clawd/docs/

# Set working directory
WORKDIR /root/clawd

# Expose the gateway port
EXPOSE 18789
