# Versioned Model Page Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish saved clone/Tailwind model-page drafts as validated, immutable, revisioned body artifacts that the Northern Nissan site can consume immediately and roll back safely.

**Architecture:** OEM Agent owns draft composition, validation, immutable R2 artifacts, and an atomic published-revision pointer. The dashboard exposes Save Draft, Preview Candidate, Publish, and Rollback, while the dealer platform consumes the existing production manifest and embeds its versioned body URL between the platform hero and platform-owned variants/inventory.

**Tech Stack:** Cloudflare Workers, Hono, R2 conditional writes, TypeScript, Vitest, Vue 3, shadcn-vue, Tailwind CSS, Nuxt 4, Nitro cache storage, Puppeteer/Cloudflare Browser Rendering.

## Global Constraints

- Execute OEM Agent work in a clean worktree created from `origin/fix/tailwind-bulk-leaf-conversion` (`6da38f6`) until that commit is merged into `origin/main`; never edit the dirty checkout at `/Users/paulgiurin/Documents/Projects/oem-agent`.
- Execute dealer-platform work in a clean branch/worktree based on the latest `origin/main` from `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval-main`.
- Preserve the legacy clone response for every page with no publication state.
- Save Draft must never mutate `published_revision`.
- Production must never follow `active_mode`.
- Nissan's platform hero, variants, and inventory remain outside the imported body.
- Published revisions are immutable; only `publication/state.json` may change.
- Candidate and production HTML permit only the trusted Alpine CSP runtime and OEM resize bridge; production iframes do not use `allow-same-origin`.
- AI may generate or explain conversion output but cannot override blocking validation failures.
- Use `OEM_PAGE_BUCKET` for publication storage; for current deployments it is bound to the same R2 bucket as `MOLTBOT_BUCKET`.
- Run focused tests after every task, `pnpm test`, `pnpm typecheck`, dashboard `pnpm lint:fix`, dashboard `pnpm test`, and dashboard `pnpm build` before the OEM Agent PR.
- In the dealer repository run the affected Vitest files, `pnpm typecheck`, and the production build only after explicit build approval under that repository's instructions.
- Stage explicit paths only. Never stage or commit `.env`, `.dev.vars`, tokens, credentials, or unrelated dirty files.
- Deployments and production publication remain separately approved release actions after both PRs pass review.

---

## File and Interface Map

### OEM Agent Worker

- Create `src/design/model-page-publication/types.ts` — shared publication contracts and type guards.
- Create `src/design/model-page-publication/storage.ts` — R2 key construction, immutable revision writes, conditional state updates, and history reads.
- Create `src/design/model-page-publication/composer.ts` — mixed clone/Tailwind body composition and platform-region exclusion.
- Create `src/design/model-page-publication/validator.ts` — static safety, size, media, overflow, viewport, visual, and interaction validation.
- Create `src/design/model-page-publication/service.ts` — candidate, publish, rollback, manifest, and webhook orchestration.
- Create colocated `*.test.ts` files for each module.
- Modify `src/routes/oem-agent.ts` — extend the existing manifest/body routes and add authenticated publication routes.
- Modify `src/routes/oem-agent.test.ts` — route compatibility, conflicts, candidate, publish, and rollback tests.
- Modify `src/types.ts` and `wrangler.jsonc` — publication page allowlist variable.

### OEM Dashboard

- Create `dashboard/src/lib/model-page-publication.ts` — dashboard-facing contracts.
- Modify `dashboard/src/lib/worker-api.ts` and its test — publication API methods and authenticated HTML fetch.
- Create `dashboard/src/composables/use-model-page-publication.ts` and test — publication state machine.
- Create `dashboard/src/pages/dashboard/components/page-builder/PublicationControls.vue` and test — reusable toolbar controls/history.
- Modify `dashboard/src/pages/preview/[slug].vue` and `dashboard/src/pages/dashboard/page-builder/[slug].vue` — integrate candidate preview and controls.
- Modify focused preview/page-builder tests.

### Dealer Platform

- Create `server/utils/oem-model-page-manifest.ts` — manifest validation, last-known-good storage, and legacy fallback.
- Create `test/unit/server/utils/oem-model-page-manifest.test.ts`.
- Modify `server/api/vehicles/by-slug/[slug].get.ts` and `test/unit/server/api/nissan-model-page.test.ts` — consume the manifest and return a revisioned body URL.
- Modify `pages/models/[slug].vue` and add `test/unit/pages/nissan-model-page-embed.test.ts` — hardened sandbox and revision-aware message handling.
- Modify `server/api/webhooks/purge-model-cache.post.ts` and add its focused test — evict the last-known manifest on publish/rollback.

### End-to-End Evidence

- Create `scripts/model-page-publication-battle-test.mjs` — editor/candidate/direct-body/dealer comparison, interaction checks, publish proof, and rollback proof.
- Add `qa:publication` to root `package.json`.

---

### Task 1: Publication Contracts and Atomic R2 Storage

**Files:**
- Create: `src/design/model-page-publication/types.ts`
- Create: `src/design/model-page-publication/storage.ts`
- Test: `src/design/model-page-publication/storage.test.ts`

**Interfaces:**
- Consumes: `R2Bucket`, `R2Object`, page IDs shaped as `${oemId}-${modelSlug}`.
- Produces: `PublicationState`, `PublicationRevisionManifest`, `publicationKeys()`, `readPublicationState()`, `writeImmutableRevision()`, `compareAndSetPublicationState()`, `listPublicationHistory()`, and `prunePublicationRevisions()`.

