# Clone Capture Stylesheet Link Attributes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve safe stylesheet `<link>` attributes during Worker clone capture.

**Architecture:** Extend `stylesheetLinkTag()` to copy a fixed allowlist of optional attributes from original stylesheet link tags while normalizing `rel` and absolutizing `href`. Update the in-browser DOM capture script to serialize actual stylesheet link elements before using `document.styleSheets` as a URL-only fallback.

**Tech Stack:** TypeScript, Cheerio, Puppeteer-in-Worker DOM evaluation, Vitest, Cloudflare Worker deploy.

---

### Task 1: Add Failing Stylesheet Attribute Tests

**Files:**
- Modify: `src/design/page-capturer.test.ts`

- [ ] **Step 1: Add external capture stylesheet attribute tests**

Add this block after the existing `it('converts externally rendered HTML into a normalized DOM capture', ...)` test in `src/design/page-capturer.test.ts`:

```ts
  it('preserves safe stylesheet link attributes in external captures', () => {
    const result = buildDomCaptureFromHtml({
      html: `
        <!doctype html>
        <html>
          <head>
            <title>RAV4</title>
            <link
              rel="stylesheet"
              href="/assets/desktop.css?rev=1"
              media="screen and (min-width: 1024px)"
              crossorigin="anonymous"
              integrity="sha384-test"
              referrerpolicy="no-referrer"
              onload="alert(1)"
              data-track="drop-me"
            >
          </head>
          <body>
            <main>
              <h1>RAV4</h1>
              <p>${'Hybrid SUV. '.repeat(120)}</p>
            </main>
          </body>
        </html>
      `,
    }, 'https://www.toyota.com.au/rav4')

    if ('bot_blocked' in result)
      throw new Error('Expected external capture to succeed')

    expect(result.stylesheetLinks).toContain('<link rel="stylesheet" href="https://www.toyota.com.au/assets/desktop.css?rev=1" media="screen and (min-width: 1024px)" crossorigin="anonymous" integrity="sha384-test" referrerpolicy="no-referrer">')
    expect(result.stylesheetLinks.join('\n')).not.toContain('onload=')
    expect(result.stylesheetLinks.join('\n')).not.toContain('data-track')
  })
```

- [ ] **Step 2: Add browser capture source wiring test**

Add this block near the other source-level `PageCapturer ... wiring` tests in `src/design/page-capturer.test.ts`:

```ts
describe('PageCapturer stylesheet link attribute wiring', () => {
  it('collects real stylesheet link elements before document.styleSheets fallback', () => {
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const phaseC = source.indexOf('// ====== Phase C: Collect external stylesheets ======')
    const linkQuery = source.indexOf('document.querySelectorAll(\'link[rel~="stylesheet"]\')', phaseC)
    const mediaAttr = source.indexOf('link.getAttribute(\'media\')', linkQuery)
    const crossoriginAttr = source.indexOf('link.getAttribute(\'crossorigin\')', linkQuery)
    const integrityAttr = source.indexOf('link.getAttribute(\'integrity\')', linkQuery)
    const referrerPolicyAttr = source.indexOf('link.getAttribute(\'referrerpolicy\')', linkQuery)
    const styleSheetFallback = source.indexOf('for (const sheet of document.styleSheets)', phaseC)

    expect(phaseC).toBeGreaterThan(-1)
    expect(linkQuery).toBeGreaterThan(phaseC)
    expect(mediaAttr).toBeGreaterThan(linkQuery)
    expect(crossoriginAttr).toBeGreaterThan(mediaAttr)
    expect(integrityAttr).toBeGreaterThan(crossoriginAttr)
    expect(referrerPolicyAttr).toBeGreaterThan(integrityAttr)
    expect(styleSheetFallback).toBeGreaterThan(referrerPolicyAttr)
  })
})
```

- [ ] **Step 3: Run focused tests to verify RED**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: FAIL because stylesheet attributes are not preserved and browser capture still reads `document.styleSheets` first.

### Task 2: Preserve Stylesheet Attributes in Capture

**Files:**
- Modify: `src/design/page-capturer.ts`

- [ ] **Step 1: Add optional attribute allowlist and extraction helper**

In `src/design/page-capturer.ts`, add this constant after `escapeHtmlAttribute()`:

```ts
const SAFE_STYLESHEET_LINK_ATTRS = ['media', 'crossorigin', 'integrity', 'referrerpolicy'] as const;
```

Add this helper after `extractStylesheetHref()`:

```ts
function extractHtmlAttribute(tag: string, attrName: string): string | null {
  const escapedName = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));

  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}
```

- [ ] **Step 2: Update `stylesheetLinkTag()`**

Replace the final return in `stylesheetLinkTag()`:

```ts
  return `<link rel="stylesheet" href="${escapeHtmlAttribute(absoluteHref)}">`;
```

