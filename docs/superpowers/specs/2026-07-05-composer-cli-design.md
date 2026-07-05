# Composer CLI (Block-Composition Slice 2) — Design

**Date:** 2026-07-05 · **Status:** Approved (Paul, 2026-07-05) · **Parent:** 2026-07-05-block-composition-addendum.md (decisions 1–5 govern)

## Decisions locked this session (Paul, 2026-07-05)

1. **Vision model:** Kimi K2.5 via Together API (`TOGETHER_API_KEY` already in oem-agent root `.env`). Not Gemini, not Anthropic.
2. **Proof-experiment target ("page 1"):** the toyota.com.au RAV4 page (`--url` stays generic; RAV4 is the documented default run).
3. **No-match handling:** unmatched sections become `legacy_html` carrier sections in the draft (spec-sanctioned interim carrier), flagged in the report for the future Slice-3 proposal flow.
4. **Posting default:** dry-run. `--post` is required to actually create the CMS draft.
5. **Amendment (Paul, 2026-07-05):** the stored Together credential proved invalid (sk-kimi key rejected by Together/Moonshot/kimi.com). Default vision provider switched to Gemini 2.5 Pro (GEMINI_API_KEY, verified live); Kimi-via-Together path retained behind --provider together for a future valid key.

## Shape: one pipeline CLI with stage-cached artifacts

`scripts/compose-toyota-page.ts` (oem-agent, run via `npx tsx`) executes capture → segment → match → extract → assemble → report[/post] in one invocation. Every stage writes to `artifacts/composer/<slug>-<timestamp>/`; `--from <dir>` replays from an existing capture so matching/extraction iterate without re-hitting Toyota. (Two-CLI split rejected: doubles surface for replayability `--from` already provides. Worker-route extension rejected: spec mandates operator-triggered local CLI; Toyota blocks server-side capture.)

## Components (all new files in oem-agent unless noted)

1. **`scripts/lib/section-capture.ts`** — local real-Chrome puppeteer using existing `scripts/lib/qa-browser.mjs` (`launchQaBrowser`, `resolveBrowserExecutable`, `settlePage`). Ports the Worker's proven sectionMap heuristic (`src/routes/oem-agent.ts:495-583`: candidates `section, article, main > div, body > div > div`; size/dedupe filters) into a local `page.evaluate`. Per section: index, tag, classes, bbox, outerHTML, per-element PNG. Full-page PNG + `sections.json` for the bundle. Reuses blocked-page detection from `src/design/page-capturer.ts` — abort without writing artifacts if the security wall appears.
2. **`scripts/lib/preset-matcher.ts`** — one Kimi K2.5 multimodal call per section: section crop + all 15 catalog exemplar images (downscaled) + text menu (preset name/description/category/variant/prop shape) → strict JSON `{presetId|null, confidence, runnersUp[]}`. Below `--min-confidence` (default 0.5) or `presetId:null` → no-match. Mirrors the Together request format already proven in `src/ai/router.ts` (`callTogether`) rather than importing the Worker-env-shaped `AiRouter` class.
3. **`scripts/lib/prop-extractor.ts`** — deterministic cheerio extraction driven by the matched preset's `propSchema` from `catalog.json`: heading→first h1–h3; body→first substantive p; imageUrl/imageAlt→first img (URLs absolutized against the source origin); buttonLabel/buttonHref→first CTA anchor; eyebrow→short text preceding the heading; `items[]`→repeated card-like children mapped with the same field rules. Returns `{props, filledRatio, missing[]}`. `--ai-extract` enables a Kimi text call (section HTML + propSchema → JSON props) as fallback when deterministic filledRatio < 0.5. Vision chooses, DOM transcribes (addendum decision 5).
4. **`scripts/lib/cms-client.ts`** — `login(baseUrl, email, password)` → captures `auth_token`/`refresh_token` from Set-Cookie (`POST /api/auth/login`); `createDraftPage(...)` → `POST /api/admin/pages` with `{title, slug, status:'draft', content: CmsPageBuilderDocument}` and the cookie header. Server renders `contentHtml` itself — client never pre-renders. Tenant comes from the CMS deployment's own `NUXT_PUBLIC_TENANT_SLUG`; the CLI does not send tenant identity.
5. **`scripts/compose-toyota-page.ts`** — orchestrator. Flags: `--url`, `--catalog <dir>` (default `/Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt/catalog`), `--cms-url` (default `http://localhost:3000`), `--post`, `--from <capture-dir>`, `--min-confidence`, `--ai-extract`, `--title`, `--slug`. Credentials via env `CMS_ADMIN_EMAIL` / `CMS_ADMIN_PASSWORD`. Assembly: matched sections → typed `CmsPageSection`s in DOM order (label = preset name, extracted props, settings `{}`); unmatched → `legacy_html` sections carrying captured outerHTML verbatim; document `{version:1, templateKey:null, layout:defaults}`.

## Artifacts per run

`artifacts/composer/<slug>-<timestamp>/`: `capture/full.png`, `capture/sections/<n>.png`, `capture/sections.json`, `matches.json`, `document.json`, `report.json`, `report.md`, `post-result.json` (when `--post`). `report.md` carries the addendum's success metrics directly: % sections matched, per-section table (preset, confidence, filled/missing props), unmatched count.

## Error handling

- Security-wall page detected → exit non-zero, no artifacts bundle, actionable message (retry locally / different network).
- Together API failure per section → retry once, then record section as no-match with the error in the report (pipeline completes).
- CMS login/POST failure → document.json and report still written; exit non-zero with response body summarized.
- Zero sections detected → exit non-zero with capture bundle retained for inspection.

## Testing (vitest, repo convention: tests beside scripts)

- `prop-extractor.test.ts` — HTML fixtures per preset family (hero, cards/items, cta, image+text); absolutization; filledRatio/missing accounting.
- `preset-matcher.test.ts` — prompt-builder (menu content, image ordering) and response parsing/thresholding, no live API.
- `cms-client.test.ts` — mocked fetch: cookie capture, draft POST shape, error paths.
- `section-capture.test.ts` — pure filter/dedupe logic extracted to testable functions; no live browser.
- Live E2E = the operator-run proof experiment on the RAV4 page (dry-run first, then `--post`).

## Out of scope (Slice 3+)

Draft-block proposal generation for unmatched sections; scrapling service wiring; any Worker/route changes; catalog regeneration (owned by toyota-theme-nuxt, documented there).