- [ ] **Step 1: Write failing storage tests**

```ts
it('writes revision objects before atomically selecting the revision', async () => {
  const bucket = new MemoryR2Bucket()
  await writeImmutableRevision(bucket, 'nissan-au-ariya', revisionFixture(21))
  const state = await compareAndSetPublicationState(bucket, 'nissan-au-ariya', null, {
    schema_version: 1,
    next_revision: 22,
    published_revision: 21,
    candidate: null,
    history: [21],
  })
  expect(state.value.published_revision).toBe(21)
  expect(bucket.keys()).toEqual(expect.arrayContaining([
    'model-pages/nissan-au-ariya/publication/revisions/21/manifest.json',
    'model-pages/nissan-au-ariya/publication/revisions/21/body.html',
    'model-pages/nissan-au-ariya/publication/revisions/21/validation.json',
    'model-pages/nissan-au-ariya/publication/state.json',
  ]))
})

it('rejects a stale state etag', async () => {
  const bucket = new MemoryR2Bucket()
  const first = await compareAndSetPublicationState(bucket, 'nissan-au-ariya', null, initialPublicationState())
  await expect(compareAndSetPublicationState(bucket, 'nissan-au-ariya', 'stale-etag', first.value))
    .rejects.toThrow('Publication state changed')
})

it('prunes only revisions outside the retained ten and never deletes current or previous production', async () => {
  const deleted = await prunePublicationRevisions(bucketWithRevisions(1, 14), 'nissan-au-ariya', {
    retained: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    publishedRevision: 14,
    previousPublishedRevision: 4,
  })
  expect(deleted).toEqual([1, 2, 3])
  expect(bucket.has(publicationKeys('nissan-au-ariya', 4).manifest)).toBe(true)
})
```

- [ ] **Step 2: Run the tests and verify the missing-module failure**

Run: `pnpm vitest run src/design/model-page-publication/storage.test.ts`

Expected: FAIL because `storage.ts` and exported publication contracts do not exist.

- [ ] **Step 3: Implement exact contracts and storage operations**

```ts
export interface PublicationState {
  schema_version: 1
  next_revision: number
  published_revision: number | null
  candidate: PublicationCandidateSummary | null
  history: number[]
}

export interface PublicationCandidateSummary {
  revision: number
  draft_version: number
  status: 'building' | 'ready' | 'failed'
  validation_digest: string | null
  created_at: string
  created_by: string
}

export interface PublicationRevisionManifest {
  pageId: string
  revision: number
  draftVersion: number
  format: 'composed-html-body'
  bodyPath: string
  publishedAt: string | null
  publishedBy: string | null
  platformRegions: Array<'hero' | 'variants' | 'inventory'>
  etag: string
  bodyBytes: number
  bodySha256: string
  regionRenderers: Array<{ regionId: string, renderer: 'clone' | 'tailwind', interactionKind: string }>
}
```

Use `R2PutOptions.onlyIf` with the prior state ETag. A null prior ETag uses `new Headers({ 'if-none-match': '*' })`. Treat a null conditional `put()` result as `PublicationConflictError('Publication state changed')`. Cap `history` at ten entries while always retaining the selected and previous published revisions.

`prunePublicationRevisions()` lists only the page's publication revision prefix, deletes complete revision directories older than the retained set, and refuses to delete either `publishedRevision` or `previousPublishedRevision` even when the caller omits them from `retained`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm vitest run src/design/model-page-publication/storage.test.ts && pnpm typecheck`

Expected: PASS with conditional-write, immutable-key, empty-state, malformed-state, and ten-entry retention coverage.

- [ ] **Step 5: Commit the storage slice**

```bash
git add src/design/model-page-publication/types.ts src/design/model-page-publication/storage.ts src/design/model-page-publication/storage.test.ts
git commit -m "feat(publication): add atomic model page revision storage"
```

### Task 2: Mixed Clone/Tailwind Candidate Composer

**Files:**
- Create: `src/design/model-page-publication/composer.ts`
- Test: `src/design/model-page-publication/composer.test.ts`
- Modify: `src/design/production-css-scope.ts`
- Test: `src/design/production-css-scope.test.ts`

**Interfaces:**
- Consumes: saved page JSON, `PublicationRevisionManifest`, clone `section_index`, section `_clone_region_id`/`_clone_region_ids`, `_tailwind_original_html`, `_generated_html`, `_generated_css`, and clone runtime metadata.
- Produces: `composePublicationCandidate(input): Promise<ComposedPublicationCandidate>` with `body`, `referenceBody`, `regions`, `warnings`, `bytes`, `sha256`, and `etag`.

- [ ] **Step 1: Write failing composition tests**

```ts
it('uses Tailwind for converted leaves and clone fallback for unconverted leaves', async () => {
  const result = await composePublicationCandidate({
    pageId: 'nissan-au-ariya',
    page: ariyaMixedDraft(),
    origin: 'https://oem-agent.example.test',
  })
  expect(result.body).toContain('data-oem-published-renderer="tailwind"')
  expect(result.body).toContain('data-oem-region-id="clone-region-7"')
  expect(result.body).toContain('data-oem-published-renderer="clone"')
  expect(result.body).not.toContain('data-oem-region-role="hero"')
})

it('includes the trusted Alpine runtime once for multiple interactive regions', async () => {
  const result = await composePublicationCandidate({ pageId: 'nissan-au-ariya', page: interactiveDraft(), origin })
  expect(result.body.match(/data-oem-alpine-runtime/g)).toHaveLength(1)
})
```

