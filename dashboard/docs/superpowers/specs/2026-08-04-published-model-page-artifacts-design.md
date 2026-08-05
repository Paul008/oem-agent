# Published Model Page Artifacts Design

**Date:** 2026-08-04

**Status:** Approved for implementation planning

**Pilot:** `nissan-au-ariya` on Northern Nissan

## Context

OEM Agent currently keeps two representations of a model page:

- clone HTML, which is the high-fidelity editable capture; and
- structured sections, which are editable Tailwind-oriented recipes.

The standalone editor can convert a selected clone region in place or convert a page into structured sections. These actions have different persistence paths. The Northern Nissan model page consumes `/production-body-html`, which intentionally renders clone HTML and ignores structured sections. Consequently, a successful whole-page Tailwind conversion can be saved without ever appearing on the dealer site.

The live dealer page also owns content that must not be replaced by the imported OEM body:

- the hero;
- model variants; and
- related vehicle inventory.

Publishing must preserve that ownership boundary while allowing clone and Tailwind regions to coexist safely.

## Decision

Introduce an explicit, versioned publication workflow:

1. **Save Draft** persists editor state without affecting production.
2. **Preview Candidate** renders the exact standalone body artifact that would be embedded by the dealer site.
3. **Publish** validates and stores an immutable artifact, then atomically advances a published-revision pointer.
4. **Rollback** atomically moves the pointer to a previously published revision.

Production does not follow `active_mode`. It follows only the explicit published revision.

The published artifact is composed per region. A page may contain both:

- converted Tailwind regions; and
- sanitized clone regions retained as fallbacks.

This avoids making complete Tailwind conversion a prerequisite for publication and prevents one unsupported carousel, modal, accordion, or tab set from blocking the rest of the page.

## Goals

- Make editor publication behavior explicit and predictable.
- Allow selected and whole-page Tailwind conversions to reach dealer sites.
- Keep drafts isolated from production.
- Preserve the dealer platform's hero, variants, and inventory.
- Support mixed clone/Tailwind bodies during migration.
- Preserve interactive behavior using trusted runtimes.
- Make every publication immediately cache-addressable and reversible.
- Provide enough evidence to distinguish conversion, persistence, publication, ingestion, and cache failures.

## Non-Goals

- Do not automatically publish when a user converts or saves a draft.
- Do not make `active_mode` the production selector.
- Do not require every region to be converted before publication.
- Do not allow AI output to bypass deterministic safety and rendering checks.
- Do not move Nissan variants or vehicle inventory into OEM Agent.
- Do not inject the original OEM site's untrusted scripts into the dealer application.
- Do not replace the existing clone production path for pages without a published revision.

## Terminology

- **Draft:** Mutable editor state containing clone HTML, structured sections, conversion metadata, and region ordering.
- **Candidate:** A generated but unpublished body artifact built from the current draft.
- **Published revision:** An immutable candidate that passed validation and is selected by the publication pointer.
- **Region renderer:** The production implementation chosen for a region: `clone` or `tailwind`.
- **Composed body:** The standalone HTML document containing all body regions except platform-owned regions.
- **Manifest:** The production contract consumed by a dealer platform.

## Architecture

### 1. Draft model

The existing page document remains the editor source of truth. Add publication metadata without changing the meaning of `active_mode`:

```ts
interface ModelPagePublicationState {
  draft_revision: number
  published_revision: number | null
  published_at: string | null
  published_by: string | null
  published_format: 'clone-body' | 'composed-html-body' | null
  candidate_status: 'none' | 'building' | 'ready' | 'failed'
  candidate_revision: number | null
  candidate_validation: PublicationValidationSummary | null
}
```

Each editable region has an explicit production choice:

```ts
interface PublishedRegionChoice {
  region_id: string
  order: number
  renderer: 'clone' | 'tailwind'
  clone_html?: string
  section_id?: string
  interaction_kind?: 'none' | 'accordion' | 'tabs' | 'modal' | 'carousel' | 'slider'
  fallback_reason?: string
}
```

Conversion changes a region's draft implementation. It does not alter `published_revision`.

### 2. Immutable artifact storage

Store publication data in R2 beside the existing page document:

