# Sandbox Container — OpenClaw OEM Agent
# Based on Moltworker Sandbox SDK patterns

FROM node:22-slim

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

# Copy application code
COPY lib/ ./lib/
COPY skills/ ./skills/
COPY src/container.ts ./src/container.ts

EXPOSE 8080

CMD ["node", "--experimental-specifier-resolution=node", "src/container.ts"]
