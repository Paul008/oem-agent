# Mitsubishi Clone Pages Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Mitsubishi model pages through the same Clone Studio production-preview path used for Ford, then use Mitsubishi as the second fidelity regression brand.

**Architecture:** Add a small checked-in Mitsubishi clone target manifest and runner so the work is repeatable rather than a one-off dashboard click sequence. The runner calls the existing `/admin/clone-page/:oemId/:modelSlug` endpoint with explicit live source URLs, then the existing preview route and `scripts/oem-fidelity-report.mjs` measure deployed output.

**Tech Stack:** TypeScript/Node scripts, existing Hono admin endpoints, R2-backed page definitions, Vue dashboard production preview, Playwright-based fidelity QA.

---

### File Structure

- Create: `scripts/mitsubishi-clone-targets.json`
  - Responsibility: single source of truth for Mitsubishi model slugs and live source URLs.
- Create: `scripts/clone-mitsubishi-pages.mjs`
  - Responsibility: call the existing clone endpoint for every target or a selected slug.
- Create: `scripts/run-mitsubishi-fidelity.mjs`
  - Responsibility: run the existing fidelity CLI for each Mitsubishi source/preview pair and write per-page reports.
- Modify: `package.json`
  - Responsibility: add explicit Mitsubishi clone and QA script aliases.
- Test: `scripts/mitsubishi-clone-targets.test.mjs`
  - Responsibility: validate target shape, slug uniqueness, and current Mitsubishi URL coverage.

### Task 1: Add Mitsubishi Clone Target Manifest

**Files:**
- Create: `scripts/mitsubishi-clone-targets.json`
- Test: `scripts/mitsubishi-clone-targets.test.mjs`

- [ ] **Step 1: Write the target manifest**

```json
[
  {
    "oemId": "mitsubishi-au",
    "modelSlug": "asx",
    "name": "ASX",
    "sourceUrl": "https://www.mitsubishi-motors.com.au/vehicles/asx.html"
  },
  {
    "oemId": "mitsubishi-au",
    "modelSlug": "outlander",
    "name": "Outlander",
    "sourceUrl": "https://www.mitsubishi-motors.com.au/vehicles/outlander.html"
  },
  {
    "oemId": "mitsubishi-au",
    "modelSlug": "eclipse-cross",
    "name": "Eclipse Cross",
    "sourceUrl": "https://www.mitsubishi-motors.com.au/vehicles/eclipse-cross.html"
  },
  {
    "oemId": "mitsubishi-au",
    "modelSlug": "triton",
    "name": "Triton",
    "sourceUrl": "https://www.mitsubishi-motors.com.au/vehicles/triton.html"
  },
  {
    "oemId": "mitsubishi-au",
    "modelSlug": "pajero-sport",
    "name": "Pajero Sport",
    "sourceUrl": "https://www.mitsubishi-motors.com.au/vehicles/pajero-sport.html"
  }
]
```

- [ ] **Step 2: Write the manifest test**

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const targets = JSON.parse(readFileSync(new URL('./mitsubishi-clone-targets.json', import.meta.url), 'utf8'));

describe('mitsubishi clone targets', () => {
  it('covers the five primary Mitsubishi model pages with unique slugs', () => {
    expect(targets).toHaveLength(5);
    expect(new Set(targets.map(target => target.modelSlug)).size).toBe(5);
    expect(targets.map(target => target.modelSlug).sort()).toEqual([
      'asx',
      'eclipse-cross',
      'outlander',
      'pajero-sport',
      'triton',
    ]);
  });

  it('uses explicit Mitsubishi live source URLs', () => {
    for (const target of targets) {
      expect(target.oemId).toBe('mitsubishi-au');
      expect(target.sourceUrl).toMatch(/^https:\/\/www\.mitsubishi-motors\.com\.au\/vehicles\/.+\.html$/);
      expect(target.name).toEqual(expect.any(String));
    }
  });
});
```

- [ ] **Step 3: Run the manifest test and verify it passes**

Run: `pnpm exec vitest run scripts/mitsubishi-clone-targets.test.mjs`

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/mitsubishi-clone-targets.json scripts/mitsubishi-clone-targets.test.mjs
git commit -m "test(dashboard): add Mitsubishi clone targets"
```

