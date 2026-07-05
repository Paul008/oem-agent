# Composer CLI (Block-Composition Slice 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An operator-triggered local CLI in oem-agent that captures a Toyota page with real Chrome, segments it into sections, vision-matches each section against the toyota-theme-nuxt catalog with Kimi K2.5, extracts props from the DOM, and assembles a draft `CmsPageBuilderDocument` (dry-run by default, `--post` to create the CMS draft).

**Architecture:** One pipeline CLI (`scripts/compose-toyota-page.ts`) over six focused libs under `scripts/lib/`. Every stage writes into `artifacts/composer/<slug>-<timestamp>/`; `--from <run-dir>` replays from an existing capture. All logic that can be pure IS pure and unit-tested; browser and network edges stay thin.

**Tech Stack:** TypeScript run via `npx tsx` (repo convention), puppeteer 24 + real system Chrome via `scripts/lib/qa-browser.mjs`, cheerio, Together API (`moonshotai/Kimi-K2.5`), vitest.

## Global Constraints

- **Repo:** `/Users/paulgiurin/Documents/Projects/oem-agent`, branch `feat/composer-cli-slice2` (Task 0 creates it from `main`).
- **Additive only:** create files under `scripts/` and `docs/` only. Do NOT modify anything under `src/` (Worker code), `dashboard/`, or existing scripts. Importing from `src/design/*` read-only is allowed. ONE exception: Task 1 adds `'scripts/**/*.test.ts'` to `vitest.config.ts` include/coverage-exclude (exact edit given there) — nothing else in that file.
- **Vision model (Paul's decision):** Kimi K2.5 via Together — `api_base: 'https://api.together.xyz/v1'`, model `'moonshotai/Kimi-K2.5'`, key from env `TOGETHER_API_KEY` (present in root `.env`; scripts load it via `process.loadEnvFile`). Do not use Gemini/Anthropic/Groq.
- **No-match handling (Paul's decision):** below `--min-confidence` (default `0.5`) the section becomes a `legacy_html` section carrying the captured outerHTML verbatim, flagged in the report.
- **Posting (Paul's decision):** dry-run is the default; `--post` required to create the CMS draft. CMS contract: `POST {cmsUrl}/api/auth/login` body `{email, password}` → cookies `auth_token`/`refresh_token` from Set-Cookie; then `POST {cmsUrl}/api/admin/pages` with header `Cookie` and body `{title, slug, status:'draft', content:<builder document>}`. The server renders HTML itself — never send `contentHtml`.
- **Builder document shape (toyota-theme-nuxt contract):** `{version: 1, templateKey: null, layout: {width:'contained', spacing:'standard', backgroundColor:'#ffffff', textColor:'#111111'}, sections: [{id, type, label, props, settings}]}`.
- **Catalog contract (Slice 1 output):** `catalog.json` with `presets: [{id, type, categoryId, categoryLabel, name, description, propSchema, demoProps, screenshotPath}]`, exemplar PNGs at `<catalogDir>/<screenshotPath>`. Default `--catalog` dir: `/Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt/catalog`.
- **Tests:** vitest, colocated next to sources (`scripts/lib/foo.test.ts`), run as `npx vitest run scripts/lib/foo.test.ts`. Never call live networks or browsers in unit tests — inject `fetchImpl` / use fixtures.
- **CLI conventions:** hand-rolled arg parsing (no yargs/commander), `#!/usr/bin/env node` optional for `.ts`, outputs under `artifacts/composer/`, timestamps via `timestampForPath()` from `scripts/lib/qa-browser.mjs`.
- Commit messages: repo style (`feat: …` lower-case imperative), each ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Never hardcode the preset count; derive from the loaded catalog.

---

### Task 0: Branch setup — controller

- [ ] `cd /Users/paulgiurin/Documents/Projects/oem-agent && git checkout -b feat/composer-cli-slice2 main`
- [ ] `git status --short` — expect clean (untracked `.superpowers/` scratch is fine).

---

### Task 1: Catalog loader (`scripts/lib/catalog.ts`)

**Files:**
- Create: `scripts/lib/catalog.ts`
- Test: `scripts/lib/catalog.test.ts`
- Modify: `vitest.config.ts` (test include patterns only — root vitest currently ignores `scripts/**/*.test.ts`)

**Step 0 (before the failing test): register scripts TS tests with vitest.** In `vitest.config.ts` change `include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],` to `include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'scripts/**/*.test.mjs'],` and in `coverage.exclude` change `'scripts/**/*.test.mjs'` to `'scripts/**/*.test.mjs', 'scripts/**/*.test.ts'`. No other changes. Include `vitest.config.ts` in this task's commit.

**Interfaces:**
- Consumes: filesystem only.
- Produces (used by Tasks 4, 7):
  - `type CatalogPropSchemaValue = { type: 'string'|'number'|'boolean' } | { type: 'array'; item: Record<string, CatalogPropSchemaValue> }`
  - `type CatalogPreset = { id: string; type: string; categoryId: string; categoryLabel: string; name: string; description: string; propSchema: Record<string, CatalogPropSchemaValue>; demoProps: Record<string, unknown>; screenshotPath: string }`
  - `type LoadedCatalog = { version: number; oem: string; presetCount: number; categories: Array<{id:string;label:string;description:string}>; presets: CatalogPreset[]; dir: string }`
  - `loadCatalog(catalogDir: string): Promise<LoadedCatalog>` — throws with actionable messages on missing/empty catalog or missing exemplar PNGs.
  - `exemplarAbsolutePath(catalog: LoadedCatalog, preset: CatalogPreset): string`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exemplarAbsolutePath, loadCatalog } from './catalog';

function writeFixtureCatalog(overrides: { omitPng?: boolean; presets?: unknown[] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'composer-catalog-'));
  const presets = overrides.presets ?? [
    {
      id: 'hero-standard',
      type: 'hero',
      categoryId: 'content',
      categoryLabel: 'Toyota',
      name: 'Toyota Hero',
      description: 'Large page opener.',
      propSchema: { heading: { type: 'string' } },
      demoProps: { heading: 'Demo' },
      screenshotPath: 'screenshots/hero-standard.png',
    },
  ];
  writeFileSync(join(dir, 'catalog.json'), JSON.stringify({
    version: 1, oem: 'toyota', presetCount: presets.length, categories: [], presets,
  }));
  mkdirSync(join(dir, 'screenshots'), { recursive: true });
  if (!overrides.omitPng) {
    writeFileSync(join(dir, 'screenshots', 'hero-standard.png'), Buffer.from('fake-png'));
  }
  return dir;
}

describe('loadCatalog', () => {
  it('loads a valid catalog and records its dir', async () => {
    const dir = writeFixtureCatalog();
    const catalog = await loadCatalog(dir);
    expect(catalog.presets).toHaveLength(1);
    expect(catalog.presets[0].id).toBe('hero-standard');
    expect(catalog.dir).toBe(dir);
  });

  it('resolves exemplar absolute paths', async () => {
    const dir = writeFixtureCatalog();
    const catalog = await loadCatalog(dir);
    expect(exemplarAbsolutePath(catalog, catalog.presets[0]))
      .toBe(join(dir, 'screenshots', 'hero-standard.png'));
  });

  it('throws an actionable error when an exemplar PNG is missing', async () => {
    const dir = writeFixtureCatalog({ omitPng: true });
    await expect(loadCatalog(dir)).rejects.toThrow(/hero-standard.*catalog:capture/s);
  });

  it('throws when the catalog has no presets', async () => {
    const dir = writeFixtureCatalog({ presets: [] });
    await expect(loadCatalog(dir)).rejects.toThrow(/no presets/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/paulgiurin/Documents/Projects/oem-agent && npx vitest run scripts/lib/catalog.test.ts`
Expected: FAIL — cannot resolve `./catalog`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/catalog.ts`:

```ts
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type CatalogPropSchemaValue =
  | { type: 'string' | 'number' | 'boolean' }
  | { type: 'array'; item: Record<string, CatalogPropSchemaValue> };

export type CatalogPreset = {
  id: string;
  type: string;
  categoryId: string;
  categoryLabel: string;
  name: string;
  description: string;
  propSchema: Record<string, CatalogPropSchemaValue>;
  demoProps: Record<string, unknown>;
  screenshotPath: string;
};

export type LoadedCatalog = {
  version: number;
  oem: string;
  presetCount: number;
  categories: Array<{ id: string; label: string; description: string }>;
  presets: CatalogPreset[];
  dir: string;
};

export async function loadCatalog(catalogDir: string): Promise<LoadedCatalog> {
  const catalogFile = join(catalogDir, 'catalog.json');
  let raw: Omit<LoadedCatalog, 'dir'>;
  try {
    raw = JSON.parse(await readFile(catalogFile, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read catalog at ${catalogFile}: ${(error as Error).message}`);
  }

  if (!Array.isArray(raw.presets) || raw.presets.length === 0) {
    throw new Error(`Catalog at ${catalogFile} has no presets — regenerate with catalog:build in toyota-theme-nuxt`);
  }

  const missing: string[] = [];
  for (const preset of raw.presets) {
    try {
      await access(join(catalogDir, preset.screenshotPath));
    } catch {
      missing.push(preset.id);
    }
  }
  if (missing.length) {
    throw new Error(
      `Catalog exemplar screenshots missing for: ${missing.join(', ')} — run catalog:capture in toyota-theme-nuxt`,
    );
  }

  return { ...raw, dir: catalogDir };
}

export function exemplarAbsolutePath(catalog: LoadedCatalog, preset: CatalogPreset): string {
  return join(catalog.dir, preset.screenshotPath);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/catalog.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/paulgiurin/Documents/Projects/oem-agent
git add scripts/lib/catalog.ts scripts/lib/catalog.test.ts
git commit -m "feat(composer): catalog loader with exemplar validation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: CMS client (`scripts/lib/cms-client.ts`)

**Files:**
- Create: `scripts/lib/cms-client.ts`
- Test: `scripts/lib/cms-client.test.ts`

**Interfaces:**
- Produces (used by Task 7):
  - `type CmsSession = { baseUrl: string; cookie: string }`
  - `loginToCms(baseUrl: string, email: string, password: string, fetchImpl?: typeof fetch): Promise<CmsSession>`
  - `createDraftPage(session: CmsSession, input: { title: string; slug?: string; content: unknown }, fetchImpl?: typeof fetch): Promise<Record<string, unknown>>`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/cms-client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createDraftPage, loginToCms } from './cms-client';

function loginResponse(setCookies: string[], ok = true, status = 200) {
  return {
    ok,
    status,
    headers: { getSetCookie: () => setCookies },
    text: async () => JSON.stringify({ success: ok }),
  } as unknown as Response;
}

describe('loginToCms', () => {
  it('captures auth_token and refresh_token cookies from Set-Cookie', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(loginResponse([
      'auth_token=abc123; Path=/; HttpOnly; SameSite=Lax',
      'refresh_token=def456; Path=/; HttpOnly',
    ]));
    const session = await loginToCms('http://localhost:3000', 'a@b.c', 'pw', fetchImpl as unknown as typeof fetch);
    expect(session.cookie).toBe('auth_token=abc123; refresh_token=def456');
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/api/auth/login', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.c', password: 'pw' }),
    }));
  });

  it('throws when login response has no auth_token cookie', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(loginResponse(['other=1; Path=/']));
    await expect(loginToCms('http://x', 'a@b.c', 'pw', fetchImpl as unknown as typeof fetch))
      .rejects.toThrow(/auth_token/);
  });

  it('throws with status on non-ok login', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(loginResponse([], false, 401));
    await expect(loginToCms('http://x', 'a@b.c', 'bad', fetchImpl as unknown as typeof fetch))
      .rejects.toThrow(/401/);
  });
});

