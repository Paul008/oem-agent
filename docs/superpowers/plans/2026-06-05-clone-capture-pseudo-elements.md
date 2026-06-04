# Clone Capture Pseudo-Element Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve simple CSS pseudo-element text in Clone Studio captured HTML.

**Architecture:** Add browser-safe helper functions in `src/design/page-capturer.ts`. Unit-test the pure helpers directly. Serialize the browser materializer into the existing `page.evaluate()` capture flow and run it after the content container is selected, before serialization.

**Tech Stack:** TypeScript, Cloudflare Puppeteer, Vitest.

---

## Files

- Modify `src/design/page-capturer.ts`.
- Modify `src/design/page-capturer.test.ts`.
- Add this spec and plan under `docs/superpowers/`.

## Tasks

- [ ] Add failing tests for pseudo content normalization and pseudo span style generation.
- [ ] Implement pure helpers:
  - `normalizePseudoElementContentForCapture(content)`
  - `pseudoElementInlineStyleForCapture(style)`
- [ ] Add browser helper:
  - `materializePseudoElementTextForCapture(root)`
- [ ] Pass `materializePseudoElementTextForCapture.toString()` into `page.evaluate()`.
- [ ] Invoke it after `container` is selected and before image/style collection.
- [ ] Run focused tests:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

- [ ] Run worker tests and typecheck:

```bash
npx vitest run
npx tsc --noEmit
```

- [ ] Run dashboard verification and deploy:

```bash
pnpm --dir dashboard exec vue-tsc -b
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production
CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
```