### Task 2: Add Repeatable Mitsubishi Clone Runner

**Files:**
- Create: `scripts/clone-mitsubishi-pages.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add the clone runner**

```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const targets = JSON.parse(readFileSync(new URL('./mitsubishi-clone-targets.json', import.meta.url), 'utf8'));
const args = new Set(process.argv.slice(2));
const baseUrlArg = process.argv.find(arg => arg.startsWith('--base-url='));
const slugArg = process.argv.find(arg => arg.startsWith('--slug='));
const baseUrl = (baseUrlArg?.split('=').slice(1).join('=') || process.env.OEM_AGENT_BASE_URL || '').replace(/\/$/, '');
const selectedSlug = slugArg?.split('=').slice(1).join('=');

if (!baseUrl) {
  console.error('Usage: node scripts/clone-mitsubishi-pages.mjs --base-url=https://<worker-or-dashboard-api-origin> [--slug=asx]');
  process.exit(1);
}

const selectedTargets = selectedSlug
  ? targets.filter(target => target.modelSlug === selectedSlug)
  : targets;

if (!selectedTargets.length) {
  console.error(`No Mitsubishi clone target found for slug: ${selectedSlug}`);
  process.exit(1);
}

const results = [];
for (const target of selectedTargets) {
  const endpoint = `${baseUrl}/api/v1/oem-agent/admin/clone-page/${target.oemId}/${target.modelSlug}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_url: target.sourceUrl }),
  });
  const body = await response.json().catch(() => ({}));
  const result = {
    modelSlug: target.modelSlug,
    sourceUrl: target.sourceUrl,
    status: response.status,
    success: response.ok && body.success !== false,
    error: body.error || body.message || null,
  };
  results.push(result);
  console.log(JSON.stringify(result));
  if (!result.success && !args.has('--continue-on-error'))
    process.exit(1);
}

const failed = results.filter(result => !result.success);
if (failed.length) {
  console.error(`${failed.length}/${results.length} Mitsubishi clone requests failed`);
  process.exit(1);
}
```

- [ ] **Step 2: Add package scripts**

Add these scripts to `package.json`:

```json
{
  "clone:mitsubishi": "node scripts/clone-mitsubishi-pages.mjs",
  "qa:fidelity:mitsubishi": "node scripts/run-mitsubishi-fidelity.mjs"
}
```

- [ ] **Step 3: Run syntax and manifest tests**

Run: `node --check scripts/clone-mitsubishi-pages.mjs`

Expected: exits 0.

Run: `pnpm exec vitest run scripts/mitsubishi-clone-targets.test.mjs`

Expected: manifest tests still pass.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/clone-mitsubishi-pages.mjs
git commit -m "feat(dashboard): add Mitsubishi clone runner"
```

### Task 3: Add Mitsubishi Fidelity Runner

**Files:**
- Create: `scripts/run-mitsubishi-fidelity.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add the fidelity runner**

```js
#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const targets = JSON.parse(readFileSync(new URL('./mitsubishi-clone-targets.json', import.meta.url), 'utf8'));
const deployArg = process.argv.find(arg => arg.startsWith('--preview-origin='));
const slugArg = process.argv.find(arg => arg.startsWith('--slug='));
const previewOrigin = (deployArg?.split('=').slice(1).join('=') || process.env.OEM_DASHBOARD_PREVIEW_ORIGIN || '').replace(/\/$/, '');
const selectedSlug = slugArg?.split('=').slice(1).join('=');
const selectedTargets = selectedSlug ? targets.filter(target => target.modelSlug === selectedSlug) : targets;

if (!previewOrigin) {
  console.error('Usage: node scripts/run-mitsubishi-fidelity.mjs --preview-origin=https://<pages-deploy-origin> [--slug=asx]');
  process.exit(1);
}

if (!selectedTargets.length) {
  console.error(`No Mitsubishi fidelity target found for slug: ${selectedSlug}`);
  process.exit(1);
}

const outputDir = '/private/tmp/oem-fidelity/mitsubishi';
mkdirSync(outputDir, { recursive: true });

for (const target of selectedTargets) {
  const previewUrl = `${previewOrigin}/preview/${target.oemId}-${target.modelSlug}?view=production`;
  const result = spawnSync(process.execPath, [
    'scripts/oem-fidelity-report.mjs',
    '--source-url',
    target.sourceUrl,
    '--preview-url',
    previewUrl,
    '--output-dir',
    outputDir,
    '--fail-on',
    'critical',
  ], { stdio: 'inherit' });

  if (result.status !== 0)
    process.exit(result.status || 1);
}
```

- [ ] **Step 2: Run syntax checks**

Run: `node --check scripts/run-mitsubishi-fidelity.mjs`

Expected: exits 0.

Run: `pnpm exec vitest run scripts/mitsubishi-clone-targets.test.mjs`

Expected: manifest tests still pass.

- [ ] **Step 3: Commit**

```bash
git add package.json scripts/run-mitsubishi-fidelity.mjs
git commit -m "feat(qa): add Mitsubishi fidelity runner"
```

### Task 4: Clone One Mitsubishi Page And Inspect Production Preview

**Files:**
- R2 page definition written by existing `/admin/clone-page` endpoint.

- [ ] **Step 1: Clone ASX first**

Run:

```bash
pnpm clone:mitsubishi -- --base-url=https://oem-agent.pages.dev --slug=asx
```

Expected: JSON line includes `"modelSlug":"asx"` and `"success":true`.

- [ ] **Step 2: Deploy dashboard**

Run:

```bash
pnpm --dir dashboard build
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
```

Expected: Wrangler prints a deployment URL.

- [ ] **Step 3: Run ASX fidelity**

Run:

```bash
node scripts/run-mitsubishi-fidelity.mjs --preview-origin=https://<deployment>.oem-dashboard.pages.dev --slug=asx
```

Expected: fidelity report completes and prints a score/status.

### Task 5: Clone Remaining Mitsubishi Pages And Establish Baseline

**Files:**
- R2 page definitions written by existing `/admin/clone-page` endpoint.

- [ ] **Step 1: Clone all targets**

Run:

```bash
pnpm clone:mitsubishi -- --base-url=https://oem-agent.pages.dev --continue-on-error
```

Expected: one JSON result line per target; failures remain visible without hiding successful clones.

- [ ] **Step 2: Run all Mitsubishi fidelity reports**

Run:

```bash
node scripts/run-mitsubishi-fidelity.mjs --preview-origin=https://<deployment>.oem-dashboard.pages.dev
```

Expected: each target writes a report under `/private/tmp/oem-fidelity/mitsubishi`.

- [ ] **Step 3: Triage Mitsubishi-specific fidelity failures**

Use the report outputs to separate:

- Generic Clone Studio bugs that should improve Ford and Mitsubishi.
- Mitsubishi-specific AEM behavior that should be scoped to Mitsubishi selectors.
- Source-site dynamic widgets that need interaction replay or Alpine-style revival.

### Task 6: Verification And Handoff

**Files:**
- Modify: `docs/superpowers/HANDOFF-2026-06-05-fidelity-qa-and-preview-responsive.md`

- [ ] **Step 1: Run local verification**

Run:

```bash
pnpm exec vitest run scripts/mitsubishi-clone-targets.test.mjs scripts/oem-fidelity-report.test.mjs
pnpm run typecheck
pnpm --dir dashboard build
```

Expected: all commands exit 0.

- [ ] **Step 2: Update handoff**

Add the Mitsubishi target manifest, runner commands, deployment URL, and baseline fidelity report paths.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/HANDOFF-2026-06-05-fidelity-qa-and-preview-responsive.md
git commit -m "docs: add Mitsubishi fidelity baseline"
```

---

## Self-Review

- Spec coverage: covers Mitsubishi page targets, repeatable clone/import, production preview measurement, and handoff documentation.
- Placeholder scan: no TODO/TBD placeholders remain.
- Type consistency: script arguments use `--base-url`, `--preview-origin`, and `--slug` consistently across tasks.
