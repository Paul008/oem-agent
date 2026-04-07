#!/bin/bash
# Startup script for OpenClaw in Cloudflare Sandbox
# This script:
# 1. Restores config/workspace/skills from R2 via rclone (if configured)
# 2. Runs openclaw onboard --non-interactive to configure from env vars
# 3. Patches config for features onboard doesn't cover (channels, gateway auth)
# 4. Starts a background sync loop (rclone, watches for file changes)
# 5. Starts the gateway

set -e

if pgrep -f "openclaw gateway" > /dev/null 2>&1; then
    echo "OpenClaw gateway is already running, exiting."
    exit 0
fi

CONFIG_DIR="/root/.openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"
WORKSPACE_DIR="/root/clawd"
SKILLS_DIR="/root/clawd/skills"
RCLONE_CONF="/root/.config/rclone/rclone.conf"
LAST_SYNC_FILE="/tmp/.last-sync"

echo "Config directory: $CONFIG_DIR"

mkdir -p "$CONFIG_DIR"

# ============================================================
# RCLONE SETUP
# ============================================================

r2_configured() {
    [ -n "$R2_ACCESS_KEY_ID" ] && [ -n "$R2_SECRET_ACCESS_KEY" ] && [ -n "$CF_ACCOUNT_ID" ]
}

R2_BUCKET="${R2_BUCKET_NAME:-moltbot-data}"

setup_rclone() {
    mkdir -p "$(dirname "$RCLONE_CONF")"
    cat > "$RCLONE_CONF" << EOF
[r2]
type = s3
provider = Cloudflare
access_key_id = $R2_ACCESS_KEY_ID
secret_access_key = $R2_SECRET_ACCESS_KEY
endpoint = https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com
acl = private
no_check_bucket = true
EOF
    touch /tmp/.rclone-configured
    echo "Rclone configured for bucket: $R2_BUCKET"
}

RCLONE_FLAGS="--transfers=16 --fast-list --s3-no-check-bucket"

# ============================================================
# RESTORE FROM R2
# ============================================================

if r2_configured; then
    setup_rclone

    echo "Checking R2 for existing backup..."
    # Check if R2 has an openclaw config backup
    if rclone ls "r2:${R2_BUCKET}/openclaw/openclaw.json" $RCLONE_FLAGS 2>/dev/null | grep -q openclaw.json; then
        echo "Restoring config from R2..."
        rclone copy "r2:${R2_BUCKET}/openclaw/" "$CONFIG_DIR/" $RCLONE_FLAGS -v 2>&1 || echo "WARNING: config restore failed with exit code $?"
        echo "Config restored"
    elif rclone ls "r2:${R2_BUCKET}/clawdbot/clawdbot.json" $RCLONE_FLAGS 2>/dev/null | grep -q clawdbot.json; then
        echo "Restoring from legacy R2 backup..."
        rclone copy "r2:${R2_BUCKET}/clawdbot/" "$CONFIG_DIR/" $RCLONE_FLAGS -v 2>&1 || echo "WARNING: legacy config restore failed with exit code $?"
        if [ -f "$CONFIG_DIR/clawdbot.json" ] && [ ! -f "$CONFIG_FILE" ]; then
            mv "$CONFIG_DIR/clawdbot.json" "$CONFIG_FILE"
        fi
        echo "Legacy config restored and migrated"
    else
        echo "No backup found in R2, starting fresh"
    fi

    # Restore workspace
    REMOTE_WS_COUNT=$(rclone ls "r2:${R2_BUCKET}/workspace/" $RCLONE_FLAGS 2>/dev/null | wc -l)
    if [ "$REMOTE_WS_COUNT" -gt 0 ]; then
        echo "Restoring workspace from R2 ($REMOTE_WS_COUNT files)..."
        mkdir -p "$WORKSPACE_DIR"
        rclone copy "r2:${R2_BUCKET}/workspace/" "$WORKSPACE_DIR/" $RCLONE_FLAGS -v 2>&1 || echo "WARNING: workspace restore failed with exit code $?"
        echo "Workspace restored"
    fi

    # Restore skills
    REMOTE_SK_COUNT=$(rclone ls "r2:${R2_BUCKET}/skills/" $RCLONE_FLAGS 2>/dev/null | wc -l)
    if [ "$REMOTE_SK_COUNT" -gt 0 ]; then
        echo "Restoring skills from R2 ($REMOTE_SK_COUNT files)..."
        mkdir -p "$SKILLS_DIR"
        rclone copy "r2:${R2_BUCKET}/skills/" "$SKILLS_DIR/" $RCLONE_FLAGS -v 2>&1 || echo "WARNING: skills restore failed with exit code $?"
        echo "Skills restored"
    fi