- [ ] **Step 2: Run the tests and verify the missing composer failure**

Run: `pnpm vitest run src/design/model-page-publication/composer.test.ts`

Expected: FAIL because `composePublicationCandidate` is not defined.

- [ ] **Step 3: Implement leaf ordering, renderer selection, and the standalone document**

```ts
export interface ComposedRegion {
  regionId: string
  order: number
  renderer: 'clone' | 'tailwind'
  interactionKind: 'none' | 'accordion' | 'tabs' | 'modal' | 'carousel' | 'slider'
  html: string
  fallbackReason?: string
}

export async function composePublicationCandidate(input: {
  pageId: string
  page: Record<string, any>
  origin: string
}): Promise<ComposedPublicationCandidate>
```

Select structured sections by `_clone_region_id` and `_clone_region_ids`; use `_generated_html` plus scoped `_generated_css` for those slots. Use the saved leaf-region HTML for uncovered slots. Exclude explicit `role: 'hero'`/`data-oem-region-role="hero"`, then apply `stripProductionHeroHtml()` only as the Nissan compatibility fallback. Append manually added structured sections without clone IDs by their `order`.

Wrap every root with `data-oem-region-id`, `data-oem-published-renderer`, and `data-oem-interaction-kind`. Reuse `productionBodyDocument()` logic by extracting its document-shell behavior from `src/routes/oem-agent.ts` into the composer rather than duplicating the resize and interaction scripts.

The document shell inlines only scoped captured CSS and emits this CSP shape with concrete SHA-256 hashes for the trusted Alpine, interaction, and resize scripts:

```text
default-src 'none'; img-src https: data:; media-src https: data: blob:; font-src https: data:; style-src 'unsafe-inline'; script-src 'sha256-...'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action https:
```

Absolutize media and stylesheet asset URLs before composition so the production document does not require a `<base>` element.

- [ ] **Step 4: Run composer and production-scope tests**

Run: `pnpm vitest run src/design/model-page-publication/composer.test.ts src/design/production-css-scope.test.ts`

Expected: PASS for mixed rendering, grouped regions, manual sections, hero exclusion, URL absolutization, scoped leftover CSS, runtime deduplication, and empty-body rejection.

- [ ] **Step 5: Commit the composer slice**

```bash
git add src/design/model-page-publication/composer.ts src/design/model-page-publication/composer.test.ts src/design/production-css-scope.ts src/design/production-css-scope.test.ts
git commit -m "feat(publication): compose mixed model page bodies"
```

### Task 3: Deterministic Candidate Validation

**Files:**
- Create: `src/design/model-page-publication/validator.ts`
- Test: `src/design/model-page-publication/validator.test.ts`
- Create: `src/design/model-page-publication/browser-validator.ts`
- Test: `src/design/model-page-publication/browser-validator.test.ts`

**Interfaces:**
- Consumes: `ComposedPublicationCandidate`, optional `Fetcher` browser binding, source/reference body, viewports `1440x1100`, `1024x900`, and `390x844`.
- Produces: `validatePublicationCandidate(input): Promise<PublicationValidationReport>` and a SHA-256 `validationDigest`.

- [ ] **Step 1: Write failing validation tests**

```ts
it.each(['<script src="https://evil.test/x.js">', '<img onerror="steal()">', '<iframe src="https://evil.test">'])
  ('blocks forbidden markup %s', async forbidden => {
    const report = await validatePublicationCandidate(candidateWith(forbidden), { browser: fakeBrowser() })
    expect(report.publishable).toBe(false)
    expect(report.blocking.some(item => item.code === 'unsafe-markup')).toBe(true)
  })

it('warns from 20 percent visual mismatch and blocks above 35 percent', () => {
  expect(classifyVisualMismatch(0.2)).toBe('warning')
  expect(classifyVisualMismatch(0.3501)).toBe('blocking')
})
```

- [ ] **Step 2: Run tests and verify missing validator modules**

Run: `pnpm vitest run src/design/model-page-publication/validator.test.ts src/design/model-page-publication/browser-validator.test.ts`

Expected: FAIL because validation modules do not exist.

- [ ] **Step 3: Implement static and browser validation**

```ts
export interface PublicationValidationReport {
  publishable: boolean
  blocking: PublicationFinding[]
  warnings: PublicationFinding[]
  viewports: Array<{
    name: 'desktop' | 'tablet' | 'mobile'
    mismatchPercent: number
    horizontalOverflowPx: number
    bodyHeight: number
    consoleErrors: string[]
    failedRequests: string[]
    interactions: Array<{ regionId: string, kind: string, passed: boolean, detail: string }>
    screenshotKey: string
    diffScreenshotKey: string
  }>
  digest: string
}
```

Static validation rejects forbidden nodes/attributes/protocols, missing region IDs, platform-owned regions, bodies over `5_242_880` bytes, and unscoped style blocks. Browser validation uses `page.setContent()`, disables motion, waits for fonts/images, records failed requests and console errors, and evaluates overflow/height. Compare reference and candidate PNGs in a browser canvas using the existing channel-delta algorithm from `scripts/oem-fidelity-report.mjs`; warn at `>= 0.20` mismatch and block at `> 0.35`.

