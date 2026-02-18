# OpenClaw Gateway Troubleshooting Log

**Date:** 2026-02-18
**Status:** ⚠️ Gateway fails to start (exit code 1)
**Current Version:** 7aa2273

---

## Current Issue

The OpenClaw gateway process exits with code 1 before port 18789 becomes available.

**Error Message:**
```
ProcessExitedBeforeReadyError: Process exited with code 1 before becoming ready.
Waiting for: port 18789 (TCP)
```

---

## Troubleshooting History

### 1. **Initial Problem: OpenClaw Version Mismatch** ✅ FIXED
- **Issue:** `openclaw@0.8.1` doesn't exist (version format was wrong)
- **Solution:** Upgraded to CalVer format: `openclaw@2026.2.15`
- **Commit:** 88c4666

### 2. **Token Authentication Error** ✅ FIXED
- **Issue:** Colleague getting "Invalid or missing token" error
- **Root Cause:** Token injection only worked for WebSocket, not HTTP requests
- **Solution:** Added HTTP token injection in `src/index.ts` lines 444-457
- **Commit:** 3bd6a91

### 3. **Memory Persistence Loss** ✅ FIXED
- **Issue:** Memory lost on page refresh
- **Root Cause:** Missing R2 credentials and bucket name mismatch
- **Solution:**
  - Set R2 API credentials as secrets
  - Added `R2_BUCKET_NAME=oem-agent-assets` to environment
- **Commit:** c1a893d

### 4. **Container Version Mismatch Warning** ✅ FIXED
- **Issue:** SDK 0.7.2 vs container 0.7.0 mismatch warning
- **Solution:** Upgraded Dockerfile FROM statement to `cloudflare/sandbox:0.7.2`
- **Commit:** 3672790

### 5. **JSON Syntax Error in openclaw.json** ✅ FIXED
- **Issue:** JSON doesn't support comments (`//`)
- **Root Cause:** Created `openclaw.json` with comment lines
- **Solution:** Removed all JSON comments
- **Commit:** aad913d

### 6. **Browser Profile Missing Required Field** ✅ FIXED
- **Issue:** `browser.profiles.cloudflare.color: Invalid input: expected string, received undefined`
- **Root Cause:** Patch script in `start-openclaw.sh` created browser profile without required `color` field
- **Solution:** Added `color: 'blue'` to browser profile configuration
- **Commit:** 6ad41b0

### 7. **Config Restoration from R2** ⚠️ ATTEMPTED
- **Issue:** Old invalid config being restored from R2 backup
- **Root Cause:** Onboard step skipped when config file exists
- **Solution:** Modified startup script to force delete existing config before onboard
- **Status:** Deployed but still failing
- **Commit:** 2d653b4

### 8. **Current Investigation: OpenClaw Installation**
- **Approach:** Testing if `openclaw` binary works at all
- **Test Script:** `test-openclaw.sh` runs diagnostic checks
- **Status:** Deployed, waiting for log output
- **Commit:** 7aa2273

---

## Configuration Overview

### Container Setup
- **Base Image:** `cloudflare/sandbox:0.7.2`
- **Node Version:** 22.13.1
- **OpenClaw Version:** 2026.2.15
- **Package Manager:** pnpm@9.15.0

### Environment Variables Set
- `ANTHROPIC_API_KEY` ✅
- `GROQ_API_KEY` ✅
- `TOGETHER_API_KEY` ✅
- `BRAVE_API_KEY` ✅
- `PERPLEXITY_API_KEY` ✅
- `GOOGLE_API_KEY` ✅
- `MOLTBOT_GATEWAY_TOKEN` ✅ (mapped to OPENCLAW_GATEWAY_TOKEN)
- `OPENCLAW_DEV_MODE=true` ✅
- `R2_BUCKET_NAME=oem-agent-assets` ✅
- `R2_ACCESS_KEY_ID` ✅
- `R2_SECRET_ACCESS_KEY` ✅

### Skills Configured (10 total)
All custom OEM skills are included in the container at `/root/clawd/skills/`:
- oem-agent-hooks
- oem-sales-rep
- oem-report
- oem-crawl
- oem-extract
- oem-design-capture
- oem-api-discover
- oem-build-price-discover
- oem-semantic-search
- cloudflare-browser

---

## Known Error Patterns

### From Previous Logs (before fixes)
```
Invalid config at /root/.openclaw/openclaw.json:
- browser.profiles.cloudflare.color: Invalid input: expected string, received undefined
```
**Status:** Fixed by adding `color: 'blue'` field

---

## Potential Root Causes (Under Investigation)

1. **OpenClaw 2026.2.15 Compatibility**
   - Version might have breaking changes or bugs
   - Consider downgrading to stable version if available

2. **Missing Dependencies**
   - OpenClaw might require system packages not in container
   - Node.js version compatibility (using 22.13.1)

3. **Configuration Validation**
   - Onboard command might fail due to invalid arguments
   - Config patch script might create invalid configuration

4. **Container Environment**
   - Sandbox limitations preventing OpenClaw from running
   - File permissions or system calls being blocked

---

## Next Steps

1. **Analyze test-openclaw.sh output** to determine if:
   - OpenClaw binary is correctly installed
   - Version command works
   - Gateway help command works
   - Gateway actually starts

2. **If OpenClaw binary works:**
   - Check exact error message from gateway startup
   - Validate generated configuration
   - Test with even more minimal settings

3. **If OpenClaw binary fails:**
   - Check npm global package installation
   - Verify Node.js version compatibility
   - Consider alternative installation method

4. **Alternative Approaches:**
   - Try older OpenClaw version (if 2026.2.15 is unstable)
   - Use Docker image from OpenClaw project instead of manual install
   - Contact OpenClaw support/community for container deployment guidance

---

## Useful Commands

### Check Deployment Status
```bash
wrangler deployments list
```

### View Live Logs
```bash
wrangler tail --format pretty
```

### Test Gateway
```bash
curl -v https://oem-agent.adme-dev.workers.dev/
```

### Check Secrets
```bash
wrangler secret list
```

---

## Documentation References

- [OpenClaw Documentation](https://docs.openclaw.ai)
- [Cloudflare Sandbox SDK](https://developers.cloudflare.com/workers/sandbox/)
- [Moltworker Blog Post](https://blog.cloudflare.com/moltworker-self-hosted-ai-agent/)

---

**Last Updated:** 2026-02-18 04:45 UTC
**Current Deploy:** https://oem-agent.adme-dev.workers.dev/
**Version ID:** 002a165e-bc12-4d75-92ab-990717f549cb