else
    echo "R2 not configured, starting fresh"
fi

# ============================================================
# ONBOARD (only if no config exists yet)
# ============================================================
if [ ! -f "$CONFIG_FILE" ]; then
    echo "No existing config found, running openclaw onboard..."

    AUTH_ARGS=""
    if [ -n "$CLOUDFLARE_AI_GATEWAY_API_KEY" ] && [ -n "$CF_AI_GATEWAY_ACCOUNT_ID" ] && [ -n "$CF_AI_GATEWAY_GATEWAY_ID" ]; then
        AUTH_ARGS="--auth-choice cloudflare-ai-gateway-api-key \
            --cloudflare-ai-gateway-account-id $CF_AI_GATEWAY_ACCOUNT_ID \
            --cloudflare-ai-gateway-gateway-id $CF_AI_GATEWAY_GATEWAY_ID \
            --cloudflare-ai-gateway-api-key $CLOUDFLARE_AI_GATEWAY_API_KEY"
    elif [ -n "$ANTHROPIC_API_KEY" ]; then
        AUTH_ARGS="--auth-choice apiKey --anthropic-api-key $ANTHROPIC_API_KEY"
    elif [ -n "$OPENAI_API_KEY" ]; then
        AUTH_ARGS="--auth-choice openai-api-key --openai-api-key $OPENAI_API_KEY"
    fi

    openclaw onboard --non-interactive --accept-risk \
        --mode local \
        $AUTH_ARGS \
        --gateway-port 18789 \
        --gateway-bind lan \
        --skip-channels \
        --skip-skills \
        --skip-health

    echo "Onboard completed"
else
    echo "Using existing config"
fi

# ============================================================
# PATCH CONFIG (channels, gateway auth, trusted proxies)
# ============================================================
# openclaw onboard handles provider/model config, but we need to patch in:
# - Channel config (Telegram, Discord, Slack)
# - Gateway token auth
# - Trusted proxies for sandbox networking
# - Base URL override for legacy AI Gateway path
node << 'EOFPATCH'
const fs = require('fs');

const configPath = '/root/.openclaw/openclaw.json';
console.log('Patching config at:', configPath);
let config = {};

try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    console.log('Starting with empty config');
}

config.gateway = config.gateway || {};
config.channels = config.channels || {};

// Gateway configuration
config.gateway.port = 18789;
config.gateway.mode = 'local';
config.gateway.bind = 'lan';
config.gateway.trustedProxies = ['10.1.0.0'];

if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    config.gateway.auth = config.gateway.auth || {};
    config.gateway.auth.token = process.env.OPENCLAW_GATEWAY_TOKEN;
}

if (process.env.OPENCLAW_DEV_MODE === 'true') {
    config.gateway.controlUi = config.gateway.controlUi || {};
    config.gateway.controlUi.allowInsecureAuth = true;
    // Skip device pairing — the Worker is protected by Cloudflare Access
    config.gateway.controlUi.dangerouslyDisableDeviceAuth = true;
    // Required for non-loopback Control UI: explicitly allow the Worker origin
    const workerUrl = process.env.WORKER_URL || 'https://oem-agent.adme-dev.workers.dev';
    config.gateway.controlUi.allowedOrigins = [workerUrl];
}

// Multi-agent configuration
config.agents = config.agents || {};
config.agents.list = [
    { id: 'main',      workspace: '/root/.openclaw/workspace' },
    { id: 'crawler',   workspace: '/root/.openclaw/workspace-crawler' },
    { id: 'extractor', workspace: '/root/.openclaw/workspace-extractor' },
    { id: 'designer',  workspace: '/root/.openclaw/workspace-designer' },
    { id: 'reporter',  workspace: '/root/.openclaw/workspace-reporter' },
];
console.log('Multi-agent config: ' + config.agents.list.map(a => a.id).join(', '));

// Legacy AI Gateway base URL override:
// ANTHROPIC_BASE_URL is picked up natively by the Anthropic SDK,
// so we don't need to patch the provider config. Writing a provider
// entry without a models array breaks OpenClaw's config validation.

