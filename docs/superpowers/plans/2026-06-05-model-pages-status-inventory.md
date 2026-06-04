# Model Pages Status Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Model Pages dashboard classify cached generated page details as structured, clone-only, generated, or still loading using the mode-aware page payload.

**Architecture:** Keep the worker API unchanged. Add a small dashboard helper that owns status classification, then have `model-pages.vue` fetch mode payloads and render row badges plus cached inventory summary cards from that helper.

**Tech Stack:** Vue 3, Vite/Vitest, TypeScript, Cloudflare Pages dashboard.

---

### Task 1: Status Helper

**Files:**
- Add: `dashboard/src/pages/dashboard/model-pages-status.ts`
- Test: `dashboard/src/pages/dashboard/model-pages-status.test.ts`

- [ ] **Step 1: Write failing helper tests**

Cover:

- `unknown` for missing page detail data.
- Legacy `content.sections` section counts.
- Mode-aware `content.modes.sections.items` section counts.
- `structured` winning over clone payloads when sections exist.
- `cloned` for `content.modes.clone.rendered` and `content.modes.clone.edited_rendered`.
- `cloned` for legacy clone HTML detected through stylesheet or Tailwind markers.
- `generated` for loaded pages without sections or clone HTML.
- Summary counts for cached page detail data.

- [ ] **Step 2: Run the focused test and confirm failure**

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/model-pages-status.test.ts
```

Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Implement the helper**

Export:

- `GeneratedPageStatus`
- `getGeneratedPageSectionCount(page)`
- `hasGeneratedPageSections(page)`
- `hasGeneratedPageClone(page)`
- `getGeneratedPageStatus(page)`
- `summarizeGeneratedPageStatuses(pages)`

Use object guards for payload traversal and keep detection conservative for legacy `content.rendered`: only classify it as clone HTML when it includes the existing stylesheet or Tailwind markers.

- [ ] **Step 4: Run the focused helper test**

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/model-pages-status.test.ts
```

Expected: PASS.

### Task 2: Model Pages Dashboard Integration

**Files:**
- Modify: `dashboard/src/pages/dashboard/model-pages.vue`
- Test: `dashboard/src/pages/dashboard/model-pages-status.test.ts`

- [ ] **Step 1: Add failing source-level integration assertions**

Assert `model-pages.vue`:

- Imports the status helper functions and `GeneratedPageStatus`.
- Fetches page details with `fetchGeneratedPage(fullSlug(item), { includeModes: true })`.
- Has an `unknown` status config displayed as `Loading`.
- Uses helper-driven section counts and page status.
- Renders summary card labels for `Structured Pages`, `Clone-only`, and `Loaded Details`.

- [ ] **Step 2: Run the focused dashboard test and confirm failure**

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/model-pages-status.test.ts
```

Expected: FAIL until the Vue file imports and uses the helper.

- [ ] **Step 3: Update `model-pages.vue`**

Replace local status detection with the helper. Extend the cached page type enough to include `content.modes`, request mode data during prefetch, update badge styling for the new `unknown` state, and add cached inventory summary cards.

- [ ] **Step 4: Run the focused dashboard test**

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/model-pages-status.test.ts
```

Expected: PASS.

### Task 3: Verification, Commit, Push, Deploy

**Files:**
- Verify dashboard and repo.

- [ ] **Step 1: Run focused and full verification**

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/model-pages-status.test.ts
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production
pnpm --dir dashboard exec vue-tsc -b
git diff --check
CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build
```

- [ ] **Step 2: Commit implementation**

Commit dashboard changes with:

```bash
git add dashboard/src/pages/dashboard/model-pages.vue dashboard/src/pages/dashboard/model-pages-status.ts dashboard/src/pages/dashboard/model-pages-status.test.ts
git commit -m "feat(model-pages): show mode-aware page status"
```

- [ ] **Step 3: Push and deploy dashboard**

```bash
git push
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
curl -I https://oem-dashboard.pages.dev
```

No worker deploy is required unless worker files change.