For each declared interaction, click the first enabled trigger and assert a state change: `aria-expanded` for accordions/modals, `aria-selected`/visible panel for tabs, and `data-clone-carousel-index` or slide transform for carousels/sliders. Store source, candidate, and diff screenshots beneath the candidate revision's R2 evidence prefix.

- [ ] **Step 4: Run validator tests and typecheck**

Run: `pnpm vitest run src/design/model-page-publication/validator.test.ts src/design/model-page-publication/browser-validator.test.ts && pnpm typecheck`

Expected: PASS for safety, size, mismatch thresholds, overflow, media failure, finite height, every interaction kind, and browser-unavailable failure behavior.

- [ ] **Step 5: Commit validation**

```bash
git add src/design/model-page-publication/validator.ts src/design/model-page-publication/validator.test.ts src/design/model-page-publication/browser-validator.ts src/design/model-page-publication/browser-validator.test.ts
git commit -m "feat(publication): validate visual and interactive candidates"
```

### Task 4: Candidate, Publish, Rollback, and Webhook Service

**Files:**
- Create: `src/design/model-page-publication/service.ts`
- Test: `src/design/model-page-publication/service.test.ts`
- Modify: `src/auth/audit-log.ts`
- Test: `src/auth/audit-log.test.ts`

**Interfaces:**
- Consumes: storage, composer, validator, page `version`, actor email, registered `page.updated` webhooks.
- Produces: `buildCandidate()`, `publishCandidate()`, `rollbackPublication()`, `getProductionPublication()`, and publication-specific audit metadata.

- [ ] **Step 1: Write failing orchestration tests**

```ts
it('does not move production when candidate validation fails', async () => {
  const result = await service.buildCandidate({ pageId, expectedDraftVersion: 24, actor: 'editor@test' })
  expect(result.status).toBe('failed')
  expect((await service.getState(pageId)).published_revision).toBe(21)
})

it('publishes only the ready candidate matching the saved draft', async () => {
  const candidate = await service.buildCandidate({ pageId, expectedDraftVersion: 24, actor: 'editor@test' })
  const published = await service.publishCandidate({
    pageId,
    revision: candidate.revision,
    expectedDraftVersion: 24,
    validationDigest: candidate.validation.digest,
    actor: 'editor@test',
  })
  expect(published.published_revision).toBe(candidate.revision)
})
```

- [ ] **Step 2: Run the service tests and verify missing exports**

Run: `pnpm vitest run src/design/model-page-publication/service.test.ts`

Expected: FAIL because the service is not implemented.

- [ ] **Step 3: Implement orchestration and publication audit fields**

```ts
export async function buildCandidate(input: {
  bucket: R2Bucket
  browser?: Fetcher
  pageId: string
  page: Record<string, any>
  expectedDraftVersion: number
  actor: string
  origin: string
}): Promise<PublicationCandidateResult>

export async function publishCandidate(input: {
  bucket: R2Bucket
  pageId: string
  revision: number
  expectedDraftVersion: number
  validationDigest: string
  actor: string
}): Promise<PublicationState>

export async function rollbackPublication(input: {
  bucket: R2Bucket
  pageId: string
  targetRevision: number
  actor: string
}): Promise<PublicationState>
```

Allocate the revision under a conditional state update, write body/manifest/validation/evidence, then store candidate status. Publish verifies ready status, digest, current page version, and immutable revision existence before its conditional pointer update. Rollback verifies the target manifest and changes only the pointer. Extend `AuditEntry` with optional `page_id`, `draft_revision`, `candidate_revision`, `published_revision`, and `action`.

Return webhook delivery as `propagation: 'pending' | 'delivered' | 'failed'`; publication success must not be reversed if webhook delivery fails.

- [ ] **Step 4: Run service and audit tests**

Run: `pnpm vitest run src/design/model-page-publication/service.test.ts src/auth/audit-log.test.ts`

Expected: PASS for stale draft `409` semantics, stale ETag, failed validation, publish, rollback, retention, failed webhook, and audit metadata.

- [ ] **Step 5: Commit orchestration**

```bash
git add src/design/model-page-publication/service.ts src/design/model-page-publication/service.test.ts src/auth/audit-log.ts src/auth/audit-log.test.ts
git commit -m "feat(publication): orchestrate publish and rollback"
```

### Task 5: Extend Existing Production Routes and Add Admin Publication Routes

**Files:**
- Modify: `src/routes/oem-agent.ts`
- Modify: `src/routes/oem-agent.test.ts`
- Modify: `src/types.ts`
- Modify: `wrangler.jsonc`

**Interfaces:**
- Consumes: Task 4 service and existing `/production-body-html`, `/production-manifest`, manual-editor auth, `OEM_PAGE_BUCKET`.
- Produces: versioned public body/manifest behavior and four authenticated publication endpoints.

- [ ] **Step 1: Add failing route tests**

```ts
it('serves the selected immutable revision from the existing body endpoint', async () => {
  const response = await request('/pages/nissan-au-ariya/production-body-html?revision=21', envWithPublication(21))
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
  expect(response.headers.get('X-OEM-Published-Revision')).toBe('21')
})

it('keeps legacy clone behavior when publication state is absent', async () => {
  const response = await request('/pages/nissan-au-ariya/production-body-html', legacyEnv())
  expect(response.status).toBe(200)
  expect(response.headers.get('X-OEM-Page-Mode')).toBe('clone')
})
```