// AI Gateway model override (CF_AI_GATEWAY_MODEL=provider/model-id)
// Adds a provider entry for any AI Gateway provider and sets it as default model.
// Examples:
//   workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast
//   openai/gpt-4o
//   anthropic/claude-sonnet-4-5
if (process.env.CF_AI_GATEWAY_MODEL) {
    const raw = process.env.CF_AI_GATEWAY_MODEL;
    const slashIdx = raw.indexOf('/');
    const gwProvider = raw.substring(0, slashIdx);
    const modelId = raw.substring(slashIdx + 1);

    const accountId = process.env.CF_AI_GATEWAY_ACCOUNT_ID;
    const gatewayId = process.env.CF_AI_GATEWAY_GATEWAY_ID;
    const apiKey = process.env.CLOUDFLARE_AI_GATEWAY_API_KEY;

    let baseUrl;
    if (accountId && gatewayId) {
        baseUrl = 'https://gateway.ai.cloudflare.com/v1/' + accountId + '/' + gatewayId + '/' + gwProvider;
        if (gwProvider === 'workers-ai') baseUrl += '/v1';
    } else if (gwProvider === 'workers-ai' && process.env.CF_ACCOUNT_ID) {
        baseUrl = 'https://api.cloudflare.com/client/v4/accounts/' + process.env.CF_ACCOUNT_ID + '/ai/v1';
    }

    if (baseUrl && apiKey) {
        const api = gwProvider === 'anthropic' ? 'anthropic-messages' : 'openai-completions';
        const providerName = 'cf-ai-gw-' + gwProvider;

        config.models = config.models || {};
        config.models.providers = config.models.providers || {};
        config.models.providers[providerName] = {
            baseUrl: baseUrl,
            apiKey: apiKey,
            api: api,
            models: [{ id: modelId, name: modelId, contextWindow: 131072, maxTokens: 8192 }],
        };
        config.agents = config.agents || {};
        config.agents.defaults = config.agents.defaults || {};
        config.agents.defaults.model = { primary: providerName + '/' + modelId };
        console.log('AI Gateway model override: provider=' + providerName + ' model=' + modelId + ' via ' + baseUrl);
    } else {
        console.warn('CF_AI_GATEWAY_MODEL set but missing required config (account ID, gateway ID, or API key)');
    }
}

// Telegram configuration
// Overwrite entire channel object to drop stale keys from old R2 backups
// that would fail OpenClaw's strict config validation (see #47)
if (process.env.TELEGRAM_BOT_TOKEN) {
    const dmPolicy = process.env.TELEGRAM_DM_POLICY || 'pairing';
    config.channels.telegram = {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        enabled: true,
        dmPolicy: dmPolicy,
    };
    if (process.env.TELEGRAM_DM_ALLOW_FROM) {
        config.channels.telegram.allowFrom = process.env.TELEGRAM_DM_ALLOW_FROM.split(',');
    } else if (dmPolicy === 'open') {
        config.channels.telegram.allowFrom = ['*'];
    }
}

// Discord configuration
// Discord uses a nested dm object: dm.policy, dm.allowFrom (per DiscordDmConfig)
if (process.env.DISCORD_BOT_TOKEN) {
    const dmPolicy = process.env.DISCORD_DM_POLICY || 'pairing';
    const dm = { policy: dmPolicy };
    if (dmPolicy === 'open') {
        dm.allowFrom = ['*'];
    }
    config.channels.discord = {
        token: process.env.DISCORD_BOT_TOKEN,
        enabled: true,
        dm: dm,
    };
}

// Slack configuration
if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_APP_TOKEN) {
    config.channels.slack = {
        botToken: process.env.SLACK_BOT_TOKEN,
        appToken: process.env.SLACK_APP_TOKEN,
        enabled: true,
    };
}

// ── Model providers: Gemini primary, Groq fallback (Anthropic removed OpenClaw compat) ──
config.agents = config.agents || {};
config.agents.defaults = config.agents.defaults || {};
config.agents.defaults.model = {
    primary: 'google/gemini-2.5-pro',
    fallbacks: [
        'groq/llama-3.3-70b-versatile',
    ],
};
// Compaction uses the cheaper Groq model
config.agents.defaults.compaction = config.agents.defaults.compaction || {};
config.agents.defaults.compaction.model = 'groq/llama-3.3-70b-versatile';
console.log('Models: primary=google/gemini-2.5-pro, fallback=groq/llama-3.3-70b-versatile');

// Disable the anthropic plugin since it no longer supports OpenClaw
config.plugins = config.plugins || {};
config.plugins.entries = config.plugins.entries || {};
config.plugins.entries['anthropic'] = { enabled: false };
console.log('Anthropic plugin disabled');