```text
model-pages/{pageId}/publication/state.json
model-pages/{pageId}/publication/revisions/{revision}/manifest.json
model-pages/{pageId}/publication/revisions/{revision}/body.html
model-pages/{pageId}/publication/revisions/{revision}/validation.json
```

`state.json` is the only mutable publication object. Revision directories are immutable. A successful publish writes the complete revision first, then updates `state.json` last. Readers therefore see either the old complete revision or the new complete revision, never a partial publication.

Keep at least the latest ten published revisions per page. Retention cleanup must never remove the currently published revision or the immediately preceding revision.

### 3. Candidate composer

The composer receives the saved draft and produces one standalone HTML body:

1. Resolve the ordered editable regions.
2. Exclude platform-owned regions using explicit role metadata, with Nissan's existing hero/body boundary as the compatibility fallback.
3. Render converted regions from their generated Tailwind section HTML.
4. Render unconverted or failed regions from sanitized clone HTML.
5. Scope region-level leftover CSS to its stable region root.
6. Deduplicate fonts, media preloads, and shared styles.
7. Add the trusted Alpine CSP runtime once when any region requires it.
8. Stamp each region with its stable ID, renderer, and interaction kind.
9. Produce the candidate manifest and validation input.

The composer must not concatenate complete HTML documents. It extracts and composes region roots into one controlled document shell.

### 4. Interactive regions

Interactive behavior uses trusted interactive islands:

- accordions;
- tabs;
- modals;
- carousels; and
- sliders.

The converter may use AI to classify a region and propose Tailwind/Alpine markup. The compiler then maps the result to an allowed interaction kind and trusted runtime contract. Inline OEM scripts, event-handler attributes, `javascript:` URLs, nested frames, objects, embeds, and unapproved external scripts remain forbidden.

If a converted interaction cannot pass its functional checks, candidate generation falls back that region to the sanitized clone implementation when the clone implementation is safe and functional. The validation report records the fallback. If neither implementation is valid, candidate generation fails and publishing remains unavailable.

### 5. Production manifest

Add a public endpoint:

```text
GET /api/v1/oem-agent/pages/:pageId/production-manifest
```

Successful response:

```json
{
  "pageId": "nissan-au-ariya",
  "revision": 21,
  "format": "composed-html-body",
  "bodyUrl": "https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/nissan-au-ariya/production-body-html?revision=21",
  "hero": {
    "source": "platform"
  },
  "platformRegions": ["hero", "variants", "inventory"],
  "publishedAt": "2026-08-04T02:00:00.000Z",
  "etag": "publication-nissan-au-ariya-21"
}
```

The existing endpoints remain compatible:

- `/production-body-html?revision=N` serves exactly revision `N`.
- `/production-body-html` serves the current published revision when one exists.
- Pages without a publication state continue using the current clone-body behavior.
- `/production-html` retains its current full-clone compatibility behavior until separately migrated.

Revisioned body responses are immutable and may use a long cache lifetime. The unversioned manifest and body alias use short revalidation and support conditional requests.

### 6. Publication API

Add authenticated manual-editor endpoints:

```text
POST /api/v1/oem-agent/admin/pages/:pageId/publication/candidate
POST /api/v1/oem-agent/admin/pages/:pageId/publication/publish
POST /api/v1/oem-agent/admin/pages/:pageId/publication/rollback
GET  /api/v1/oem-agent/admin/pages/:pageId/publication/history
```

Candidate creation accepts the expected draft revision. It fails with `409` when the saved draft has moved, preventing a stale browser tab from publishing over a newer edit.

Publish accepts the candidate revision and its validation digest. It fails when:

- the candidate is not ready;
- validation contains a blocking failure;
- the candidate does not match the current saved draft revision; or
- another publication advanced the pointer first.

Rollback accepts an existing published revision and creates an audit event before moving the pointer. Rollback does not rebuild the artifact.

All mutation endpoints use the existing manual-editor authentication and protection policy. Nissan's automated ingestion protection must not block authenticated manual publication, while unauthenticated and ingestion-origin writes remain blocked.

### 7. Editor workflow

Replace ambiguous save/conversion feedback with distinct state:

- **Convert selected:** changes only the selected draft region.
- **Convert page:** creates converted region drafts and records skipped/fallback regions.
- **Save Draft:** persists the current draft and displays its draft revision.
- **Preview Candidate:** builds or rebuilds the composed artifact and opens the exact body response in candidate mode.
- **Publish:** enabled only for a ready candidate matching the saved draft.
- **Rollback:** opens publication history and confirms the target revision.

The editor header displays both states, for example:

```text
Draft 24 saved · Production 21 · Candidate required
```

After any saved edit, the previous candidate becomes stale and Publish is disabled until the user rebuilds the candidate.

Conversion notices must explicitly say either:

- `Converted in draft — Save Draft to persist`; or
- `Draft saved — Preview Candidate before publishing`.

### 8. Dealer-platform integration

The dealer `by-slug` endpoint reads the OEM Agent production manifest. For `composed-html-body`, it returns a versioned `bodyUrl` and retains:

```ts
rendering: {
  format: 'hero-html-body',
  showPlatformVariants: true,
  bodyUrl: manifest.bodyUrl,
  bodyRevision: manifest.revision,
}
```

The model page continues rendering in this order:

1. platform hero;
2. imported composed body;
3. platform variants; and
4. related inventory.

The body iframe receives a constrained width of `100%` and derives height from the existing trusted resize bridge. The imported document cannot apply styles to the dealer shell.

If the manifest is temporarily unavailable, the dealer endpoint uses its last known good manifest. It must not switch to an unpublished draft. If no last known good manifest exists, it uses the existing clone-body URL.

### 9. Cache invalidation

Publication uses versioned body URLs as the primary cache-busting mechanism. A successful publish or rollback also sends the existing signed model-page webhook to the dealer platform.

The dealer webhook clears:

- the model `by-slug` server cache;
- the model page response cache; and
- any stored last-known manifest entry for that page.

Because the body URL contains the revision, a newly rendered dealer page cannot reuse the prior iframe body even if the old immutable revision remains cached.

### 10. Validation

Candidate validation produces blocking failures, warnings, and evidence.

Blocking checks:

- candidate HTML parses successfully;
- no forbidden script, frame, embed, handler, or unsafe URL survives sanitization;
- every required media asset loads;
- no region has uncontrolled viewport overflow;
- every declared interaction passes its functional scenario;
- the body resize bridge reports a finite height;
- desktop, tablet, and mobile render without page-level clipping;
- platform-owned hero, variants, and inventory are absent from the imported body;
- the artifact stays under the configured HTML/CSS size limit.

Warning checks:

- visual difference exceeds the preferred threshold but remains under the blocking threshold;
- a converted region used clone fallback;
- a font used a permitted fallback;
- non-critical media loaded after the readiness deadline.

Visual evidence includes screenshots at 1440, 1024, and 390 CSS pixels, layout measurements, console errors, failed requests, interaction results, and a per-region renderer map.

AI can explain a validation failure and propose a new draft conversion. AI cannot mark a failed candidate as publishable.

### 11. Security

- Sanitize every clone fallback and generated Tailwind region at candidate build time, even if it was sanitized earlier.
- Permit only the trusted Alpine CSP runtime and the existing resize bridge.
- Use a restrictive CSP for candidate and production body documents.
- Do not use `allow-same-origin` for production embeds.
- Validate media protocols and reject credential-bearing URLs.
- Require authentication, expected revisions, and audit metadata for publication mutations.
- Escape publication metadata before embedding it in HTML attributes.
- Keep immutable artifacts content-addressable or revision-addressable so a later draft cannot mutate a published response.

### 12. Observability and audit

Record these events:

- candidate build started, succeeded, or failed;
- validation check results and durations;
- publish and rollback actor, page, draft revision, candidate revision, and published revision;
- dealer webhook delivery and response;
- manifest and body requests by revision;
- dealer fallback to last-known-good or legacy clone behavior.

The dashboard publication history shows revision, actor, date, format, validation summary, fallback-region count, and rollback eligibility.

## Failure Handling

- Candidate build failure leaves production untouched.
- Validation failure leaves production untouched and keeps evidence attached to the failed candidate.
- Publish pointer conflict returns `409` and prompts the editor to refresh.
- R2 revision write failure occurs before pointer mutation and cannot create a visible partial release.
- Dealer webhook failure marks publication as `published, propagation pending`; versioned artifacts remain valid and the webhook can be retried.
- Manifest outage uses the dealer's last known good manifest.
- Broken new production can be rolled back without recompilation.