- [ ] **Step 2: Run route tests and verify failure against clone-only behavior**

Run: `pnpm vitest run src/routes/oem-agent.test.ts`

Expected: FAIL because revision selection and admin publication routes are absent.

- [ ] **Step 3: Wire routes and page allowlist**

Add:

```text
POST /admin/pages/:pageId/publication/candidate
GET  /admin/pages/:pageId/publication/candidate-html?revision=N
POST /admin/pages/:pageId/publication/publish
POST /admin/pages/:pageId/publication/rollback
GET  /admin/pages/:pageId/publication/history
```

The existing public manifest returns canonical camelCase fields plus legacy aliases:

```ts
{
  pageId,
  revision,
  format: 'composed-html-body',
  bodyUrl,
  platformRegions: ['hero', 'variants', 'inventory'],
  publishedAt,
  etag,
  body_html_url: bodyUrl,
  mode: 'composed',
}
```

When no publication state exists, retain the current clone manifest and unversioned body response exactly. Add `MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS?: string` to `MoltbotEnv`; parse it as a comma-separated allowlist and initially configure `nissan-au-ariya` only in the deployment environment.

- [ ] **Step 4: Run route, protection, index, and type tests**

Run: `pnpm vitest run src/routes/oem-agent.test.ts src/design/model-page-write-protection.test.ts src/index.test.ts && pnpm typecheck`

Expected: PASS for legacy pages, explicit revisions, current published alias, invalid revision, candidate auth, Nissan manual-editor permission, stale draft, publish, history, and rollback.

- [ ] **Step 5: Commit API wiring**

```bash
git add src/routes/oem-agent.ts src/routes/oem-agent.test.ts src/types.ts wrangler.jsonc
git commit -m "feat(publication): expose revisioned model page APIs"
```

### Task 6: Dashboard Publication API and State Machine

**Files:**
- Create: `dashboard/src/lib/model-page-publication.ts`
- Modify: `dashboard/src/lib/worker-api.ts`
- Modify: `dashboard/src/lib/worker-api.test.ts`
- Create: `dashboard/src/composables/use-model-page-publication.ts`
- Test: `dashboard/src/composables/use-model-page-publication.test.ts`

**Interfaces:**
- Consumes: Task 5 endpoints, `pageId`, saved draft version.
- Produces: `useModelPagePublication()` with `status`, `candidate`, `history`, `candidatePreviewUrl`, `buildCandidate()`, `publish()`, `rollback()`, `refresh()`, and `markDraftChanged()`.

- [ ] **Step 1: Write failing API/state tests**

```ts
it('marks a ready candidate stale when the saved draft version changes', async () => {
  const publication = useModelPagePublication({ pageId: ref('nissan-au-ariya'), draftVersion: ref(24) })
  await publication.refresh()
  expect(publication.canPublish.value).toBe(true)
  publication.markDraftChanged(25)
  expect(publication.canPublish.value).toBe(false)
  expect(publication.statusLabel.value).toContain('Candidate required')
})
```

- [ ] **Step 2: Run dashboard tests and verify missing composable**

Run: `cd dashboard && pnpm test src/composables/use-model-page-publication.test.ts src/lib/worker-api.test.ts`

Expected: FAIL because the publication client and composable do not exist.

- [ ] **Step 3: Implement typed calls and blob candidate preview**

```ts
export function useModelPagePublication(input: {
  pageId: Ref<string | null>
  draftVersion: Ref<number | null>
}) {
  const canPublish = computed(() =>
    state.value?.candidate?.status === 'ready' &&
    state.value.candidate.draft_version === input.draftVersion.value,
  )
  const refresh = async () => { state.value = await fetchPublicationState(input.pageId.value!) }
  const markDraftChanged = (version: number) => {
    if (state.value?.candidate?.draft_version !== version) candidateIsStale.value = true
  }
  onScopeDispose(() => {
    if (candidatePreviewUrl.value) URL.revokeObjectURL(candidatePreviewUrl.value)
  })
  return { state, history, canPublish, candidatePreviewUrl, statusLabel, refresh, buildCandidate, publish, rollback, markDraftChanged }
}
```

Add a `workerTextFetch()` helper that reuses `buildWorkerHeaders()`, fetches candidate HTML with credentials, creates a `Blob(['text/html'])`, and revokes the prior object URL before replacement.

- [ ] **Step 4: Run dashboard tests**

Run: `cd dashboard && pnpm test src/composables/use-model-page-publication.test.ts src/lib/worker-api.test.ts`

Expected: PASS for refresh, stale candidate, failed validation, blob cleanup, publish gating, rollback, and HTTP error messages.

- [ ] **Step 5: Commit the dashboard state slice**

```bash
git add dashboard/src/lib/model-page-publication.ts dashboard/src/lib/worker-api.ts dashboard/src/lib/worker-api.test.ts dashboard/src/composables/use-model-page-publication.ts dashboard/src/composables/use-model-page-publication.test.ts
git commit -m "feat(dashboard): add model page publication state"
```

### Task 7: Dashboard Save Draft, Preview Candidate, Publish, and Rollback UI