// ── Hooks: enable internal hooks so BOOT.md runs on startup ──
config.hooks = config.hooks || {};
config.hooks.internal = config.hooks.internal || {};
config.hooks.internal.enabled = true;
console.log('Internal hooks enabled (BOOT.md will run on startup)');

// ── Heartbeat: periodic health checks (agent-level config) ──
config.agents = config.agents || {};
config.agents.defaults = config.agents.defaults || {};
config.agents.defaults.heartbeat = {
    every: '30m',
    target: 'last',
    isolatedSession: true,
    lightContext: true,
    activeHours: { start: '06:00', end: '22:00', timezone: 'Australia/Sydney' },
};
// Channel-level heartbeat display settings
config.channels = config.channels || {};
config.channels.defaults = config.channels.defaults || {};
config.channels.defaults.heartbeat = {
    showOk: false,
    showAlerts: true,
    useIndicator: true,
};
console.log('Heartbeat configured (30min, 6am-10pm AEST, target: last)');

// ── Session maintenance: auto-prune old sessions ──
config.session = config.session || {};
config.session.maintenance = config.session.maintenance || {};
config.session.maintenance.mode = 'enforce';
config.session.maintenance.maxEntries = 50;
config.session.maintenance.maxDiskBytes = '100mb';
console.log('Session maintenance: enforce, max 50 sessions, 100MB disk cap');

// ── Compaction: notify user when context is compressed ──
config.agents.defaults.compaction = config.agents.defaults.compaction || {};
config.agents.defaults.compaction.notifyUser = true;
console.log('Compaction: notifyUser enabled');

// ── Tool loop detection: prevent infinite tool call cycles ──
config.tools = config.tools || {};
config.tools.loopDetection = config.tools.loopDetection || {};
config.tools.loopDetection.enabled = true;
config.tools.loopDetection.historySize = 10;
config.tools.loopDetection.warningThreshold = 3;
config.tools.loopDetection.criticalThreshold = 5;
console.log('Tool loop detection enabled (warn at 3, stop at 5)');

// ── Agent timeouts ──
config.agents.defaults.timeoutSeconds = 600; // 10 min per agent turn
config.tools.exec = config.tools.exec || {};
config.tools.exec.timeoutSec = 300; // 5 min per exec call
console.log('Agent timeout: 600s, exec timeout: 300s');

// ── Dreaming: memory consolidation — runs daily at 3am AEST ──
config.plugins = config.plugins || {};
config.plugins.entries = config.plugins.entries || {};
config.plugins.entries['memory-core'] = config.plugins.entries['memory-core'] || {};
config.plugins.entries['memory-core'].config = config.plugins.entries['memory-core'].config || {};
config.plugins.entries['memory-core'].config.dreaming = {
    enabled: true,
    frequency: '0 17 * * *',  // 17:00 UTC = 3am AEST
};
console.log('Dreaming enabled (daily 3am AEST)');

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Configuration patched successfully');
EOFPATCH

# ============================================================
# BACKGROUND SYNC LOOP
# ============================================================
if r2_configured; then
    echo "Starting background R2 sync loop..."
    (
        MARKER=/tmp/.last-sync-marker
        LOGFILE=/tmp/r2-sync.log
        touch "$MARKER"

        while true; do
            sleep 30

            CHANGED=/tmp/.changed-files
            {
                find "$CONFIG_DIR" -newer "$MARKER" -type f -printf '%P\n' 2>/dev/null
                find "$WORKSPACE_DIR" -newer "$MARKER" \
                    -not -path '*/node_modules/*' \
                    -not -path '*/.git/*' \
                    -type f -printf '%P\n' 2>/dev/null
            } > "$CHANGED"

            COUNT=$(wc -l < "$CHANGED" 2>/dev/null || echo 0)

            if [ "$COUNT" -gt 0 ]; then
                echo "[sync] Uploading changes ($COUNT files) at $(date)" >> "$LOGFILE"
                rclone sync "$CONFIG_DIR/" "r2:${R2_BUCKET}/openclaw/" \
                    $RCLONE_FLAGS --exclude='*.lock' --exclude='*.log' --exclude='*.tmp' --exclude='.git/**' 2>> "$LOGFILE"
                if [ -d "$WORKSPACE_DIR" ]; then
                    rclone sync "$WORKSPACE_DIR/" "r2:${R2_BUCKET}/workspace/" \
                        $RCLONE_FLAGS --exclude='skills/**' --exclude='.git/**' --exclude='node_modules/**' 2>> "$LOGFILE"
                fi
                if [ -d "$SKILLS_DIR" ]; then
                    rclone sync "$SKILLS_DIR/" "r2:${R2_BUCKET}/skills/" \
                        $RCLONE_FLAGS 2>> "$LOGFILE"
                fi
                date -Iseconds > "$LAST_SYNC_FILE"
                touch "$MARKER"
                echo "[sync] Complete at $(date)" >> "$LOGFILE"
            fi
        done
    ) &
    echo "Background sync loop started (PID: $!)"
