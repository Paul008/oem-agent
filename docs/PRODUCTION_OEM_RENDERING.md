# Production OEM Rendering

This is the production contract for rendering captured OEM model pages outside the dashboard.

## Source Of Truth

External sites should render the Worker production artifact, not the dashboard preview URL.

For Mitsubishi Outlander:

```txt
https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/mitsubishi-au-outlander/production-html
```

The dashboard preview remains a QA and editing surface:

```txt
https://oem-dashboard.pages.dev/preview/mitsubishi-au-outlander?view=production
```

Do not embed the dashboard preview in a customer-facing site. It is allowed to differ in chrome, preview scaffolding, iframe behavior, and dashboard release cadence.

## Recommended Consumer Flow

1. Fetch the manifest:

```txt
GET /api/v1/oem-agent/pages/:slug/production-manifest
```

2. Validate the returned artifact metadata:

```json
{
  "slug": "mitsubishi-au-outlander",
  "oem_id": "mitsubishi-au",
  "model_slug": "outlander",
  "mode": "clone",
  "active_mode": "clone",
  "version": 10,
  "html_url": "https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/mitsubishi-au-outlander/production-html",
  "html_bytes": 1005371,
  "html_sha256": "64b49bbc0a9a0b5485431e9ae7b1a0cf9f4ec1a49c7c54453e67dcb4cd9d103e",
  "etag": "\"sha256-64b49bbc0a9a0b5485431e9ae7b1a0cf9f4ec1a49c7c54453e67dcb4cd9d103e\""
}
```

3. Fetch `html_url` and cache it by `version` and `html_sha256`.

4. Render the returned HTML in the external application.

## Production Mode Rules

- `mode: "clone"` is the production baseline.
- The endpoint serves `content.modes.clone.edited_rendered` first, then `content.modes.clone.rendered`, then legacy `content.rendered`.
- The endpoint intentionally does not fall back to structured sections.
- If clone HTML is missing, the endpoint returns `409` so production cannot silently render a lower-fidelity structured page.
- Relative `/media/...` URLs are rewritten to absolute Worker media URLs.

## Why Not The Dashboard Preview?

The dashboard preview is useful for QA because it can show the same artifact in a controlled builder context, with device controls and read-only preview behavior. It is not the production integration point.

The Worker HTML endpoint has a narrower contract:

- one page artifact
- no dashboard shell
- stable cache metadata
- stable checksum
- no dependency on dashboard routing

## Structured Renderer Roadmap

Structured sections are still important, but they are not the default production renderer yet.

Use structured rendering for:

- editing workflows
- section extraction
- database-bound modules
- future OEM-native interactive components

Promote structured rendering to production only when the page or component has a separate QA gate proving it matches the OEM UX/UI at desktop, tablet, and mobile breakpoints.