**Files:**
- Create: `dashboard/src/pages/dashboard/components/page-builder/PublicationControls.vue`
- Test: `dashboard/src/pages/dashboard/components/page-builder/publication-controls.test.ts`
- Modify: `dashboard/src/pages/preview/[slug].vue`
- Modify: `dashboard/src/pages/dashboard/page-builder/[slug].vue`
- Modify: `dashboard/src/pages/preview/preview-tailwind-toolbar.test.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`

**Interfaces:**
- Consumes: Task 6 composable; existing `savePreview()`, `saveClone()`, `saveSections()`, and preview iframe.
- Produces: explicit draft/production labels, candidate preview mode, publish dialog, validation summary, history, and rollback action.

- [ ] **Step 1: Write failing UI source/component tests**

```ts
it('keeps Save Draft separate from candidate and publish actions', () => {
  expect(source).toContain('Save Draft')
  expect(source).toContain('@build-candidate')
  expect(source).toContain('@publish')
  expect(source).not.toContain('await publication.publish()\n  await savePreview()')
})

it('shows both draft and production revisions', () => {
  expect(rendered.text()).toContain('Draft 24 saved')
  expect(rendered.text()).toContain('Production 21')
})
```

- [ ] **Step 2: Run focused dashboard tests and verify failures**

Run: `cd dashboard && pnpm test src/pages/dashboard/components/page-builder/publication-controls.test.ts src/pages/preview/preview-tailwind-toolbar.test.ts src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`

Expected: FAIL because controls and copy are absent.

- [ ] **Step 3: Implement the reusable controls and candidate preview mode**

Use `PublicationControls.vue` props/events:

```ts
defineProps<{
  draftVersion: number | null
  publishedRevision: number | null
  candidateStatus: 'none' | 'building' | 'ready' | 'failed' | 'stale'
  canBuild: boolean
  canPublish: boolean
  validation: PublicationValidationSummary | null
  history: PublicationHistoryEntry[]
}>()

defineEmits<{
  buildCandidate: []
  publish: []
  rollback: [revision: number]
  previewCandidate: []
}>()
```

Rename the existing toolbar action to `Save Draft`. After `saveClone()` or `saveSections()` succeeds, call `publication.markDraftChanged(page.version)` and refresh state. Add `candidate` to `PreviewView`; its iframe uses the authenticated blob URL and the same responsive frame controls. Publish requires a confirmation dialog naming candidate and production revisions. Rollback requires a separate confirmation and never calls a rebuild.

- [ ] **Step 4: Run lint, tests, and dashboard build**

Run: `cd dashboard && pnpm lint:fix && pnpm test && pnpm build`

Expected: PASS with no Vue template, TypeScript, or lint errors.

- [ ] **Step 5: Commit dashboard UI**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/PublicationControls.vue dashboard/src/pages/dashboard/components/page-builder/publication-controls.test.ts dashboard/src/pages/preview/[slug].vue dashboard/src/pages/dashboard/page-builder/[slug].vue dashboard/src/pages/preview/preview-tailwind-toolbar.test.ts dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
git commit -m "feat(dashboard): add draft and publication controls"
```

### Task 8: Dealer Manifest Resolver with Last-Known-Good Fallback

**Files:**
- Create: `server/utils/oem-model-page-manifest.ts`
- Test: `test/unit/server/utils/oem-model-page-manifest.test.ts`
- Modify: `server/api/vehicles/by-slug/[slug].get.ts`
- Modify: `test/unit/server/api/nissan-model-page.test.ts`

**Interfaces:**
- Consumes: OEM Agent `production-manifest`, Nitro `useStorage('cache')`, existing direct body URL.
- Produces: `resolveOemModelPageManifest({ baseUrl, pageId }): Promise<ResolvedModelPageManifest>` and `clearOemModelPageManifest(pageId)`.

- [ ] **Step 1: Write failing resolver and by-slug tests**

```ts
it('returns the manifest revisioned body URL', async () => {
  $fetch.mockResolvedValue({ pageId, revision: 21, format: 'composed-html-body', bodyUrl: `${base}/production-body-html?revision=21` })
  await expect(resolveOemModelPageManifest({ baseUrl: base, pageId })).resolves.toMatchObject({
    source: 'live',
    revision: 21,
    bodyUrl: `${base}/production-body-html?revision=21`,
  })
})