fi

# ============================================================
# WORKSPACE SETUP (multi-agent workspaces with skill symlinks)
# ============================================================
echo "Setting up workspaces..."

# Agent skill assignments (space-separated skill names per agent)
CRAWLER_SKILLS="oem-crawl oem-api-discover oem-build-price-discover cloudflare-browser oem-agent-hooks"
EXTRACTOR_SKILLS="oem-extract oem-data-sync oem-semantic-search oem-agent-hooks"
DESIGNER_SKILLS="oem-design-capture oem-ux-knowledge oem-brand-ambassador cloudflare-browser oem-agent-hooks"
REPORTER_SKILLS="oem-report oem-sales-rep oem-agent-hooks"

# Setup a workspace: setup_workspace <workspace_path> <source_dir> <skills_list>
setup_workspace() {
    local ws_path="$1"
    local source_dir="$2"
    local skill_list="$3"

    mkdir -p "$ws_path/skills"

    # Copy all workspace markdown files (SOUL, AGENTS, MEMORY, IDENTITY, USER, TOOLS, HEARTBEAT, BOOT, DREAMS, etc.)
    if [ -d "$source_dir" ]; then
        for file in "$source_dir"/*.md; do
            [ -f "$file" ] && cp "$file" "$ws_path/"
        done
    fi

    # Symlink specific skills
    if [ -n "$skill_list" ] && [ -d "$SKILLS_DIR" ]; then
        for skill in $skill_list; do
            if [ -d "$SKILLS_DIR/$skill" ] && [ ! -e "$ws_path/skills/$skill" ]; then
                ln -s "$SKILLS_DIR/$skill" "$ws_path/skills/$skill"
            fi
        done
        echo "Workspace $ws_path: $(ls -1 "$ws_path/skills" 2>/dev/null | wc -l) skills linked"
    fi
}

# Main agent workspace (all skills)
WORKSPACE_DIR_OC="/root/.openclaw/workspace"
mkdir -p "$WORKSPACE_DIR_OC"
if [ -d "$SKILLS_DIR" ]; then
    if [ ! -e "$WORKSPACE_DIR_OC/skills" ]; then
        ln -s "$SKILLS_DIR" "$WORKSPACE_DIR_OC/skills"
    fi
    echo "Main workspace: $(ls -1 "$SKILLS_DIR" 2>/dev/null | wc -l) skills (all)"
fi
WORKSPACE_SOURCE="/root/clawd/workspace"
if [ -d "$WORKSPACE_SOURCE" ]; then
    for file in "$WORKSPACE_SOURCE"/*.md; do
        [ -f "$file" ] && cp "$file" "$WORKSPACE_DIR_OC/"
    done
    echo "Main workspace: copied $(ls -1 "$WORKSPACE_DIR_OC"/*.md 2>/dev/null | wc -l) markdown files"
fi

# Specialized agent workspaces
setup_workspace "/root/.openclaw/workspace-crawler" "/root/clawd/workspace-crawler" "$CRAWLER_SKILLS"
setup_workspace "/root/.openclaw/workspace-extractor" "/root/clawd/workspace-extractor" "$EXTRACTOR_SKILLS"
setup_workspace "/root/.openclaw/workspace-designer" "/root/clawd/workspace-designer" "$DESIGNER_SKILLS"
setup_workspace "/root/.openclaw/workspace-reporter" "/root/clawd/workspace-reporter" "$REPORTER_SKILLS"

echo "All agent workspaces configured"

# ============================================================
# START GATEWAY
# ============================================================
echo "Starting OpenClaw Gateway..."
echo "Gateway will be available on port 18789"

rm -f /tmp/openclaw-gateway.lock 2>/dev/null || true
rm -f "$CONFIG_DIR/gateway.lock" 2>/dev/null || true

echo "Dev mode: ${OPENCLAW_DEV_MODE:-false}"

# --bind and --token are config-file settings (patched above), not CLI flags since 2026.3.x
exec openclaw gateway --port 18789 --verbose --allow-unconfigured
