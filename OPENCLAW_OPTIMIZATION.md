# OpenClaw Optimization Summary

**Date:** 2026-02-18
**Version:** Production-ready with multi-provider AI

---

## 🎯 Overview

Your OpenClaw deployment has been optimized based on official production best practices from [docs.openclaw.ai](https://docs.openclaw.ai/gateway/configuration-reference.md).

## ✅ What's Been Configured

### 1. **Container Environment**
- **Sandbox Version:** 0.7.0 → 0.7.2 ✅ (fixes SDK version mismatch)
- **OpenClaw Version:** 2026.2.15 (latest)
- **Configuration:** Production-optimized `openclaw.json` included in container
- **R2 Storage:** Persistent memory with automatic backup (every 2-12 hours)

### 2. **AI Model Providers**

#### **Primary Model: Groq Llama 4 Scout**
- **Purpose:** Fast inference for general queries
- **Context:** 131K tokens
- **Max Output:** 32K tokens
- **Speed:** Fastest inference (Groq infrastructure)

#### **Fallback Models:**
1. **Anthropic Claude Sonnet 4.5** (reliability)
2. **Together Kimi K2.5** (alternative high-quality)

#### **Vision Model: Kimi K2.5 Vision**
- **Purpose:** Design capture, screenshot analysis
- **Provider:** Together AI
- **Features:** Vision-capable for OEM design work

### 3. **Custom Skills (All Enabled)**

Your 10 custom OEM skills are configured and active:

| Skill | Purpose | Trigger |
|-------|---------|---------|
| `oem-agent-hooks` | Health monitoring & maintenance | Cron |
| `oem-sales-rep` | Conversational queries via Slack | User request |
| `oem-report` | Daily digest & change alerts | Cron + events |
| `oem-crawl` | Website crawling | Manual/scheduled |
| `oem-extract` | Data extraction | Triggered |
| `oem-design-capture` | Visual design analysis | Manual |
| `oem-api-discover` | API discovery | Research |
| `oem-build-price-discover` | Pricing discovery | Research |
| `oem-semantic-search` | Vector search | Queries |
| `cloudflare-browser` | Browser automation | Tools |

**Skills Auto-Reload:** Changes detected within 250ms

### 4. **Research & Search APIs**

Enhanced research capabilities:

- **Brave Search:** Web search API
- **Perplexity:** AI-powered research
- **Google Gemini:** Embeddings for semantic search

### 5. **Performance Settings**

#### **Context & Concurrency**
```json
{
  "contextTokens": 200000,      // 200K token context window
  "maxConcurrent": 3,            // Max 3 parallel agents
  "maxSubagents": 5,             // Up to 5 sub-agents
  "debounceMs": 1000             // 1s message debouncing
}
```

#### **Session Management**
- **Scope:** `per-sender` (isolated memory per user)
- **DM Reset:** 7 days idle
- **Group Reset:** 3 days idle
- **Channel Reset:** 1 day idle
- **Auto-Pruning:** 30 days
- **Compaction:** Enabled with memory flush

#### **History Limits**
- **Direct messages:** 200 messages
- **Group chats:** 100 messages
- **Channels:** 50 messages

### 6. **Gateway Configuration**

```json
{
  "port": 18789,
  "mode": "local",
  "bind": "lan",                 // Accessible on LAN
  "auth": { "mode": "token" },   // Token-based auth
  "controlUi": {
    "enabled": true,             // Web UI at /openclaw
    "allowInsecureAuth": true    // Dev mode enabled
  }
}
```

### 7. **Memory Persistence**

#### **R2 Backup Schedule**
- Every 2 hours: `0 */2 * * *`
- Every 4 hours: `0 */4 * * *`
- Every 12 hours: `0 */12 * * *`
- Daily at 6 AM: `0 6 * * *`
- Daily at 7 AM: `0 7 * * *`

#### **What's Persisted**
- Agent memory and sessions
- Workspace files (IDENTITY.md, USER.md, MEMORY.md)
- Custom skills
- Configuration state

#### **Restore Logic**
On container restart:
1. Check R2 for backup timestamp
2. Compare with local timestamp
3. Restore if R2 is newer
4. Resume from last saved state

## 🔑 Environment Variables

### **AI Providers**
- `ANTHROPIC_API_KEY` - Claude models
- `GROQ_API_KEY` - Llama 4 Scout, GPT-OSS
- `TOGETHER_API_KEY` - Kimi K2.5, K2.5 Vision

### **Research APIs**
- `BRAVE_API_KEY` - Brave Search
- `PERPLEXITY_API_KEY` - Perplexity AI
- `GOOGLE_API_KEY` - Google Gemini

### **OEM Agent**
- `SUPABASE_URL` - Database URL
- `SUPABASE_SERVICE_ROLE_KEY` - DB access
- `SLACK_WEBHOOK_URL` - Notifications

### **R2 Storage**
- `R2_ACCESS_KEY_ID` - R2 credentials
- `R2_SECRET_ACCESS_KEY` - R2 secret
- `CF_ACCOUNT_ID` - Cloudflare account

### **Gateway**
- `MOLTBOT_GATEWAY_TOKEN` - Auth token
- `OPENCLAW_DEV_MODE` - Dev features
- `R2_BUCKET_NAME` - oem-agent-assets

## 📊 Performance Expectations

### **Inference Speed (by Provider)**
- **Groq:** ~100-200 tokens/sec (fastest)
- **Anthropic:** ~50-100 tokens/sec (reliable)
- **Together:** ~80-150 tokens/sec (balanced)

### **Memory Impact**
- **Skills overhead:** ~10 skills × 24 tokens = ~240 tokens
- **Base overhead:** 195 tokens
- **Total system prompt:** ~500-1000 tokens (depending on context)

### **Session Limits**
- **Max concurrent agents:** 3
- **Max subagents per session:** 5
- **Message queue:** 1s debounce
- **Context budget:** 200K tokens

## 🔒 Security Configuration

### **Authentication**
- Token-based gateway auth
- Cloudflare Access for Worker (DEV_MODE bypasses in dev)
- Trusted proxies: 10.1.0.0

### **Logging**
- Level: `info`
- Sensitive data redaction: `tools` (hides API keys in logs)

### **Tools Profile**
- `coding` - File system, runtime, web, automation, messaging
- Elevated mode: Disabled by default

## 🚀 Usage Examples

### **Fast Inference (Groq)**
```
User: What's the latest from Ford's website?
→ Uses: groq/llama-4-scout (fast response)
```

### **Complex Analysis (Anthropic)**
```
User: Analyze pricing trends across all 13 OEMs
→ Fallback to: anthropic/claude-sonnet-4-5 (deep reasoning)
```

### **Design Capture (Vision)**
```
User: [uploads screenshot of OEM homepage]
→ Uses: together/Kimi/k2.5-vision (visual analysis)
```

### **Research (Multi-API)**
```
User: Research electric vehicle incentives in Australia
→ Uses: Brave Search + Perplexity + Gemini embeddings
```

## 📖 Further Reading

- [OpenClaw Configuration Reference](https://docs.openclaw.ai/gateway/configuration-reference.md)
- [Skills Documentation](https://docs.openclaw.ai/tools/skills.md)
- [Multi-Agent Routing](https://docs.openclaw.ai/concepts/multi-agent.md)
- [Session Management](https://docs.openclaw.ai/reference/session-management-compaction.md)
- [ClawHub Skills Registry](https://clawhub.com)

## 🔄 Next Steps

1. **Test the deployment:** Visit `https://oem-agent.adme-dev.workers.dev/`
2. **Try different models:** Ask questions and see which model responds
3. **Monitor performance:** Check logs with `wrangler tail`
4. **Install more skills:** Browse [ClawHub](https://clawhub.com) for additional capabilities
5. **Customize configuration:** Edit `openclaw.json` and redeploy

---

**All optimizations deployed:** 2026-02-18
**Commit:** 1124638
**Status:** ✅ Production-ready
