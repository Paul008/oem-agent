# Scrapling Capture Backend Plan

Written 2026-06-04.

## Context

Model Page Builder capture is currently TypeScript inside the Cloudflare Worker:

- `POST /api/v1/oem-agent/admin/clone-page/:oemId/:modelSlug`
- `src/design/page-capturer.ts`
- Cloudflare Browser binding for rendered DOM capture
- R2 `pages/definitions/{oemId}/{modelSlug}/latest.json` for persisted page definitions

This works across most audited OEMs, but Toyota RAV4 recapture hit Toyota's security verification
page. The capturer previously wrote that page to R2 because the old bot check only caught small
Cloudflare interstitials. That R2 object was restored from the latest good version.

## Phase 0: Safety Guard

Status: implemented.

`PageCapturer` now rejects security/challenge pages before any image download or R2 write. It checks
both the raw post-navigation HTML and the normalized captured body for high-confidence challenge
copy such as:

- `Performing security verification`
- `security service to protect against malicious bots`
- `verifies you are not a bot`
- Cloudflare challenge/Turnstile markers

If detected, `captureModelPage()` returns `success: false`, `bot_blocked: true`, and does not
overwrite `latest.json`.

## Phase 1: Toyota-Only Scrapling Spike

Goal: prove whether Scrapling can fetch the real Toyota model page where Cloudflare Browser cannot.

Recommended shape:

1. Add an external Python runner, not Worker-native Python.
2. Use `scrapling[fetchers]` with `StealthyFetcher` or `StealthySession`.
3. Start with Toyota only.
4. Use a persistent session directory and an AU-located proxy if needed.
5. Validate against Toyota-specific content such as `RAV4`, `Long live recreation`, or
   `All-New RAV4`.
6. Return rendered HTML, source URL, captured XHR metadata, and a challenge-detection result.

Do not write R2 directly from the Scrapling spike. Feed the HTML back through the existing page
definition pipeline after validation.

Probe script:

```bash
python3 -m pip install "scrapling[fetchers]"
python3 scripts/probe-scrapling-capture.py \
  --url https://www.toyota.com.au/rav4 \
  --expect-text "RAV4|Long live recreation|All-New RAV4" \
  --html-out /private/tmp/toyota-rav4-scrapling.html \
  --out /private/tmp/toyota-rav4-scrapling.json
```

Exit code `0` means the returned HTML did not match the local challenge-page detector and, when
`--expect-text` is supplied, the expected model-page content was present. Exit code `2` means
Scrapling still received a security-verification page. Exit code `3` means the capture was not a
detected challenge page, but the expected model-page content was missing.

Local Toyota result from 2026-06-04:

- Status `200`
- Title: `All-New RAV4 2026 | Hybrid & Plug-in Hybrid Electric SUV | Toyota Australia`
- Captured HTML: about 2.2 MB
- Challenge detected: `false`
- RAV4 content detected: `true`

The earlier `--wait-selector main` probe timed out even though the returned HTML contained real
Toyota content, so the recommended probe now uses content validation instead of a generic selector
wait.

## Phase 2: Adapter Contract

Status: implemented for externally rendered HTML.

Add a capture backend abstraction around the existing capturer:

```ts
type CaptureBackend = 'cloudflare-browser' | 'scrapling-stealth'
```

The existing Cloudflare Browser path remains default. Scrapling is selected only when:

- OEM is in an allowlist, initially `toyota-au`
- externally rendered HTML is supplied by the operator or an external service
- an operator explicitly requests the fallback

The adapter should return the same `DomCaptureResult` shape used by `PageCapturer` so URL rewriting,
image download, stylesheet extraction, mode preservation, and R2 versioning remain unchanged.

Implemented request shape:

```json
{
  "source_url": "https://www.toyota.com.au/rav4",
  "capture_backend": "scrapling-stealth",
  "captured_html": "<!doctype html>...",
  "captured_title": "All-New RAV4 2026 | Hybrid & Plug-in Hybrid Electric SUV | Toyota Australia",
  "final_url": "https://www.toyota.com.au/rav4",
  "stylesheet_urls": []
}
```

The Worker does not run Scrapling or Python. It validates and normalizes the supplied HTML, rejects
security/challenge pages, then reuses the existing clone persistence path.

## Phase 3: Production Hardening

Before broad rollout:

- Never overwrite an existing page if challenge detection fires.
- Store failed capture diagnostics under a separate R2 prefix, not `pages/definitions`.
- Add per-OEM backend settings in dashboard/admin config.
- Record capture backend, challenge status, proxy/session metadata, and timing in extraction run logs.
- Keep Scrapling behind an explicit allowlist until multiple Toyota recaptures are clean.

## Acceptance Criteria

- [x] A Toyota recapture that receives a security page returns `bot_blocked: true` and preserves the old
  `latest.json`.
- [x] A successful Scrapling Toyota capture produces real RAV4 content, non-empty images, and no
  security-verification copy.
- [x] Clone Studio audit for `toyota-au-rav4` reports no broken responsive-media URLs after a successful
  recapture.
