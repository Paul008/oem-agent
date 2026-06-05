# OEM Fidelity QA

The first enterprise QA layer is a deterministic visual fidelity report. It compares the live OEM page against the dashboard production preview across desktop, tablet, and mobile, then writes screenshots, diff overlays, machine findings, and an AI-review prompt.

## Run

```bash
pnpm qa:fidelity -- --source-url https://www.ford.com.au/showroom/cars/mustang/ --slug ford-au-mustang
```

Useful options:

```bash
pnpm qa:fidelity -- \
  --source-url https://www.ford.com.au/showroom/cars/mustang/ \
  --preview-url "https://oem-dashboard.pages.dev/preview/ford-au-mustang?view=production" \
  --viewports desktop,tablet,mobile \
  --source-hide ".some-oem-only-banner" \
  --fail-on critical
```

Output goes to `artifacts/oem-fidelity/<slug>-<timestamp>/`:

- `source-*.png` and `preview-*.png` viewport screenshots
- `diff-*.png` red visual mismatch overlays
- `report.json` machine-readable results, including 1000px vertical visual-diff bands
- `report.md` human-readable report with the worst visual-diff bands per viewport
- `ai-review-prompt.md` prompt for a vision model reviewer

The dashboard `/preview/*` route is intentionally public with editing disabled in `?view=production` so the QA runner can capture the same read-only preview that a customer-facing page would use. Authenticated builder routes remain protected.

## What It Checks

- screenshot mismatch percentage for desktop, tablet, and mobile
- worst 1000px vertical diff bands, so full-page mismatch can be traced to page regions
- failed image/font/stylesheet/script requests
- visible broken images
- root horizontal overflow and overflowing elements
- clipped text on real text-bearing elements with meaningful overflow
- low contrast visible text samples
- page height/width mismatch
- largest-image desktop/mobile reuse, which catches missing mobile art direction in hero and large media blocks
- cloned preview iframe content as a standalone full page, so the report does not compare the OEM page against dashboard chrome

## AI Assistance

The CLI writes `ai-review-prompt.md` instead of calling a provider directly. Attach each viewport's source, preview, and diff screenshots to the configured vision model, then use the prompt to get structured JSON issues.

This keeps the deterministic gate stable while letting the AI reviewer focus on judgment-heavy issues: wrong crop, wrong mobile image, hidden text, spacing drift, incorrect accordion/tab state, or brand styling mismatches.

The next step is to wire this report into the existing `AiRouter` as a dashboard action so the vision review can run automatically after the deterministic report has been generated.