describe('createDraftPage', () => {
  it('POSTs the draft with cookie header and status draft', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => JSON.stringify({ id: 7, slug: 'composed-rav4' }),
    } as unknown as Response);
    const result = await createDraftPage(
      { baseUrl: 'http://localhost:3000', cookie: 'auth_token=abc123' },
      { title: 'Composed RAV4', slug: 'composed-rav4', content: { version: 1 } },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual({ id: 7, slug: 'composed-rav4' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/admin/pages');
    expect((init.headers as Record<string, string>).Cookie).toBe('auth_token=abc123');
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'Composed RAV4', slug: 'composed-rav4', status: 'draft', content: { version: 1 },
    });
  });

  it('throws with response body excerpt on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 500, text: async () => 'relation "pages" does not exist',
    } as unknown as Response);
    await expect(createDraftPage(
      { baseUrl: 'http://x', cookie: 'auth_token=a' },
      { title: 'T', content: {} },
      fetchImpl as unknown as typeof fetch,
    )).rejects.toThrow(/500.*pages/s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/cms-client.test.ts`
Expected: FAIL — cannot resolve `./cms-client`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/cms-client.ts`:

```ts
export type CmsSession = { baseUrl: string; cookie: string };

export async function loginToCms(
  baseUrl: string,
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CmsSession> {
  const response = await fetchImpl(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CMS login failed: ${response.status} ${body.slice(0, 300)}`);
  }

  const setCookies: string[] =
    (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const cookie = setCookies
    .map((entry) => entry.split(';')[0].trim())
    .filter((pair) => pair.startsWith('auth_token=') || pair.startsWith('refresh_token='))
    .join('; ');
  if (!cookie.includes('auth_token=')) {
    throw new Error('CMS login succeeded but no auth_token cookie was set');
  }
  return { baseUrl, cookie };
}

export async function createDraftPage(
  session: CmsSession,
  input: { title: string; slug?: string; content: unknown },
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`${session.baseUrl}/api/admin/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: session.cookie },
    body: JSON.stringify({
      title: input.title,
      slug: input.slug,
      status: 'draft',
      content: input.content,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`CMS draft create failed: ${response.status} ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/cms-client.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/cms-client.ts scripts/lib/cms-client.test.ts
git commit -m "feat(composer): cms client — cookie login and draft page creation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Prop extractor (`scripts/lib/prop-extractor.ts`)

**Files:**
- Create: `scripts/lib/prop-extractor.ts`
- Test: `scripts/lib/prop-extractor.test.ts`

**Interfaces:**
- Consumes: `CatalogPreset`, `CatalogPropSchemaValue` from `./catalog` (Task 1).
- Produces (used by Task 7):
  - `type Extraction = { props: Record<string, unknown>; filledRatio: number; missing: string[] }`
  - `extractProps(sectionHtml: string, preset: CatalogPreset, sourceUrl: string): Extraction`
  - `aiExtractProps(opts: { sectionHtml: string; preset: CatalogPreset; sourceUrl: string; apiKey: string; apiBase?: string; model?: string; fetchImpl?: typeof fetch }): Promise<Extraction>` (used only behind `--ai-extract`)
  - `buildAiExtractPrompt(sectionHtml: string, preset: CatalogPreset): string` and `parseAiExtractResponse(content: string, preset: CatalogPreset): Record<string, unknown>` exported for tests.

**Extraction rules (implement exactly):**
- `heading`: text of first `h1|h2|h3` (whitespace collapsed).
- `eyebrow`: walking elements in document order before the heading element, the LAST element whose own text is 2–60 chars and differs from the heading.
- `body`: first `p` with text ≥ 40 chars; fallback longest `p` ≥ 20 chars.
- `imageUrl`: first `img` — src candidates in order `src` (skip `data:` placeholders), `data-src`, first URL of `srcset`; absolutized against `sourceUrl`. `imageAlt`: that img's `alt` or `''`.
- `buttonLabel`/`buttonHref`: prefer first `a[href]` matching `[class*=btn],[class*=button],[class*=cta]`, else first `a[href]` with text 2–40 chars; label = text, href absolutized.
- `address`: text of `<address>` if present. `mapHref`: first `a[href]` containing `google.com/maps` or starting `https://maps`.
- Identity keys `variant`, `columns`, `formType`: never extracted from DOM — copied verbatim from `preset.demoProps` when the schema has them.
- `items` (schema `{type:'array'}`): among parents with ≥2 same-tag direct children where ≥2 children contain an `img` or `h3–h6`, pick the parent with the most such children; each child yields `{title: first h1–h6/strong text, body: first p text, imageUrl/imageAlt, href/buttonLabel from first a}` filtered to items with a title, capped at 12. Only include keys present in the schema's `item`.
- Fill accounting: a key counts filled when string non-empty / number finite / array length ≥ 1. `filledRatio = filled / totalSchemaKeys`, `missing` = unfilled keys.
- URL absolutization: `new URL(value, sourceUrl).toString()`; return `''` for `data:`/`javascript:`/empty inputs that can't resolve.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/prop-extractor.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { CatalogPreset } from './catalog';
import {
  buildAiExtractPrompt,
  extractProps,
  parseAiExtractResponse,
} from './prop-extractor';

const HERO_PRESET: CatalogPreset = {
  id: 'hero-standard', type: 'hero', categoryId: 'content', categoryLabel: 'Toyota',
  name: 'Toyota Hero', description: 'Opener', screenshotPath: 'screenshots/hero-standard.png',
  propSchema: {
    eyebrow: { type: 'string' }, heading: { type: 'string' }, body: { type: 'string' },
    imageUrl: { type: 'string' }, imageAlt: { type: 'string' },
    buttonLabel: { type: 'string' }, buttonHref: { type: 'string' },
  },
  demoProps: {},
};

const CARDS_PRESET: CatalogPreset = {
  id: 'toyota-ideal-cards', type: 'feature_grid', categoryId: 'inventory', categoryLabel: 'Inventory',
  name: 'Find Your Ideal Toyota', description: 'Cards', screenshotPath: 'screenshots/x.png',
  propSchema: {
    heading: { type: 'string' }, variant: { type: 'string' }, columns: { type: 'number' },
    items: {
      type: 'array',
      item: {
        title: { type: 'string' }, body: { type: 'string' },
        imageUrl: { type: 'string' }, href: { type: 'string' }, buttonLabel: { type: 'string' },
      },
    },
  },
  demoProps: { variant: 'toyota-category', columns: 4 },
};

const HERO_HTML = `
<section>
  <span class="tag">All-New</span>
  <h1>RAV4 Hybrid</h1>
  <p>The RAV4 blends bold design with hybrid efficiency for every Australian adventure, city or bush.</p>
  <img src="/content/rav4-hero.jpg" alt="RAV4 on a mountain road">
  <a class="cta-button" href="/rav4/enquire">Enquire now</a>
</section>`;

const CARDS_HTML = `
<section>
  <h2>Choose your grade</h2>
  <div class="grid">
    <div class="card"><img data-src="/img/gx.jpg" alt="GX"><h3>GX</h3><p>The capable entry grade.</p><a href="/rav4/gx">See GX</a></div>
    <div class="card"><img src="/img/xle.jpg" alt="XLE"><h3>XLE</h3><p>More comfort, more tech.</p><a href="/rav4/xle">See XLE</a></div>
    <div class="card"><img src="/img/edge.jpg" alt="Edge"><h3>Edge</h3><p>The flagship experience.</p><a href="/rav4/edge">See Edge</a></div>
  </div>
</section>`;

describe('extractProps — hero', () => {
  const extraction = extractProps(HERO_HTML, HERO_PRESET, 'https://www.toyota.com.au/rav4');

  it('extracts heading, eyebrow, body', () => {
    expect(extraction.props.heading).toBe('RAV4 Hybrid');
    expect(extraction.props.eyebrow).toBe('All-New');
    expect(String(extraction.props.body)).toContain('hybrid efficiency');
  });

  it('absolutizes image and CTA URLs against the source origin', () => {
    expect(extraction.props.imageUrl).toBe('https://www.toyota.com.au/content/rav4-hero.jpg');
    expect(extraction.props.imageAlt).toBe('RAV4 on a mountain road');
    expect(extraction.props.buttonLabel).toBe('Enquire now');
    expect(extraction.props.buttonHref).toBe('https://www.toyota.com.au/rav4/enquire');
  });

  it('reports full fill for the hero fixture', () => {
    expect(extraction.missing).toEqual([]);
    expect(extraction.filledRatio).toBe(1);
  });
});

describe('extractProps — cards', () => {
  const extraction = extractProps(CARDS_HTML, CARDS_PRESET, 'https://www.toyota.com.au/rav4');

  it('extracts repeated items with titles, bodies, images, links', () => {
    const items = extraction.props.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      title: 'GX',
      imageUrl: 'https://www.toyota.com.au/img/gx.jpg',
      href: 'https://www.toyota.com.au/rav4/gx',
      buttonLabel: 'See GX',
    });
  });

  it('copies identity keys from demoProps instead of the DOM', () => {
    expect(extraction.props.variant).toBe('toyota-category');
    expect(extraction.props.columns).toBe(4);
  });

  it('counts filled keys correctly', () => {
    expect(extraction.missing).toEqual([]);
    expect(extraction.filledRatio).toBe(1);
  });
});