it('uses the stored manifest when OEM Agent is temporarily unavailable', async () => {
  storage.setItem(cacheKey, manifest21)
  $fetch.mockRejectedValue(new Error('upstream unavailable'))
  await expect(resolveOemModelPageManifest({ baseUrl: base, pageId })).resolves.toMatchObject({ source: 'last-known-good', revision: 21 })
})
```

- [ ] **Step 2: Run focused dealer tests and verify missing utility failure**

Run: `pnpm test test/unit/server/utils/oem-model-page-manifest.test.ts test/unit/server/api/nissan-model-page.test.ts`

Expected: FAIL because the manifest resolver is absent and by-slug still constructs an unversioned URL.

- [ ] **Step 3: Implement resolver and integrate by-slug**

```ts
export interface ResolvedModelPageManifest {
  source: 'live' | 'last-known-good' | 'legacy'
  pageId: string
  revision: number | null
  format: 'composed-html-body' | 'clone-body'
  bodyUrl: string
}
```

Validate same-origin-with-base URL, exact page ID, positive integer revision for composed manifests, and allowed format. Store the last live manifest under `oem-model-manifest:${pageId}`. If live fetch and stored data both fail, return the current unversioned `/production-body-html` URL with `source: 'legacy'`.

When `hero-html-body` is configured, fetch raw page, manifest, and colors concurrently. Add `bodyRevision?: number` and `bodySource?: 'live' | 'last-known-good' | 'legacy'` to `VehicleModel.rendering`.

- [ ] **Step 4: Run dealer unit tests and typecheck**

Run: `pnpm test test/unit/server/utils/oem-model-page-manifest.test.ts test/unit/server/api/nissan-model-page.test.ts && pnpm typecheck`

Expected: PASS for live, alias-field compatibility, malicious body URL rejection, last-known-good, legacy fallback, and revision mapping.

- [ ] **Step 5: Commit dealer manifest integration**

```bash
git add server/utils/oem-model-page-manifest.ts test/unit/server/utils/oem-model-page-manifest.test.ts server/api/vehicles/by-slug/[slug].get.ts test/unit/server/api/nissan-model-page.test.ts
git commit -m "feat(models): consume versioned OEM publication manifests"
```

### Task 9: Harden Dealer Embed and Purge Manifest State

**Files:**
- Modify: `pages/models/[slug].vue`
- Create: `test/unit/pages/nissan-model-page-embed.test.ts`
- Modify: `server/api/webhooks/purge-model-cache.post.ts`
- Create: `test/unit/server/api/purge-model-cache.test.ts`

**Interfaces:**
- Consumes: revision-aware rendering object and `clearOemModelPageManifest()`.
- Produces: production iframe without same-origin privilege, revision-aware resize validation, and webhook eviction.

- [ ] **Step 1: Write failing embed and purge tests**

```ts
it('does not grant allow-same-origin to the production body iframe', () => {
  expect(source).toContain('sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts"')
  expect(source).not.toContain('allow-same-origin')
})

it('clears the last-known manifest when a model-page webhook arrives', async () => {
  await handler(webhookEvent({ oem_code: 'nissan-au', model_slug: 'ariya' }))
  expect(clearOemModelPageManifest).toHaveBeenCalledWith('nissan-au-ariya')
})
```

- [ ] **Step 2: Run focused tests and verify current sandbox/cache failures**

Run: `pnpm test test/unit/pages/nissan-model-page-embed.test.ts test/unit/server/api/purge-model-cache.test.ts`

Expected: FAIL because the iframe currently includes `allow-same-origin` and the webhook does not clear manifest storage.

- [ ] **Step 3: Harden the page and webhook**

Remove `allow-same-origin`. Include `revision` in the resize message emitted by the published artifact and require it to equal `vehicleData.rendering.bodyRevision` when non-null. Reset `publishedBodyHeight` to `800` whenever `publishedBodyUrl` changes so a previous revision's height cannot flash.

In the webhook, call:

```ts
await Promise.all([
  purge({ tags, reason, event: feedEvent }),
  clearOemModelPageManifest(`${body.oem_code}-${body.model_slug}`),
])
```

- [ ] **Step 4: Run dealer tests and typecheck**

Run: `pnpm test test/unit/pages/nissan-model-page-embed.test.ts test/unit/server/api/purge-model-cache.test.ts test/unit/server/api/nissan-model-page.test.ts && pnpm typecheck`

Expected: PASS for sandbox, origin/source/revision checks, height reset, manifest eviction, and existing cache tags.

- [ ] **Step 5: Commit embed hardening**

```bash
git add pages/models/[slug].vue test/unit/pages/nissan-model-page-embed.test.ts server/api/webhooks/purge-model-cache.post.ts test/unit/server/api/purge-model-cache.test.ts
git commit -m "fix(models): harden revisioned OEM body embeds"
```

### Task 10: Publication Battle-Test Harness

**Files:**
- Create: `scripts/model-page-publication-battle-test.mjs`
- Create: `scripts/model-page-publication-battle-test.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: editor URL, Worker URL, dealer URL, page ID, optional authenticated publish/rollback flags.
- Produces: JSON/Markdown evidence under `artifacts/model-page-publication/$OEM_PUBLICATION_RUN_ID/` and non-zero exit status for blocking findings.

- [ ] **Step 1: Write failing CLI argument/report tests**

```ts
it('defaults to a read-only ARIYA comparison', () => {
  expect(parsePublicationArgs([])).toMatchObject({
    pageId: 'nissan-au-ariya',
    mutate: false,
    viewports: ['desktop', 'tablet', 'mobile'],
  })
})

it('requires both confirmation flags before publish or rollback', () => {
  expect(() => parsePublicationArgs(['--publish'])).toThrow('requires --mutate and --confirm-production')
})
```

- [ ] **Step 2: Run the script tests and verify missing module**

Run: `pnpm vitest run scripts/model-page-publication-battle-test.test.ts`

Expected: FAIL because the battle-test module does not exist.

- [ ] **Step 3: Implement read-only and explicitly mutating scenarios**

At process start, derive the artifact directory deterministically:

```js
const runId = process.env.OEM_PUBLICATION_RUN_ID || `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}Z`
```

The default command captures:

```text
editor candidate iframe
direct candidate or published body
Northern Nissan live model page
desktop 1440x1100
tablet 1024x900
mobile 390x844
```

