# Composer CLI (block-composition Slice 2)

Composes a draft CMS page from a live Toyota page by matching captured
sections against the toyota-theme-nuxt block catalog.

    npx tsx scripts/compose-toyota-page.ts --url https://www.toyota.com.au/rav4

Flags: `--catalog <dir>` (default toyota-theme-nuxt/catalog), `--cms-url`
(default http://localhost:3000), `--min-confidence <0..1>` (default 0.5),
`--ai-extract` (LLM prop fallback when DOM extraction fills <50%),
`--from <run-dir>` (reuse a previous capture), `--title`, `--slug`,
`--post` (create the CMS draft; needs `CMS_ADMIN_EMAIL`/`CMS_ADMIN_PASSWORD`).

Requires: real Chrome installed, `TOGETHER_API_KEY` in oem-agent `.env`.
Outputs: `artifacts/composer/<slug>-<timestamp>/` — capture bundle,
`matches` in `report.json`, `document.json` (CmsPageBuilderDocument),
`report.md` with the proof-experiment metrics (% matched, props filled,
unmatched sections carried as `legacy_html`).

Unmatched sections are the input to the Slice 3 draft-block proposal flow.