describe('extractProps — sparse section', () => {
  it('reports missing keys and partial ratio', () => {
    const extraction = extractProps('<section><h2>Just a title</h2></section>', HERO_PRESET, 'https://x.com');
    expect(extraction.props.heading).toBe('Just a title');
    expect(extraction.missing).toContain('imageUrl');
    expect(extraction.filledRatio).toBeGreaterThan(0);
    expect(extraction.filledRatio).toBeLessThan(1);
  });
});

describe('ai extract helpers', () => {
  it('prompt names every schema key and embeds the section html', () => {
    const prompt = buildAiExtractPrompt(HERO_HTML, HERO_PRESET);
    for (const key of Object.keys(HERO_PRESET.propSchema)) expect(prompt).toContain(key);
    expect(prompt).toContain('RAV4 Hybrid');
  });

  it('parses a JSON response and drops keys not in the schema', () => {
    const parsed = parseAiExtractResponse(
      JSON.stringify({ heading: 'H', bogus: 'x' }),
      HERO_PRESET,
    );
    expect(parsed).toEqual({ heading: 'H' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/prop-extractor.test.ts`
Expected: FAIL — cannot resolve `./prop-extractor`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/prop-extractor.ts`:

```ts
import { load, type CheerioAPI } from 'cheerio';
import type { CatalogPreset, CatalogPropSchemaValue } from './catalog';

export type Extraction = {
  props: Record<string, unknown>;
  filledRatio: number;
  missing: string[];
};

const IDENTITY_KEYS = new Set(['variant', 'columns', 'formType']);

export function extractProps(
  sectionHtml: string,
  preset: CatalogPreset,
  sourceUrl: string,
): Extraction {
  const $ = load(sectionHtml);
  const schema = preset.propSchema;
  const props: Record<string, unknown> = {};

  const headingEl = $('h1, h2, h3').first();
  const heading = collapse(headingEl.text());

  for (const [key, value] of Object.entries(schema)) {
    if (IDENTITY_KEYS.has(key)) {
      if (key in preset.demoProps) props[key] = preset.demoProps[key];
      continue;
    }
    if (value.type === 'array') {
      props[key] = extractItems($, value.item, sourceUrl);
      continue;
    }
    switch (key) {
      case 'heading':
        if (heading) props[key] = heading;
        break;
      case 'eyebrow': {
        const eyebrow = extractEyebrow($, headingEl, heading);
        if (eyebrow) props[key] = eyebrow;
        break;
      }
      case 'body': {
        const body = extractBody($);
        if (body) props[key] = body;
        break;
      }
      case 'imageUrl': {
        const src = imageSource($('img').first());
        const absolute = absolutize(src, sourceUrl);
        if (absolute) props[key] = absolute;
        break;
      }
      case 'imageAlt': {
        const alt = collapse($('img').first().attr('alt') || '');
        if (alt) props[key] = alt;
        break;
      }
      case 'buttonLabel':
      case 'buttonHref': {
        const cta = extractCta($);
        if (key === 'buttonLabel' && cta.label) props[key] = cta.label;
        if (key === 'buttonHref') {
          const absolute = absolutize(cta.href, sourceUrl);
          if (absolute) props[key] = absolute;
        }
        break;
      }
      case 'address': {
        const address = collapse($('address').first().text());
        if (address) props[key] = address;
        break;
      }
      case 'mapHref': {
        const map = $('a[href]').toArray().map((el) => String($(el).attr('href') || ''))
          .find((href) => href.includes('google.com/maps') || href.startsWith('https://maps'));
        const absolute = absolutize(map || '', sourceUrl);
        if (absolute) props[key] = absolute;
        break;
      }
      default:
        break;
    }
  }

  const keys = Object.keys(schema);
  const missing = keys.filter((key) => !isFilled(props[key]));
  return {
    props,
    filledRatio: keys.length === 0 ? 1 : (keys.length - missing.length) / keys.length,
    missing,
  };
}

function extractEyebrow($: CheerioAPI, headingEl: ReturnType<CheerioAPI>, heading: string): string {
  if (headingEl.length === 0) return '';
  const headingNode = headingEl.get(0);
  let candidate = '';
  for (const el of $('*').toArray()) {
    if (el === headingNode) break;
    const own = collapse($(el).clone().children().remove().end().text());
    if (own.length >= 2 && own.length <= 60 && own !== heading) candidate = own;
  }
  return candidate;
}

function extractBody($: CheerioAPI): string {
  const paragraphs = $('p').toArray().map((el) => collapse($(el).text()));
  const substantive = paragraphs.find((text) => text.length >= 40);
  if (substantive) return substantive;
  const longest = [...paragraphs].sort((a, b) => b.length - a.length)[0] || '';
  return longest.length >= 20 ? longest : '';
}

function extractCta($: CheerioAPI): { label: string; href: string } {
  const preferred = $('a[href]').filter('[class*=btn], [class*=button], [class*=cta]').first();
  const anchor = preferred.length
    ? preferred
    : $('a[href]').filter((_, el) => {
        const text = collapse($(el).text());
        return text.length >= 2 && text.length <= 40;
      }).first();
  if (!anchor.length) return { label: '', href: '' };
  return { label: collapse(anchor.text()), href: String(anchor.attr('href') || '') };
}

function extractItems(
  $: CheerioAPI,
  itemSchema: Record<string, CatalogPropSchemaValue>,
  sourceUrl: string,
): Array<Record<string, unknown>> {
  let bestParent: ReturnType<CheerioAPI> | null = null;
  let bestCount = 0;
  for (const el of $('*').toArray()) {
    const children = $(el).children().toArray();
    if (children.length < 2) continue;
    const tagCounts = new Map<string, number>();
    for (const child of children) {
      const tag = child.tagName?.toLowerCase() || '';
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
    const [dominantTag, dominantCount] = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (dominantCount < 2) continue;
    const cardLike = children.filter((child) => {
      if ((child.tagName?.toLowerCase() || '') !== dominantTag) return false;
      const $child = $(child);
      return $child.find('img').length > 0 || $child.find('h3, h4, h5, h6').length > 0;
    });
    if (cardLike.length >= 2 && cardLike.length > bestCount) {
      bestCount = cardLike.length;
      bestParent = $(el);
    }
  }
  if (!bestParent) return [];

  const items: Array<Record<string, unknown>> = [];
  for (const child of bestParent.children().toArray()) {
    const $child = $(child);
    const title = collapse($child.find('h1, h2, h3, h4, h5, h6, strong').first().text());
    if (!title) continue;
    const item: Record<string, unknown> = {};
    if ('title' in itemSchema) item.title = title;
    if ('body' in itemSchema) {
      const body = collapse($child.find('p').first().text());
      if (body) item.body = body;
    }
    if ('imageUrl' in itemSchema) {
      const src = absolutize(imageSource($child.find('img').first()), sourceUrl);
      if (src) item.imageUrl = src;
    }
    if ('imageAlt' in itemSchema) {
      const alt = collapse($child.find('img').first().attr('alt') || '');
      if (alt) item.imageAlt = alt;
    }
    const anchor = $child.find('a[href]').first();
    if (anchor.length) {
      if ('href' in itemSchema) {
        const href = absolutize(String(anchor.attr('href') || ''), sourceUrl);
        if (href) item.href = href;
      }
      if ('buttonLabel' in itemSchema) {
        const label = collapse(anchor.text());
        if (label) item.buttonLabel = label;
      }
    }
    items.push(item);
    if (items.length >= 12) break;
  }
  return items;
}

function imageSource(img: ReturnType<CheerioAPI>): string {
  if (!img.length) return '';
  const src = String(img.attr('src') || '');
  if (src && !src.startsWith('data:')) return src;
  const dataSrc = String(img.attr('data-src') || '');
  if (dataSrc) return dataSrc;
  const srcset = String(img.attr('srcset') || '');
  if (srcset) return srcset.split(',')[0].trim().split(/\s+/)[0];
  return '';
}

function absolutize(value: string, base: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return '';
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return '';
  }
}

function collapse(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function isFilled(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

// --- AI-assisted extraction (behind --ai-extract) ---

export function buildAiExtractPrompt(sectionHtml: string, preset: CatalogPreset): string {
  const keys = Object.entries(preset.propSchema)
    .map(([key, value]) => `- ${key}: ${value.type === 'array' ? `array of {${Object.keys(value.item).join(', ')}}` : value.type}`)
    .join('\n');
  return [
    `Extract content values from this HTML section for the CMS preset "${preset.name}" (${preset.id}).`,
    'Return ONLY a JSON object with these keys (omit keys you cannot fill; never invent content):',
    keys,
    'Use the literal text and URLs from the HTML. HTML:',
    sectionHtml.slice(0, 60_000),
  ].join('\n\n');
}

export function parseAiExtractResponse(
  content: string,
  preset: CatalogPreset,
): Record<string, unknown> {
  const cleaned = content.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const allowed = new Set(Object.keys(preset.propSchema));
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => allowed.has(key)));
}

export async function aiExtractProps(opts: {
  sectionHtml: string;
  preset: CatalogPreset;
  sourceUrl: string;
  apiKey: string;
  apiBase?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<Extraction> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const response = await fetchImpl(`${opts.apiBase ?? 'https://api.together.xyz/v1'}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model ?? 'moonshotai/Kimi-K2.5',
      messages: [{ role: 'user', content: buildAiExtractPrompt(opts.sectionHtml, opts.preset) }],
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) {
    throw new Error(`AI extract failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  }
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const props = parseAiExtractResponse(data.choices?.[0]?.message?.content || '{}', opts.preset);
  const keys = Object.keys(opts.preset.propSchema);
  const missing = keys.filter((key) => !isFilled(props[key]));
  return { props, filledRatio: keys.length ? (keys.length - missing.length) / keys.length : 1, missing };
}
```

Note: if `ReturnType<CheerioAPI>` fails under tsx/vitest typing, use `import type { Cheerio } from 'cheerio'` with `Cheerio<any>` for the helper params — behavior identical.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/prop-extractor.test.ts`
Expected: 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/prop-extractor.ts scripts/lib/prop-extractor.test.ts
git commit -m "feat(composer): deterministic prop extractor with optional ai fallback

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Preset matcher (`scripts/lib/preset-matcher.ts`)

**Files:**
- Create: `scripts/lib/preset-matcher.ts`
- Test: `scripts/lib/preset-matcher.test.ts`

**Interfaces:**
- Consumes: `LoadedCatalog`, `CatalogPreset` from `./catalog`.
- Produces (used by Task 7):
  - `type ExemplarImage = { presetId: string; base64: string }`
  - `type SectionMatch = { presetId: string | null; confidence: number; runnersUp: Array<{ presetId: string; confidence: number }>; reason: string; error?: string }`
  - `buildPresetMenu(catalog: LoadedCatalog): string`
  - `buildMatchContent(sectionBase64: string, exemplars: ExemplarImage[], menu: string): Array<{ type: string; text?: string; image_url?: { url: string } }>`
  - `parseMatchResponse(content: string, validIds: Set<string>): { presetId: string | null; confidence: number; runnersUp: Array<{ presetId: string; confidence: number }>; reason: string }`
  - `matchSection(opts: { sectionBase64: string; exemplars: ExemplarImage[]; catalog: LoadedCatalog; apiKey: string; apiBase?: string; model?: string; fetchImpl?: typeof fetch }): Promise<SectionMatch>` — retries once on failure, then resolves (never rejects) with `presetId: null` and `error` set.

Together request format (mirrors `src/ai/router.ts:callTogether`): `POST {apiBase}/chat/completions`, `Authorization: Bearer`, body `{model, messages: [{role:'user', content: <parts>}], temperature: 0.2, max_tokens: 1024, response_format: {type:'json_object'}}`. Image parts are `{type:'image_url', image_url:{url:'data:image/png;base64,<b64>'}}`.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/preset-matcher.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { LoadedCatalog } from './catalog';
import {
  buildMatchContent,
  buildPresetMenu,
  matchSection,
  parseMatchResponse,
} from './preset-matcher';

const CATALOG: LoadedCatalog = {
  version: 1, oem: 'toyota', presetCount: 2, categories: [], dir: '/tmp/cat',
  presets: [
    {
      id: 'hero-standard', type: 'hero', categoryId: 'content', categoryLabel: 'Toyota',
      name: 'Toyota Hero', description: 'Large opener.',
      propSchema: { heading: { type: 'string' } }, demoProps: {}, screenshotPath: 's/h.png',
    },
    {
      id: 'toyota-ideal-cards', type: 'feature_grid', categoryId: 'inventory', categoryLabel: 'Inventory',
      name: 'Ideal Cards', description: 'Category cards.',
      propSchema: { items: { type: 'array', item: { title: { type: 'string' } } } },
      demoProps: { variant: 'toyota-category' }, screenshotPath: 's/c.png',
    },
  ],
};

const EXEMPLARS = [
  { presetId: 'hero-standard', base64: 'AAA' },
  { presetId: 'toyota-ideal-cards', base64: 'BBB' },
];

describe('buildPresetMenu', () => {
  it('lists every preset id, name, type, and variant', () => {
    const menu = buildPresetMenu(CATALOG);
    expect(menu).toContain('hero-standard');
    expect(menu).toContain('toyota-ideal-cards');
    expect(menu).toContain('feature_grid');
    expect(menu).toContain('toyota-category');
  });
});

describe('buildMatchContent', () => {
  it('orders parts: menu text, section image, labelled exemplar images', () => {
    const parts = buildMatchContent('SEC', EXEMPLARS, 'MENU');
    expect(parts[0]).toMatchObject({ type: 'text' });
    expect(parts[0].text).toContain('MENU');
    expect(parts[1]).toMatchObject({ type: 'text', text: expect.stringContaining('SECTION TO MATCH') });
    expect(parts[2]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,SEC' } });
    expect(parts[3]).toMatchObject({ type: 'text', text: expect.stringContaining('hero-standard') });
    expect(parts[4]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } });
    expect(parts.at(-1)).toMatchObject({ type: 'text' });
  });
});

describe('parseMatchResponse', () => {
  const valid = new Set(['hero-standard', 'toyota-ideal-cards']);

  it('parses a clean JSON verdict', () => {
    const result = parseMatchResponse(
      JSON.stringify({ presetId: 'hero-standard', confidence: 0.92, runnersUp: [{ presetId: 'toyota-ideal-cards', confidence: 0.3 }], reason: 'big hero' }),
      valid,
    );
    expect(result.presetId).toBe('hero-standard');
    expect(result.confidence).toBe(0.92);
    expect(result.runnersUp).toHaveLength(1);
  });

  it('nulls an unknown presetId and strips unknown runners-up', () => {
    const result = parseMatchResponse(
      JSON.stringify({ presetId: 'nope', confidence: 0.9, runnersUp: [{ presetId: 'nope2', confidence: 0.5 }] }),
      valid,
    );
    expect(result.presetId).toBeNull();
    expect(result.runnersUp).toEqual([]);
  });

  it('clamps confidence into [0,1] and survives fenced JSON', () => {
    const result = parseMatchResponse('```json\n{"presetId":"hero-standard","confidence":7}\n```', valid);
    expect(result.confidence).toBe(1);
  });

  it('returns a null verdict for unparseable content', () => {
    const result = parseMatchResponse('not json at all', valid);
    expect(result.presetId).toBeNull();
    expect(result.reason).toMatch(/unparseable/i);
  });
});

describe('matchSection', () => {
  it('returns the parsed verdict on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ presetId: 'hero-standard', confidence: 0.8, runnersUp: [], reason: 'r' }) } }] }),
    });
    const match = await matchSection({
      sectionBase64: 'SEC', exemplars: EXEMPLARS, catalog: CATALOG,
      apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(match.presetId).toBe('hero-standard');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.model).toBe('moonshotai/Kimi-K2.5');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('retries once then resolves with a null match carrying the error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) });
    const match = await matchSection({
      sectionBase64: 'SEC', exemplars: EXEMPLARS, catalog: CATALOG,
      apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(match.presetId).toBeNull();
    expect(match.error).toMatch(/500/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/preset-matcher.test.ts`
Expected: FAIL — cannot resolve `./preset-matcher`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/preset-matcher.ts`:

```ts
import type { LoadedCatalog } from './catalog';

export type ExemplarImage = { presetId: string; base64: string };

export type SectionMatch = {
  presetId: string | null;
  confidence: number;
  runnersUp: Array<{ presetId: string; confidence: number }>;
  reason: string;
  error?: string;
};

type ContentPart = { type: string; text?: string; image_url?: { url: string } };

export const TOGETHER_API_BASE = 'https://api.together.xyz/v1';
export const KIMI_MODEL = 'moonshotai/Kimi-K2.5';

export function buildPresetMenu(catalog: LoadedCatalog): string {
  const lines = catalog.presets.map((preset) => {
    const variant = typeof preset.demoProps.variant === 'string' ? ` variant=${preset.demoProps.variant}` : '';
    const propKeys = Object.keys(preset.propSchema).join(', ');
    return `- ${preset.id} | ${preset.name} | type=${preset.type}${variant} | category=${preset.categoryLabel} | props: ${propKeys} | ${preset.description}`;
  });
  return `Available CMS presets:\n${lines.join('\n')}`;
}

export function buildMatchContent(
  sectionBase64: string,
  exemplars: ExemplarImage[],
  menu: string,
): ContentPart[] {
  const parts: ContentPart[] = [
    {
      type: 'text',
      text: [
        'You match a captured website section to the closest CMS block preset.',
        menu,
        'After the section image, each preset exemplar image follows, labelled with its id.',
      ].join('\n\n'),
    },
    { type: 'text', text: 'SECTION TO MATCH:' },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${sectionBase64}` } },
  ];
  for (const exemplar of exemplars) {
    parts.push({ type: 'text', text: `EXEMPLAR ${exemplar.presetId}:` });
    parts.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${exemplar.base64}` } });
  }
  parts.push({
    type: 'text',
    text: [
      'Respond with ONLY this JSON object:',
      '{"presetId": "<id or null if nothing fits>", "confidence": <0..1>, "runnersUp": [{"presetId": "<id>", "confidence": <0..1>}], "reason": "<one sentence>"}',
      'Judge by layout structure and content role (hero vs cards vs cta vs form vs map), not by colors or exact copy.',
    ].join('\n'),
  });
  return parts;
}

export function parseMatchResponse(
  content: string,
  validIds: Set<string>,
): Omit<SectionMatch, 'error'> {
  const cleaned = content.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return { presetId: null, confidence: 0, runnersUp: [], reason: 'unparseable model response' };
  }
  const rawId = typeof parsed.presetId === 'string' ? parsed.presetId : null;
  const presetId = rawId && validIds.has(rawId) ? rawId : null;
  const runnersUp = (Array.isArray(parsed.runnersUp) ? parsed.runnersUp : [])
    .filter((entry): entry is { presetId: string; confidence: number } =>
      !!entry && typeof entry === 'object'
      && typeof (entry as Record<string, unknown>).presetId === 'string'
      && validIds.has((entry as Record<string, unknown>).presetId as string))
    .map((entry) => ({ presetId: entry.presetId, confidence: clamp01(Number(entry.confidence)) }));
  return {
    presetId,
    confidence: clamp01(Number(parsed.confidence)),
    runnersUp,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  };
}

export async function matchSection(opts: {
  sectionBase64: string;
  exemplars: ExemplarImage[];
  catalog: LoadedCatalog;
  apiKey: string;
  apiBase?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<SectionMatch> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const validIds = new Set(opts.catalog.presets.map((preset) => preset.id));
  const content = buildMatchContent(opts.sectionBase64, opts.exemplars, buildPresetMenu(opts.catalog));

  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(`${opts.apiBase ?? TOGETHER_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts.model ?? KIMI_MODEL,
          messages: [{ role: 'user', content }],
          temperature: 0.2,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
        }),
      });
      if (!response.ok) {
        lastError = `Together error ${response.status}: ${(await response.text()).slice(0, 300)}`;
        continue;
      }
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return { ...parseMatchResponse(data.choices?.[0]?.message?.content || '', validIds) };
    } catch (error) {
      lastError = (error as Error).message;
    }
  }
  return { presetId: null, confidence: 0, runnersUp: [], reason: 'match call failed', error: lastError };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/preset-matcher.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/preset-matcher.ts scripts/lib/preset-matcher.test.ts
git commit -m "feat(composer): kimi vision preset matcher with strict-json verdicts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Section capture (`scripts/lib/section-capture.ts`)

**Files:**
- Create: `scripts/lib/section-capture.ts`
- Test: `scripts/lib/section-capture.test.ts` (pure parts only — no browser in tests)

**Interfaces:**
- Consumes: `launchQaBrowser`, `settlePage` from `./qa-browser.mjs`; `puppeteer` package; `isCaptureBlockedBySecurityPage` from `../../src/design/page-capturer`.
- Produces (used by Task 7):
  - `type RawSection = { tag: string; classes: string; top: number; left: number; width: number; height: number; html: string }`
  - `type CapturedSection = RawSection & { index: number; screenshotFile: string }`
  - `type CaptureBundle = { url: string; capturedAt: string; viewport: { width: number; height: number }; pageHeight: number; fullPageFile: string; sections: CapturedSection[] }`
  - `normalizeRawSections(raw: RawSection[], opts?: { maxHtmlLength?: number; minHeight?: number; minWidth?: number }): RawSection[]` (pure: sort by top, size-filter, dedupe identical html, cap html length)
  - `sectionScreenshotFile(index: number): string` → `sections/07.png` style
  - `captureSectionedPage(url: string, outDir: string, opts?: { browserExecutable?: string; settleMs?: number }): Promise<CaptureBundle>`
  - `class CaptureBlockedError extends Error`

**Import contingency:** `isCaptureBlockedBySecurityPage` lives in `src/design/page-capturer.ts` (exported, cheerio-based). Verify importability first: `npx tsx -e "import('./src/design/page-capturer').then(m => console.log(typeof m.isCaptureBlockedBySecurityPage))"` → expect `function`. If that import drags in Worker-only runtime deps and fails, copy the single function (lines 853–~900) into `section-capture.ts` with a comment `// Copied from src/design/page-capturer.ts (Worker module not importable locally)` — do not modify the original.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/section-capture.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeRawSections, sectionScreenshotFile } from './section-capture';

const section = (over: Partial<{ tag: string; classes: string; top: number; left: number; width: number; height: number; html: string }>) => ({
  tag: 'section', classes: '', top: 0, left: 0, width: 1440, height: 400, html: '<section>x</section>', ...over,
});

describe('normalizeRawSections', () => {
  it('sorts by top position', () => {
    const result = normalizeRawSections([section({ top: 900, html: 'b' }), section({ top: 100, html: 'a' })]);
    expect(result.map((s) => s.html)).toEqual(['a', 'b']);
  });

  it('drops sections under the size floor', () => {
    const result = normalizeRawSections([
      section({ height: 30, html: 'small-h' }),
      section({ width: 100, html: 'small-w' }),
      section({ html: 'keep' }),
    ]);
    expect(result.map((s) => s.html)).toEqual(['keep']);
  });

  it('dedupes identical html keeping the first', () => {
    const result = normalizeRawSections([
      section({ top: 10, html: 'same' }),
      section({ top: 500, html: 'same' }),
      section({ top: 900, html: 'other' }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('caps html length', () => {
    const result = normalizeRawSections([section({ html: 'x'.repeat(300_000) })], { maxHtmlLength: 1000 });
    expect(result[0].html).toHaveLength(1000);
  });
});

describe('sectionScreenshotFile', () => {
  it('zero-pads to two digits', () => {
    expect(sectionScreenshotFile(0)).toBe('sections/00.png');
    expect(sectionScreenshotFile(11)).toBe('sections/11.png');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/section-capture.test.ts`
Expected: FAIL — cannot resolve `./section-capture`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/section-capture.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
// @ts-expect-error - untyped ESM helper module
import { launchQaBrowser, settlePage } from './qa-browser.mjs';
import { isCaptureBlockedBySecurityPage } from '../../src/design/page-capturer';

export type RawSection = {
  tag: string;
  classes: string;
  top: number;
  left: number;
  width: number;
  height: number;
  html: string;
};

export type CapturedSection = RawSection & { index: number; screenshotFile: string };

export type CaptureBundle = {
  url: string;
  capturedAt: string;
  viewport: { width: number; height: number };
  pageHeight: number;
  fullPageFile: string;
  sections: CapturedSection[];
};

export class CaptureBlockedError extends Error {}

const VIEWPORT = { width: 1440, height: 900 };
const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const MAX_SECTION_SCREENSHOT_HEIGHT = 2000;

export function normalizeRawSections(
  raw: RawSection[],
  opts: { maxHtmlLength?: number; minHeight?: number; minWidth?: number } = {},
): RawSection[] {
  const maxHtmlLength = opts.maxHtmlLength ?? 200_000;
  const minHeight = opts.minHeight ?? 50;
  const minWidth = opts.minWidth ?? 200;
  const seenHtml = new Set<string>();
  return [...raw]
    .sort((a, b) => a.top - b.top)
    .filter((section) => section.height >= minHeight && section.width >= minWidth)
    .filter((section) => {
      if (seenHtml.has(section.html)) return false;
      seenHtml.add(section.html);
      return true;
    })
    .map((section) => ({ ...section, html: section.html.slice(0, maxHtmlLength) }));
}

export function sectionScreenshotFile(index: number): string {
  return `sections/${String(index).padStart(2, '0')}.png`;
}

export async function captureSectionedPage(
  url: string,
  outDir: string,
  opts: { browserExecutable?: string; settleMs?: number } = {},
): Promise<CaptureBundle> {
  mkdirSync(join(outDir, 'sections'), { recursive: true });
  const browser = await launchQaBrowser(puppeteer, { browserExecutable: opts.browserExecutable });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(SAFARI_UA);
    await page.setViewport(VIEWPORT);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

    // Scroll through the page to trigger lazy-loading (same approach as
    // the Worker's /admin/capture-screenshot route in src/routes/oem-agent.ts).
    await page.evaluate(async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const step = window.innerHeight;
      const maxScroll = document.body.scrollHeight;
      for (let y = 0; y < maxScroll; y += step) {
        window.scrollTo(0, y);
        await delay(300);
      }
      window.scrollTo(0, 0);
      await delay(500);
    });
    await settlePage(page, opts.settleMs ?? 1500);

    const html = await page.content();
    const title = await page.title();
    if (isCaptureBlockedBySecurityPage({ html, title })) {
      throw new CaptureBlockedError(
        `Capture of ${url} hit a security-verification wall. Retry on a normal network with real Chrome.`,
      );
    }

    const fullPageFile = 'full.png';
    await page.screenshot({ path: join(outDir, fullPageFile) as `${string}.png`, fullPage: true, type: 'png' });

    const rawSections = await page.evaluate(() => {
      const selectors = 'section, article, main > div, body > div > div';
      const elements = document.querySelectorAll(selectors);
      const results: Array<{ tag: string; classes: string; top: number; left: number; width: number; height: number; html: string }> = [];
      const seen = new Set<Element>();
      for (const el of elements) {
        const element = el as HTMLElement;
        if (element.offsetHeight < 50 || element.offsetWidth < 200) continue;
        let skip = false;
        for (const s of seen) { if (s.contains(el) && s !== el) { skip = true; break; } }
        if (skip) continue;
        seen.add(el);
        const rect = element.getBoundingClientRect();
        results.push({
          tag: element.tagName.toLowerCase(),
          classes: String(element.className || ''),
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: element.offsetWidth,
          height: element.offsetHeight,
          html: element.outerHTML,
        });
      }
      return results;
    });

    const normalized = normalizeRawSections(rawSections);
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);

    const sections: CapturedSection[] = [];
    for (let index = 0; index < normalized.length; index += 1) {
      const section = normalized[index];
      const screenshotFile = sectionScreenshotFile(index);
      await page.screenshot({
        path: join(outDir, screenshotFile) as `${string}.png`,
        type: 'png',
        clip: {
          x: Math.max(0, section.left),
          y: Math.max(0, section.top),
          width: Math.min(section.width, VIEWPORT.width),
          height: Math.min(section.height, MAX_SECTION_SCREENSHOT_HEIGHT),
        },
      });
      sections.push({ ...section, index, screenshotFile });
    }

    const bundle: CaptureBundle = {
      url,
      capturedAt: new Date().toISOString(),
      viewport: VIEWPORT,
      pageHeight,
      fullPageFile,
      sections,
    };
    writeFileSync(join(outDir, 'sections.json'), `${JSON.stringify(bundle, null, 2)}\n`);
    return bundle;
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: Verify the page-capturer import works locally**

Run: `npx tsx -e "import('./src/design/page-capturer').then(m => console.log(typeof m.isCaptureBlockedBySecurityPage))"`
Expected: `function`. If it errors on Worker-only imports, apply the contingency in the Interfaces block (copy the function), re-run Step 5's tests, and note the deviation in your report.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run scripts/lib/section-capture.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/section-capture.ts scripts/lib/section-capture.test.ts
git commit -m "feat(composer): local real-chrome section capture with bboxes and crops

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Assembly + report (`scripts/lib/composer-assembly.ts`)

**Files:**
- Create: `scripts/lib/composer-assembly.ts`
- Test: `scripts/lib/composer-assembly.test.ts`

**Interfaces:**
- Consumes: `SectionMatch` from `./preset-matcher`, `Extraction` from `./prop-extractor`, `CapturedSection` from `./section-capture`, `CatalogPreset` from `./catalog`.
- Produces (used by Task 7):
  - `type SectionPlan = { section: CapturedSection; match: SectionMatch; preset: CatalogPreset | null; extraction: Extraction | null }`
  - `assembleDocument(plans: SectionPlan[]): Record<string, unknown>` — builder document per the Global Constraints shape; matched → `{id: '<presetType>-s<index>', type: preset.type, label: preset.name, props: extraction.props, settings: {}}`; unmatched → `{id: 'legacy-s<index>', type: 'legacy_html', label: 'Unmatched section <index>', props: {html: section.html}, settings: {}}`.
  - `buildReport(input: { url: string; capturedAt: string; minConfidence: number; plans: SectionPlan[] }): { json: Record<string, unknown>; markdown: string }` — json carries `{url, capturedAt, minConfidence, totalSections, matchedSections, matchRate, sections: [{index, presetId, presetName, confidence, filledRatio, missingProps, matchError?}]}`; markdown carries an H1, the metric lines (`Matched: X/Y (Z%)`), and a table row per section.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/composer-assembly.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CatalogPreset } from './catalog';
import { assembleDocument, buildReport, type SectionPlan } from './composer-assembly';

const HERO_PRESET: CatalogPreset = {
  id: 'hero-standard', type: 'hero', categoryId: 'content', categoryLabel: 'Toyota',
  name: 'Toyota Hero', description: '', propSchema: { heading: { type: 'string' } },
  demoProps: {}, screenshotPath: 's/h.png',
};

const capturedSection = (index: number, html: string) => ({
  index, tag: 'section', classes: '', top: index * 500, left: 0, width: 1440, height: 480,
  html, screenshotFile: `sections/0${index}.png`,
});

const matchedPlan: SectionPlan = {
  section: capturedSection(0, '<section><h1>RAV4</h1></section>'),
  match: { presetId: 'hero-standard', confidence: 0.9, runnersUp: [], reason: 'hero' },
  preset: HERO_PRESET,
  extraction: { props: { heading: 'RAV4' }, filledRatio: 1, missing: [] },
};

const unmatchedPlan: SectionPlan = {
  section: capturedSection(1, '<section class="weird">???</section>'),
  match: { presetId: null, confidence: 0.2, runnersUp: [], reason: 'nothing fits' },
  preset: null,
  extraction: null,
};

describe('assembleDocument', () => {
  const doc = assembleDocument([matchedPlan, unmatchedPlan]) as {
    version: number; templateKey: null; layout: Record<string, string>;
    sections: Array<Record<string, unknown>>;
  };

  it('produces the builder document envelope', () => {
    expect(doc.version).toBe(1);
    expect(doc.templateKey).toBeNull();
    expect(doc.layout).toEqual({
      width: 'contained', spacing: 'standard', backgroundColor: '#ffffff', textColor: '#111111',
    });
  });

  it('maps matched sections to typed builder sections in order', () => {
    expect(doc.sections[0]).toMatchObject({
      id: 'hero-s0', type: 'hero', label: 'Toyota Hero', props: { heading: 'RAV4' }, settings: {},
    });
  });

  it('maps unmatched sections to legacy_html carriers with the captured html', () => {
    expect(doc.sections[1]).toMatchObject({
      id: 'legacy-s1', type: 'legacy_html',
      props: { html: '<section class="weird">???</section>' },
    });
  });
});

describe('buildReport', () => {
  const report = buildReport({
    url: 'https://www.toyota.com.au/rav4', capturedAt: '2026-07-05T00:00:00Z',
    minConfidence: 0.5, plans: [matchedPlan, unmatchedPlan],
  });

  it('computes match metrics', () => {
    expect(report.json).toMatchObject({ totalSections: 2, matchedSections: 1, matchRate: 0.5 });
  });

  it('lists per-section rows including the unmatched one', () => {
    const rows = (report.json as { sections: Array<Record<string, unknown>> }).sections;
    expect(rows[0]).toMatchObject({ index: 0, presetId: 'hero-standard', filledRatio: 1 });
    expect(rows[1]).toMatchObject({ index: 1, presetId: null });
  });

  it('renders markdown with the headline metric and one table row per section', () => {
    expect(report.markdown).toContain('Matched: 1/2 (50%)');
    expect(report.markdown).toContain('hero-standard');
    expect(report.markdown).toContain('legacy_html');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/composer-assembly.test.ts`
Expected: FAIL — cannot resolve `./composer-assembly`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/composer-assembly.ts`:

```ts
import type { CatalogPreset } from './catalog';
import type { Extraction } from './prop-extractor';
import type { SectionMatch } from './preset-matcher';
import type { CapturedSection } from './section-capture';

export type SectionPlan = {
  section: CapturedSection;
  match: SectionMatch;
  preset: CatalogPreset | null;
  extraction: Extraction | null;
};

export function assembleDocument(plans: SectionPlan[]): Record<string, unknown> {
  const sections = plans.map((plan) => {
    if (plan.preset && plan.extraction) {
      return {
        id: `${plan.preset.type}-s${plan.section.index}`,
        type: plan.preset.type,
        label: plan.preset.name,
        props: plan.extraction.props,
        settings: {},
      };
    }
    return {
      id: `legacy-s${plan.section.index}`,
      type: 'legacy_html',
      label: `Unmatched section ${plan.section.index}`,
      props: { html: plan.section.html },
      settings: {},
    };
  });

  return {
    version: 1,
    templateKey: null,
    layout: { width: 'contained', spacing: 'standard', backgroundColor: '#ffffff', textColor: '#111111' },
    sections,
  };
}

export function buildReport(input: {
  url: string;
  capturedAt: string;
  minConfidence: number;
  plans: SectionPlan[];
}): { json: Record<string, unknown>; markdown: string } {
  const rows = input.plans.map((plan) => ({
    index: plan.section.index,
    presetId: plan.match.presetId,
    presetName: plan.preset?.name ?? null,
    confidence: plan.match.confidence,
    filledRatio: plan.extraction?.filledRatio ?? null,
    missingProps: plan.extraction?.missing ?? [],
    matchReason: plan.match.reason,
    ...(plan.match.error ? { matchError: plan.match.error } : {}),
  }));

  const matched = rows.filter((row) => row.presetId !== null).length;
  const total = rows.length;
  const matchRate = total === 0 ? 0 : matched / total;

  const json = {
    url: input.url,
    capturedAt: input.capturedAt,
    minConfidence: input.minConfidence,
    totalSections: total,
    matchedSections: matched,
    matchRate,
    sections: rows,
  };

  const tableRows = rows.map((row) => {
    const preset = row.presetId ? `${row.presetId}` : '**legacy_html** (no match)';
    const fill = row.filledRatio === null ? '—' : `${Math.round(row.filledRatio * 100)}%`;
    const missing = row.missingProps.length ? row.missingProps.join(', ') : '—';
    return `| ${row.index} | ${preset} | ${row.confidence.toFixed(2)} | ${fill} | ${missing} |`;
  });

  const markdown = [
    `# Composer report — ${input.url}`,
    '',
    `Captured: ${input.capturedAt} · Min confidence: ${input.minConfidence}`,
    '',
    `Matched: ${matched}/${total} (${Math.round(matchRate * 100)}%)`,
    '',
    '| # | Preset | Confidence | Props filled | Missing |',
    '| --- | --- | --- | --- | --- |',
    ...tableRows,
    '',
  ].join('\n');

  return { json, markdown };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/composer-assembly.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/composer-assembly.ts scripts/lib/composer-assembly.test.ts
git commit -m "feat(composer): document assembly and proof-metric report builder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Orchestrator CLI (`scripts/compose-toyota-page.ts`)

**Files:**
- Create: `scripts/compose-toyota-page.ts`
- Test: `scripts/compose-toyota-page.test.ts` (arg parsing only)

**Interfaces:**
- Consumes every prior task's exports plus `timestampForPath` from `./lib/qa-browser.mjs`.
- Produces: the CLI. Exit codes: `0` ok, `2` capture blocked, `3` zero sections, `4` CMS post failed, `1` other. Artifacts under `artifacts/composer/<slug>-<timestamp>/`.

- [ ] **Step 1: Write the failing test**

Create `scripts/compose-toyota-page.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseComposerArgs } from './compose-toyota-page';

describe('parseComposerArgs', () => {
  it('applies defaults', () => {
    const args = parseComposerArgs(['--url', 'https://www.toyota.com.au/rav4']);
    expect(args).toMatchObject({
      url: 'https://www.toyota.com.au/rav4',
      catalogDir: '/Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt/catalog',
      cmsUrl: 'http://localhost:3000',
      post: false,
      minConfidence: 0.5,
      aiExtract: false,
      from: '',
    });
  });

  it('honours overrides', () => {
    const args = parseComposerArgs([
      '--url', 'https://x', '--catalog', '/tmp/cat', '--cms-url', 'http://cms:4000',
      '--post', '--min-confidence', '0.7', '--ai-extract', '--title', 'T', '--slug', 's',
    ]);
    expect(args).toMatchObject({
      catalogDir: '/tmp/cat', cmsUrl: 'http://cms:4000', post: true,
      minConfidence: 0.7, aiExtract: true, title: 'T', slug: 's',
    });
  });

  it('accepts --from instead of --url', () => {
    const args = parseComposerArgs(['--from', 'artifacts/composer/run-1']);
    expect(args.from).toBe('artifacts/composer/run-1');
  });

  it('throws when neither --url nor --from is given', () => {
    expect(() => parseComposerArgs([])).toThrow(/--url or --from/);
  });

  it('throws on invalid --min-confidence', () => {
    expect(() => parseComposerArgs(['--url', 'x', '--min-confidence', 'nope'])).toThrow(/min-confidence/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/compose-toyota-page.test.ts`
Expected: FAIL — cannot resolve `./compose-toyota-page`.

- [ ] **Step 3: Write the implementation**

Create `scripts/compose-toyota-page.ts`:

```ts
#!/usr/bin/env node
/**
 * Composer CLI (block-composition Slice 2).
 *
 * Captures a Toyota page with local real Chrome, segments it, vision-matches
 * each section against the toyota-theme-nuxt catalog (Kimi K2.5 via Together),
 * extracts props from the DOM, and assembles a draft CmsPageBuilderDocument.
 * Dry-run by default; --post creates the draft via the CMS admin API.
 *
 * Usage:
 *   npx tsx scripts/compose-toyota-page.ts --url https://www.toyota.com.au/rav4
 *   npx tsx scripts/compose-toyota-page.ts --from artifacts/composer/<run>  # reuse capture
 *   ... --post   (requires CMS_ADMIN_EMAIL / CMS_ADMIN_PASSWORD env)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exemplarAbsolutePath, loadCatalog, type LoadedCatalog } from './lib/catalog';
import { createDraftPage, loginToCms } from './lib/cms-client';
import { assembleDocument, buildReport, type SectionPlan } from './lib/composer-assembly';
import { aiExtractProps, extractProps, type Extraction } from './lib/prop-extractor';
import { matchSection, type ExemplarImage } from './lib/preset-matcher';
import {
  CaptureBlockedError,
  captureSectionedPage,
  type CaptureBundle,
} from './lib/section-capture';
// @ts-expect-error - untyped ESM helper module
import { timestampForPath } from './lib/qa-browser.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export type ComposerArgs = {
  url: string;
  from: string;
  catalogDir: string;
  cmsUrl: string;
  post: boolean;
  minConfidence: number;
  aiExtract: boolean;
  title: string;
  slug: string;
};

export function parseComposerArgs(argv: string[]): ComposerArgs {
  const value = (flag: string): string => {
    const index = argv.indexOf(flag);
    if (index === -1) return '';
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`${flag} requires a value`);
    return next;
  };

  const args: ComposerArgs = {
    url: value('--url'),
    from: value('--from'),
    catalogDir: value('--catalog') || '/Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt/catalog',
    cmsUrl: value('--cms-url') || 'http://localhost:3000',
    post: argv.includes('--post'),
    minConfidence: 0.5,
    aiExtract: argv.includes('--ai-extract'),
    title: value('--title'),
    slug: value('--slug'),
  };

  const rawConfidence = value('--min-confidence');
  if (rawConfidence) {
    const parsed = Number(rawConfidence);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new Error(`--min-confidence must be a number in [0,1], got: ${rawConfidence}`);
    }
    args.minConfidence = parsed;
  }

  if (!args.url && !args.from) throw new Error('Provide --url <page> or --from <previous run dir>');
  return args;
}

async function main(): Promise<number> {
  try {
    process.loadEnvFile(join(REPO_ROOT, '.env'));
  } catch {
    // .env optional; env may come from the shell
  }

  const args = parseComposerArgs(process.argv.slice(2));
  const apiKey = process.env.TOGETHER_API_KEY || '';
  if (!apiKey) {
    console.error('TOGETHER_API_KEY is not set (expected in oem-agent/.env)');
    return 1;
  }

  const catalog = await loadCatalog(args.catalogDir);
  console.log(`Catalog: ${catalog.presets.length} presets from ${catalog.dir}`);

  // --- capture (or replay) ---
  let bundle: CaptureBundle;
  let captureDir: string;
  const runDir = join(REPO_ROOT, 'artifacts', 'composer', `${runSlug(args)}-${timestampForPath()}`);
  mkdirSync(runDir, { recursive: true });

  if (args.from) {
    captureDir = resolve(args.from.startsWith('/') ? args.from : join(REPO_ROOT, args.from), 'capture');
    bundle = JSON.parse(readFileSync(join(captureDir, 'sections.json'), 'utf8')) as CaptureBundle;
    console.log(`Replaying capture from ${captureDir} (${bundle.sections.length} sections)`);
  } else {
    captureDir = join(runDir, 'capture');
    try {
      bundle = await captureSectionedPage(args.url, captureDir);
    } catch (error) {
      if (error instanceof CaptureBlockedError) {
        console.error(error.message);
        return 2;
      }
      throw error;
    }
    console.log(`Captured ${bundle.sections.length} sections from ${args.url}`);
  }

  if (bundle.sections.length === 0) {
    console.error('Zero sections detected — capture bundle retained for inspection.');
    return 3;
  }

  // --- match + extract ---
  const exemplars: ExemplarImage[] = catalog.presets.map((preset) => ({
    presetId: preset.id,
    base64: readFileSync(exemplarAbsolutePath(catalog, preset)).toString('base64'),
  }));

  const plans: SectionPlan[] = [];
  for (const section of bundle.sections) {
    const sectionBase64 = readFileSync(join(captureDir, section.screenshotFile)).toString('base64');
    const match = await matchSection({ sectionBase64, exemplars, catalog, apiKey });
    const accepted = match.presetId !== null && match.confidence >= args.minConfidence;
    const preset = accepted ? catalog.presets.find((entry) => entry.id === match.presetId) ?? null : null;

    let extraction: Extraction | null = null;
    if (preset) {
      extraction = extractProps(section.html, preset, bundle.url);
      if (args.aiExtract && extraction.filledRatio < 0.5) {
        try {
          const aiExtraction = await aiExtractProps({
            sectionHtml: section.html, preset, sourceUrl: bundle.url, apiKey,
          });
          if (aiExtraction.filledRatio > extraction.filledRatio) extraction = aiExtraction;
        } catch (error) {
          console.warn(`  ai-extract failed for section ${section.index}: ${(error as Error).message}`);
        }
      }
    }

    const effectiveMatch = accepted ? match : { ...match, presetId: null };
    plans.push({ section, match: effectiveMatch, preset, extraction });
    const verdict = preset ? `${preset.id} (${match.confidence.toFixed(2)})` : `no match (${match.confidence.toFixed(2)})`;
    console.log(`  section ${section.index}: ${verdict}`);
  }

  // --- assemble + report ---
  const document = assembleDocument(plans);
  const report = buildReport({
    url: bundle.url, capturedAt: bundle.capturedAt, minConfidence: args.minConfidence, plans,
  });
  writeFileSync(join(runDir, 'document.json'), `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(join(runDir, 'report.json'), `${JSON.stringify(report.json, null, 2)}\n`);
  writeFileSync(join(runDir, 'report.md'), report.markdown);
  console.log(`\n${report.markdown}`);
  console.log(`Artifacts: ${runDir}`);

  // --- post (opt-in) ---
  if (args.post) {
    const email = process.env.CMS_ADMIN_EMAIL || '';
    const password = process.env.CMS_ADMIN_PASSWORD || '';
    if (!email || !password) {
      console.error('--post requires CMS_ADMIN_EMAIL and CMS_ADMIN_PASSWORD env vars');
      return 4;
    }
    try {
      const session = await loginToCms(args.cmsUrl, email, password);
      const pagePath = new URL(bundle.url).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'page';
      const result = await createDraftPage(session, {
        title: args.title || `Composed: ${pagePath}`,
        slug: args.slug || `composed-${pagePath}`,
        content: document,
      });
      writeFileSync(join(runDir, 'post-result.json'), `${JSON.stringify(result, null, 2)}\n`);
      console.log(`Draft created in CMS: ${JSON.stringify(result).slice(0, 200)}`);
    } catch (error) {
      console.error((error as Error).message);
      return 4;
    }
  } else {
    console.log('Dry run (no --post): document.json written, nothing sent to the CMS.');
  }

  return 0;
}

function runSlug(args: ComposerArgs): string {
  if (args.url) {
    try {
      return new URL(args.url).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'page';
    } catch {
      return 'page';
    }
  }
  return 'replay';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/compose-toyota-page.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Run the full composer test set**

Run: `npx vitest run scripts/lib/catalog.test.ts scripts/lib/cms-client.test.ts scripts/lib/prop-extractor.test.ts scripts/lib/preset-matcher.test.ts scripts/lib/section-capture.test.ts scripts/lib/composer-assembly.test.ts scripts/compose-toyota-page.test.ts`
Expected: all PASS (4+5+10+8+5+6+5 = 43 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/compose-toyota-page.ts scripts/compose-toyota-page.test.ts
git commit -m "feat(composer): compose-toyota-page orchestrator cli — dry-run default

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Proof-experiment dry run + docs

**Files:**
- Create: `docs/COMPOSER-CLI.md`
- Modify: `docs/superpowers/specs/2026-07-05-block-composition-addendum.md` (status line only)

- [ ] **Step 1: Live dry run against the RAV4 page**

Run (real Chrome + network + Together API; takes a few minutes):

```bash
cd /Users/paulgiurin/Documents/Projects/oem-agent
npx tsx scripts/compose-toyota-page.ts --url https://www.toyota.com.au/rav4
```

Expected: capture succeeds (no security-wall exit 2), N sections logged with per-section verdicts, `report.md` printed with `Matched: X/N (…%)`, artifacts dir created containing `capture/full.png`, `capture/sections/*.png`, `capture/sections.json`, `document.json`, `report.json`, `report.md`. Record X/N in your report. If the security wall blocks capture, retry once; if still blocked, report BLOCKED with the error output — do not fake artifacts.

- [ ] **Step 2: Sanity-check artifacts**

Read (as images) `capture/full.png` and two section crops; confirm they show real RAV4 page content. Open `document.json` and confirm: version 1 envelope, sections in order, matched sections carry extracted props (headings/urls from toyota.com.au), unmatched carry `legacy_html` with html.

- [ ] **Step 3: Write docs/COMPOSER-CLI.md**

```markdown
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
```

- [ ] **Step 4: Update the addendum status line**

In `docs/superpowers/specs/2026-07-05-block-composition-addendum.md` change:

from
```markdown
**Date:** 2026-07-05 · **Status:** Approved direction; Slice 1 (catalog generator) shipped in toyota-theme-nuxt branch feat/cms-catalog-slice1; proof experiment pending Slice 2
```
to
```markdown
**Date:** 2026-07-05 · **Status:** Approved direction; Slice 1 shipped (toyota-theme-nuxt); Slice 2 composer CLI shipped (oem-agent feat/composer-cli-slice2); proof experiment: dry-run executed, --post pending operator run
```

- [ ] **Step 5: Commit**

```bash
git add docs/COMPOSER-CLI.md docs/superpowers/specs/2026-07-05-block-composition-addendum.md
git commit -m "docs(composer): cli usage guide + slice 2 status

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Full verification sweep — controller

- [ ] Run all composer tests: command from Task 7 Step 5 — expect 43/43 PASS.
- [ ] `git log --oneline main..feat/composer-cli-slice2` — expect 8 commits (Tasks 1–8).
- [ ] `git status --short` — expect clean apart from `artifacts/composer/` run output (commit the proof-run artifacts dir if small enough, else leave untracked — artifacts/ is git-tracked by convention; commit `report.md`, `report.json`, `document.json` and `capture/sections.json` but NOT PNGs: `git add artifacts/composer/<run>/report.* artifacts/composer/<run>/document.json artifacts/composer/<run>/capture/sections.json` then commit as `chore(composer): rav4 proof-run report`).