Record response URLs/status/cache headers, body revision, screenshots, pixel diffs, region renderer map, failed assets, console/CSP errors, overflow, iframe height, accordion/tab/modal/carousel/slider results, variant count, and inventory-card count. Mutating mode requires both `--mutate` and `--confirm-production`, saves the starting revision, publishes the candidate, verifies the versioned live URL, rolls back to the starting revision, and verifies restoration in a `finally` block.

Add:

```json
"qa:publication": "node scripts/model-page-publication-battle-test.mjs"
```

- [ ] **Step 4: Run tests and a read-only local fixture pass**

Run: `pnpm vitest run scripts/model-page-publication-battle-test.test.ts && pnpm qa:publication -- --worker-base http://127.0.0.1:8787 --dashboard-base http://127.0.0.1:4173 --dealer-base http://127.0.0.1:3000 --json`

Expected: unit tests PASS; the fixture/local run emits `report.json`, `report.md`, three viewport screenshot sets, and exits zero when no blocking finding exists.

- [ ] **Step 5: Commit the QA harness**

```bash
git add scripts/model-page-publication-battle-test.mjs scripts/model-page-publication-battle-test.test.ts package.json
git commit -m "test(publication): add model page battle testing"
```

### Task 11: Full Verification, PRs, Staging Pilot, and Production Gate

**Files:**
- Modify only files identified by failing verification from Tasks 1-10.
- Evidence: `artifacts/model-page-publication/$OEM_PUBLICATION_RUN_ID/report.json`
- Evidence: `artifacts/model-page-publication/$OEM_PUBLICATION_RUN_ID/report.md`

**Interfaces:**
- Consumes: both completed branches and deployed preview URLs.
- Produces: reviewed OEM Agent PR, reviewed dealer-platform PR, staging ARIYA evidence, rollback proof, and a separate production approval checkpoint.

- [ ] **Step 1: Run complete OEM Agent verification**

Run:

```bash
pnpm vitest run
pnpm typecheck
pnpm test:dashboard
cd dashboard && pnpm lint:fix && pnpm test && pnpm build
```

Expected: all suites, typechecks, lint, and dashboard build PASS. Re-run `git diff --check` afterward because `lint:fix` may change files.

- [ ] **Step 2: Run complete dealer verification**

Run:

```bash
pnpm test test/unit/server/utils/oem-model-page-manifest.test.ts test/unit/server/api/nissan-model-page.test.ts test/unit/pages/nissan-model-page-embed.test.ts test/unit/server/api/purge-model-cache.test.ts
pnpm typecheck
```

Expected: all focused tests and typecheck PASS. Ask for explicit approval before running the repository's production build command, then verify `dist/_worker.js/` remains below `25 MB`.

- [ ] **Step 3: Create and review two scoped PRs**

Create one OEM Agent PR containing Tasks 1-7 and 10, and one dealer-platform PR containing Tasks 8-9. Each PR description includes the design link, exact test commands, manual testing notes, feature-flag state, cache behavior, and rollback command/path. Do not merge either PR until both pass CI and review.

Run in each clean feature branch:

```bash
gh pr create --title "feat: add versioned model page publishing" --body-file /tmp/oem-publication-pr.md
gh pr checks --watch
```

- [ ] **Step 4: Deploy previews and run a non-production ARIYA pilot**

Enable `MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS=nissan-au-ariya` only on the OEM Agent preview/staging Worker. Deploy the dashboard and dealer preview, build candidate revision from the saved ARIYA draft, and run:

```bash
export OEM_PUBLICATION_WORKER_URL="https://oem-agent-publication-preview.adme-dev.workers.dev"
export OEM_PUBLICATION_DASHBOARD_URL="https://oem-dashboard-publication-preview.pages.dev"
export OEM_PUBLICATION_DEALER_URL="https://model-page-publication-preview.pages.dev"
export OEM_PUBLICATION_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
pnpm qa:publication -- \
  --page-id nissan-au-ariya \
  --worker-base "$OEM_PUBLICATION_WORKER_URL" \
  --dashboard-base "$OEM_PUBLICATION_DASHBOARD_URL" \
  --dealer-base "$OEM_PUBLICATION_DEALER_URL" \
  --json
```

Expected: zero blocking findings, variants and inventory remain present, all declared interactions pass, and the report names one consistent candidate revision.

- [ ] **Step 5: Exercise preview publish and rollback, then request production approval**

Run the harness against preview with `--mutate --confirm-production`. Expected sequence:

1. starting published revision recorded;
2. candidate published;
3. dealer preview requests the exact URL in the candidate manifest, such as `production-body-html?revision=22`;
4. platform hero, variants, and inventory remain present;
5. rollback selects the starting revision;
6. dealer preview requests the original versioned URL again.

Attach `report.json` and `report.md` to both PRs. Stop and request explicit approval before merging/deploying production or publishing the ARIYA production revision.

---

## Plan Self-Review

- Every design requirement maps to a task: storage and rollback (Tasks 1/4), mixed composition (Task 2), validation and AI boundary (Task 3), APIs and compatibility (Task 5), editor workflow (Tasks 6/7), dealer integration and cache behavior (Tasks 8/9), observability/evidence (Tasks 4/10), and rollout (Task 11).
- Canonical types and method names are introduced before downstream tasks consume them.
- Existing production routes are extended rather than duplicated.
- Legacy clone pages remain supported and the feature is page-allowlisted for the ARIYA pilot.
- The plan contains no incomplete implementation instructions.
- Production mutation and deployment remain explicit approval gates.