with:

```ts
  const attrs = [
    ['rel', 'stylesheet'],
    ['href', absoluteHref],
  ];

  if (trimmed.startsWith('<')) {
    for (const attrName of SAFE_STYLESHEET_LINK_ATTRS) {
      const value = extractHtmlAttribute(trimmed, attrName);
      if (value != null)
        attrs.push([attrName, value]);
    }
  }

  return `<link ${attrs.map(([name, value]) => `${name}="${escapeHtmlAttribute(value)}"`).join(' ')}>`;
```

- [ ] **Step 3: Pass original external capture link tags into `stylesheetLinkTag()`**

In `buildDomCaptureFromHtml()`, update the Cheerio stylesheet link loop so it passes the serialized `<link>` element when available, preserving the safe attributes from source HTML:

```ts
  $('link[rel~="stylesheet"]').each((_idx, node) => {
    const href = $(node).attr('href') || '';
    const linkHtml = $.html(node);
    const tag = stylesheetLinkTag(linkHtml || href, sourceUrl);
    const absoluteHref = tag ? extractStylesheetHref(tag) : null;
    if (tag && absoluteHref)
      stylesheetLinks.set(absoluteHref, tag);
  });
```

- [ ] **Step 4: Update browser capture stylesheet collection**

Inside the `page.evaluate(() => { ... })` Phase C block in `captureDom()`, replace the stylesheet collection block:

```ts
        const seenHrefs = new Set<string>();
        const stylesheetLinks: string[] = [];

        for (const sheet of document.styleSheets) {
          if (sheet.href && !seenHrefs.has(sheet.href)) {
            seenHrefs.add(sheet.href);
            stylesheetLinks.push(`<link rel="stylesheet" href="${sheet.href}">`);
          }
        }
        document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
          const href = (link as HTMLLinkElement).href;
          if (href && href.startsWith('http') && !seenHrefs.has(href)) {
            seenHrefs.add(href);
            stylesheetLinks.push(`<link rel="stylesheet" href="${href}">`);
          }
        });
```

with:

```ts
        const seenHrefs = new Set<string>();
        const stylesheetLinks: string[] = [];

        function escapeAttr(value: string): string {
          return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        }

        function stylesheetLinkTagFromElement(link: HTMLLinkElement): string {
          const href = link.href;
          if (!href || !href.startsWith('http')) return '';

          const attrs = [
            ['rel', 'stylesheet'],
            ['href', href],
          ];
          for (const attrName of ['media', 'crossorigin', 'integrity', 'referrerpolicy']) {
            const value = link.getAttribute(attrName);
            if (value != null)
              attrs.push([attrName, value]);
          }

          return '<link ' + attrs.map(([name, value]) => name + '="' + escapeAttr(value) + '"').join(' ') + '>';
        }

        document.querySelectorAll('link[rel~="stylesheet"]').forEach(link => {
          const tag = stylesheetLinkTagFromElement(link as HTMLLinkElement);
          const href = (link as HTMLLinkElement).href;
          if (tag && href && !seenHrefs.has(href)) {
            seenHrefs.add(href);
            stylesheetLinks.push(tag);
          }
        });
        for (const sheet of document.styleSheets) {
          if (sheet.href && !seenHrefs.has(sheet.href)) {
            seenHrefs.add(sheet.href);
            stylesheetLinks.push(`<link rel="stylesheet" href="${escapeAttr(sheet.href)}">`);
          }
        }
```

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: PASS.

### Task 3: Full Verification, Commit, Push, Deploy

**Files:**
- Verify: `src/design/page-capturer.ts`
- Verify: `src/design/page-capturer.test.ts`
- Verify: `docs/superpowers/specs/2026-06-05-clone-capture-stylesheet-link-attributes-design.md`
- Verify: `docs/superpowers/plans/2026-06-05-clone-capture-stylesheet-link-attributes.md`

- [ ] **Step 1: Run full tests**

Run:

```bash
npx vitest run
```

Expected: all test files pass.

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Check patch hygiene**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add src/design/page-capturer.ts src/design/page-capturer.test.ts docs/superpowers/plans/2026-06-05-clone-capture-stylesheet-link-attributes.md
git commit -m "fix(capture): preserve stylesheet link attributes"
```

Expected: commit created on `main`.

- [ ] **Step 5: Push**

Run:

```bash
git push
```

Expected: `main` pushes to `origin/main`.

- [ ] **Step 6: Deploy Worker**

Run:

```bash
pnpm run deploy
```

Expected: Cloudflare Worker deployment completes and prints a version ID.

- [ ] **Step 7: Verify live Worker**

Run:

```bash
curl -I https://oem-agent.adme-dev.workers.dev
```

Expected: HTTP 200.