## Testing Strategy

### Worker unit tests

- publication state parsing and legacy-page defaults;
- region ordering and clone/Tailwind selection;
- platform-region exclusion;
- sanitizer and CSP construction;
- interaction-runtime deduplication;
- immutable revision resolution;
- expected-revision conflict handling;
- publish and rollback pointer changes;
- legacy `/production-body-html` fallback.

### Dashboard tests

- conversion marks only the draft dirty;
- Save Draft does not call Publish;
- candidate staleness after a saved edit;
- Publish gating from validation state;
- publication history and rollback confirmation;
- clear feedback for draft, candidate, and production revisions.

### Dealer-platform tests

- `by-slug` maps `production-manifest` into `hero-html-body` rendering;
- versioned `bodyUrl` changes when the revision changes;
- platform variants and inventory remain enabled;
- last-known-good behavior on manifest failure;
- webhook purges model-page caches.

### Browser battle tests

For the Nissan ARIYA pilot:

- compare editor candidate, direct body artifact, and Northern Nissan live output at desktop, tablet, and mobile widths;
- verify accordion expansion;
- verify tabs and sliders where present;
- verify modal open, focus containment, Escape close, and return focus where present;
- verify carousel controls and finite boundaries where present;
- verify no broken media, console errors, CSP violations, or uncontrolled horizontal overflow;
- verify variants and related inventory appear after the imported body;
- publish a new revision and prove the live page requests its versioned URL;
- roll back and prove the former revision is restored.

## Rollout

1. Add publication types, R2 storage helpers, and legacy defaults.
2. Add candidate composer and deterministic validation.
3. Add publication endpoints and audit events.
4. Add dashboard draft/candidate/publish/rollback controls.
5. Add the production manifest and revisioned body serving.
6. Update the dealer `by-slug` integration to consume the manifest.
7. Deploy behind a per-page publication feature flag.
8. Build and validate an ARIYA candidate without changing production.
9. Publish ARIYA, verify the Northern Nissan page, then exercise rollback.
10. Enable the workflow for additional Nissan pages after the pilot passes.

## Compatibility and Migration

- Existing pages need no migration before deployment.
- A missing publication state means `legacy clone production`.
- Existing saved clone HTML remains the first fallback.
- Existing structured sections remain drafts until explicitly published.
- The dealer platform can consume the old body URL until its manifest integration deploys.
- The ARIYA pilot must retain its current clone artifact as rollback revision zero or an equivalent legacy reference.

## Acceptance Criteria

- Saving a converted page cannot change the live dealer page.
- Publishing a validated selected-region conversion changes the live body artifact.
- Publishing a whole-page conversion changes the live body artifact while permitting per-region clone fallback.
- The live page retains the platform hero, variants, and inventory.
- A new publication is visible through a new revisioned body URL without waiting for the old five-minute iframe cache.
- Interactive regions pass their declared functional checks.
- A failed candidate cannot advance production.
- Rollback restores the prior artifact without rebuilding it.
- Editor, Worker, and dealer logs identify the same page and revision.

## Rejected Alternatives

### Serve `active_mode`

Rejected because editor navigation or draft conversion could silently change production. It also provides no immutable rollback target.

### Configure clone versus Tailwind independently in the dealer admin

Rejected because publication state would be split across two platforms and could drift. Dealer configuration should identify the source page and integration format, not choose an unpublished editor draft.

### Require complete Tailwind conversion

Rejected because one unsupported interactive section would block useful conversions elsewhere and encourage unsafe forced conversions.

### Publish AI output directly

Rejected because model output is non-deterministic and cannot be trusted to preserve security, responsive fidelity, or interaction behavior without validation.

## Self-Review

- The design separates draft persistence from production publication.
- Production selection is explicit, versioned, atomic, and reversible.
- The dealer/OEM ownership boundary is unambiguous.
- Mixed clone/Tailwind publication covers unsupported interactive edge cases.
- Cache invalidation does not depend solely on a purge succeeding.
- Legacy pages retain their existing behavior.
- No placeholder requirements or unresolved production decisions remain.
