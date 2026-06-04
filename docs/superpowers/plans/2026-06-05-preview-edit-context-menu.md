# Preview Edit Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable right-click editing in the standalone preview route and persist preview edits through existing page-builder save APIs.

**Architecture:** Keep `PageBuilderCanvas.vue` as the single edit surface. The preview route becomes a thin editable host that wires canvas events into `usePageBuilder()` and preserves write protection with `isModelPageWriteProtected()`.

**Tech Stack:** Vue 3 SFCs, TypeScript, Vitest source-regression tests, existing dashboard UI components and `usePageBuilder()`.

---

## File Structure

- Modify `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`: add failing source-regression tests for editable preview wiring.
- Modify `dashboard/src/pages/preview/[slug].vue`: add preview save/edit handlers, write-protection guard, floating save bar, and structured section dialog.

## Task 1: Add Regression Tests

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`

- [x] **Step 1: Write the failing tests**

Add tests that read `dashboard/src/pages/preview/[slug].vue` and assert:

```ts
const previewSource = readFileSync(new URL('../../../preview/[slug].vue', import.meta.url), 'utf8')

expect(previewSource).toContain('isModelPageWriteProtected')
expect(previewSource).toContain(':read-only="isWriteProtectedPage"')
expect(previewSource).toContain(':allow-same-origin-sandbox="isWriteProtectedPage"')
expect(previewSource).not.toContain(':read-only="true"')
expect(previewSource).not.toContain(':allow-same-origin-sandbox="true"')
expect(previewSource).toContain('@update-field="onUpdateField"')
expect(previewSource).toContain('@clone-dom-updated="onCloneDomUpdated"')
expect(previewSource).toContain('@clone-region-added="onCloneRegionAdded"')
expect(previewSource).toContain('@region-action="onRegionAction"')
expect(previewSource).toContain('saveClone(cloneDraftHtml.value ?? cloneHtml.value, cloneRegionsForSave.value)')
expect(previewSource).toContain('saveSections()')
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
```

Expected: FAIL because preview still hardcodes `read-only="true"` and has no edit/save handlers.

## Task 2: Wire Editable Preview Host

**Files:**
- Modify: `dashboard/src/pages/preview/[slug].vue`

- [x] **Step 1: Add imports and composable state**

Import `computed`, `ref`, `toast`, `Save`, `ExternalLink`, `Lock`, `SectionEditorDialog`, `isModelPageWriteProtected`, `getModelPageWriteProtectedMessage`, `RegionActionId`, and `CloneRegion`.

- [x] **Step 2: Add handlers**

Add preview-local equivalents of builder handlers:

```ts
function onCloneDomUpdated(html: string) {
  if (isWriteProtectedPage.value)
    return
  cloneDraftHtml.value = html
  isDirty.value = true
}

function onCloneRegionAdded(region: CloneRegion) {
  if (isWriteProtectedPage.value)
    return
  addCloneRegion(region)
}

function onUpdateField(id: string, field: string, value: any) {
  if (isWriteProtectedPage.value)
    return
  if (activeMode.value === 'clone' && field === 'height_override') {
    setRegionHeight(id, value == null ? null : Number(value))
    return
  }
  updateSection(id, { [field]: value })
}
```

Add `onRegionAction()` for clone hide/delete, duplicate, and convert, matching the builder route.

- [x] **Step 3: Add save and structured editor wiring**

Add `savePreview()`, `openEditor()`, `closeEditor()`, and `updateEditorSection()` so the preview can persist clone or structured edits.

- [x] **Step 4: Update template**

Pass editable props/events to `PageBuilderCanvas`, render the floating save bar, render `SectionEditorDialog` when `editorSection` is open, and bind `allow-same-origin-sandbox` to `isWriteProtectedPage`.

- [x] **Step 5: Run test to verify it passes**

Run:

```bash
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
```

Expected: PASS.

## Task 3: Verify Type Safety

**Files:**
- Verify all modified files.

- [x] **Step 1: Run dashboard typecheck**

Run:

```bash
pnpm --dir dashboard exec vue-tsc -b
```

Expected: exit 0.

- [x] **Step 2: Inspect git diff**

Run:

```bash
git diff -- 'dashboard/src/pages/preview/[slug].vue' dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts docs/superpowers/specs/2026-06-05-preview-edit-context-menu-design.md docs/superpowers/plans/2026-06-05-preview-edit-context-menu.md
```

Expected: only the planned preview, test, spec, and plan changes are present.
