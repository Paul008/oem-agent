# Clone Capture Lazy Media Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve common relative lazy media URLs before clone capture scrolls and waits for images.

**Architecture:** Extract Phase 0 lazy-media activation into a browser-safe `activateLazyMediaForCapture()` helper in `src/design/page-capturer.ts`. The helper is directly unit tested with a fake document, then called via `page.evaluate()` after hidden panel activation and before the adaptive scroll sweep.

**Tech Stack:** TypeScript, Puppeteer-in-Worker `page.evaluate`, Vitest, Cloudflare Worker deploy.

---

### Task 1: Add Failing Lazy Media Activation Tests

**Files:**
- Modify: `src/design/page-capturer.test.ts`

- [ ] **Step 1: Extend the import list**

In `src/design/page-capturer.test.ts`, add `activateLazyMediaForCapture` to the import from `./page-capturer`:

```ts
  activateLazyMediaForCapture,
  buildDomCaptureFromHtml,
```

- [ ] **Step 2: Add fake DOM helpers**

Add these helpers below the existing import block and above `createScrollSweepWindow()`:

```ts
function createLazyMediaElement(attrs: Record<string, string> = {}, props: { loading?: string } = {}) {
  const element: any = {
    attrs: { ...attrs },
    removedAttrs: [] as string[],
    style: {},
    loading: props.loading,
    getAttribute(name: string) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null
    },
    setAttribute(name: string, value: string) {
      this.attrs[name] = value
      if (name === 'src')
        this.src = value
      if (name === 'srcset')
        this.srcset = value
    },
    removeAttribute(name: string) {
      this.removedAttrs.push(name)
      delete this.attrs[name]
    },
  }

  return element
}

function createLazyMediaDocument(input: {
  href?: string;
  images?: any[];
  srcsetElements?: any[];
  backgroundElements?: any[];
}) {
  return {
    location: {
      href: input.href ?? 'https://www.toyota.com.au/rav4',
      origin: 'https://www.toyota.com.au',
    },
    querySelectorAll(selector: string) {
      if (selector === 'img')
        return input.images ?? []
      if (selector === 'img[data-srcset], source[data-srcset]')
        return input.srcsetElements ?? []
      if (selector === '[data-bg], [data-background-image]')
        return input.backgroundElements ?? []

      return []
    },
  }
}
```

- [ ] **Step 3: Add helper behavior tests**

Add this `describe` block after the fake DOM helpers and before `describe('sweepCaptureScrollForCapture', ...)`:

```ts
describe('activateLazyMediaForCapture', () => {
  it('resolves relative image lazy sources before scrolling', () => {
    const rootRelative = createLazyMediaElement({ 'data-src': '/-/media/rav4.jpg' })
    const pageRelative = createLazyMediaElement({ 'data-lazy-src': 'assets/detail.jpg' })
    const absolute = createLazyMediaElement({ 'data-original': 'https://cdn.example.test/hero.jpg' })
    const dataUrl = createLazyMediaElement({ 'data-lazy': 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' })
    const doc = createLazyMediaDocument({
      images: [rootRelative, pageRelative, absolute, dataUrl],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.imageSources).toBe(4)
    expect(rootRelative.src).toBe('https://www.toyota.com.au/-/media/rav4.jpg')
    expect(rootRelative.removedAttrs).toContain('data-src')
    expect(pageRelative.src).toBe('https://www.toyota.com.au/assets/detail.jpg')
    expect(pageRelative.removedAttrs).toContain('data-lazy-src')
    expect(absolute.src).toBe('https://cdn.example.test/hero.jpg')
    expect(dataUrl.src).toBe('data:image/gif;base64,R0lGODlhAQABAAAAACw=')
  })

  it('normalizes relative srcset candidates while preserving descriptors', () => {
    const img = createLazyMediaElement({
      'data-srcset': '/-/media/rav4.jpg 1x, assets/rav4-2x.jpg 2x',
    })
    const source = createLazyMediaElement({
      'data-srcset': '//cdn.example.test/mobile.jpg 480w, /-/media/mobile-large.jpg 960w',
    })
    const doc = createLazyMediaDocument({
      srcsetElements: [img, source],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.sourceSets).toBe(2)
    expect(img.srcset).toBe('https://www.toyota.com.au/-/media/rav4.jpg 1x, https://www.toyota.com.au/assets/rav4-2x.jpg 2x')
    expect(source.srcset).toBe('https://cdn.example.test/mobile.jpg 480w, https://www.toyota.com.au/-/media/mobile-large.jpg 960w')
    expect(img.removedAttrs).toContain('data-srcset')
    expect(source.removedAttrs).toContain('data-srcset')
  })

  it('resolves lazy background image attributes before scrolling', () => {
    const bg = createLazyMediaElement({ 'data-bg': '/-/media/background.jpg' })
    const backgroundImage = createLazyMediaElement({ 'data-background-image': 'assets/feature.jpg' })
    const doc = createLazyMediaDocument({
      backgroundElements: [bg, backgroundImage],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.backgrounds).toBe(2)
    expect(bg.style.backgroundImage).toBe('url("https://www.toyota.com.au/-/media/background.jpg")')
    expect(backgroundImage.style.backgroundImage).toBe('url("https://www.toyota.com.au/assets/feature.jpg")')
    expect(bg.removedAttrs).toContain('data-bg')
    expect(backgroundImage.removedAttrs).toContain('data-background-image')
  })

  it('forces lazy images to eager and counts only changed images', () => {
    const lazy = createLazyMediaElement({}, { loading: 'lazy' })
    const eager = createLazyMediaElement({}, { loading: 'eager' })
    const doc = createLazyMediaDocument({
      images: [lazy, eager],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.eagerImages).toBe(1)
    expect(lazy.loading).toBe('eager')
    expect(eager.loading).toBe('eager')
  })
})
```

- [ ] **Step 4: Update the readiness wiring source test**

In `describe('PageCapturer readiness wiring', ...)`, add the lazy activation source-order check before the existing scroll sweep check:

```ts
    const lazyActivation = source.indexOf('page.evaluate(activateLazyMediaForCapture as any)')
    const scrollSweep = source.indexOf('page.evaluate(sweepCaptureScrollForCapture as any')
```

Add these expectations before the existing `expect(scrollSweep).toBeGreaterThan(-1)`:

```ts
    expect(lazyActivation).toBeGreaterThan(-1)
    expect(scrollSweep).toBeGreaterThan(lazyActivation)
```

- [ ] **Step 5: Run focused tests to verify RED**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: FAIL because `activateLazyMediaForCapture` is not exported and the capture flow does not call it yet.

### Task 2: Implement Lazy Media Activation

**Files:**
- Modify: `src/design/page-capturer.ts`

- [ ] **Step 1: Add result type and helper**

In `src/design/page-capturer.ts`, add this type near the existing capture readiness status types:

```ts
export type CaptureLazyMediaActivationResult = {
  imageSources: number;
  sourceSets: number;
  backgrounds: number;
  eagerImages: number;
};
```

Then add this helper before `sweepCaptureScrollForCapture()`:

```ts
export function activateLazyMediaForCapture(options?: {
  doc?: {
    location?: { href?: string; origin?: string };
    querySelectorAll?: (selector: string) => ArrayLike<any>;
  };
}): CaptureLazyMediaActivationResult {
  const activeDocument = options?.doc ?? (typeof document !== 'undefined'
    ? document
    : undefined);
  const result: CaptureLazyMediaActivationResult = {
    imageSources: 0,
    sourceSets: 0,
    backgrounds: 0,
    eagerImages: 0,
  };

  if (!activeDocument || typeof activeDocument.querySelectorAll !== 'function')
    return result;

  const baseHref = activeDocument.location?.href || activeDocument.location?.origin || '';

  function abs(url: string): string {
    const trimmed = String(url || '').trim();
    if (!trimmed || /^https?:/i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:'))
      return trimmed;
    if (trimmed.startsWith('//'))
      return `https:${trimmed}`;

    try {
      return new URL(trimmed, baseHref).href;
    } catch {
      return trimmed;
    }
  }

  function normalizeSrcset(srcset: string): string {
    return String(srcset || '')
      .split(',')
      .map((entry) => {
        const parts = entry.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0)
          return '';

        const url = abs(parts.shift() || '');
        return [url, ...parts].filter(Boolean).join(' ');
      })
      .filter(Boolean)
      .join(', ');
  }

  const lazyImageAttrs = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-image-src'];

  Array.from(activeDocument.querySelectorAll('img')).forEach((img: any) => {
    for (const attr of lazyImageAttrs) {
      const value = typeof img.getAttribute === 'function' ? img.getAttribute(attr) : null;
      if (!value)
        continue;

      const src = abs(value);
      if (src) {
        img.src = src;
        if (typeof img.setAttribute === 'function')
          img.setAttribute('src', src);
      }
      if (typeof img.removeAttribute === 'function')
        img.removeAttribute(attr);
      result.imageSources++;
      break;
    }

    if (img.loading === 'lazy') {
      img.loading = 'eager';
      result.eagerImages++;
    }
  });

  Array.from(activeDocument.querySelectorAll('img[data-srcset], source[data-srcset]')).forEach((el: any) => {
    const value = typeof el.getAttribute === 'function' ? el.getAttribute('data-srcset') : null;
    if (!value)
      return;

    const srcset = normalizeSrcset(value);
    if (srcset) {
      el.srcset = srcset;
      if (typeof el.setAttribute === 'function')
        el.setAttribute('srcset', srcset);
    }
    if (typeof el.removeAttribute === 'function')
      el.removeAttribute('data-srcset');
    result.sourceSets++;
  });

  Array.from(activeDocument.querySelectorAll('[data-bg], [data-background-image]')).forEach((el: any) => {
    const attr = typeof el.getAttribute === 'function' && el.getAttribute('data-bg')
      ? 'data-bg'
      : 'data-background-image';
    const value = typeof el.getAttribute === 'function' ? el.getAttribute(attr) : null;
    if (!value)
      return;

    const backgroundUrl = abs(value);
    if (backgroundUrl) {
      el.style = el.style || {};
      el.style.backgroundImage = `url("${backgroundUrl}")`;
    }
    if (typeof el.removeAttribute === 'function')
      el.removeAttribute(attr);
    result.backgrounds++;
  });

  return result;
}
```

Important: this helper is serialized into the browser by Puppeteer. Keep every helper it uses inside the function body. Do not call module-scope helpers such as `absolutizeCaptureUrl()`.

- [ ] **Step 2: Replace inline lazy media activation in Phase 0**

In `PageCapturer.captureDom()`, keep the hidden tab/accordion activation inside the existing `page.evaluate(() => { ... })` block, but remove these inline lazy-media sections from that block:

```ts
        // Resolve lazy-loaded images (common data-* patterns)
        const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-image-src'];
        document.querySelectorAll('img').forEach(img => {
          for (const attr of LAZY_ATTRS) {
            const val = img.getAttribute(attr);
            if (val && val.startsWith('http')) {
              img.src = val;
              img.removeAttribute(attr);
              break;
            }
          }
          // Force lazy images to eager
          if (img.loading === 'lazy') {
            img.loading = 'eager';
          }
        });

        // Also handle data-srcset
        document.querySelectorAll('img[data-srcset], source[data-srcset]').forEach(el => {
          const val = el.getAttribute('data-srcset');
          if (val) {
            el.setAttribute('srcset', val);
          }
        });

        // Handle data-bg (background images)
        document.querySelectorAll('[data-bg]').forEach(el => {
          const bg = el.getAttribute('data-bg');
          if (bg) {
            (el as HTMLElement).style.backgroundImage = `url(${bg})`;
            el.removeAttribute('data-bg');
          }
        });
```

Immediately after that `page.evaluate(() => { ... })` block, add:

```ts
      const lazyMediaActivation = await page.evaluate(activateLazyMediaForCapture as any);
      console.log(`[PageCapturer] Lazy media activation: images=${lazyMediaActivation.imageSources}, srcsets=${lazyMediaActivation.sourceSets}, backgrounds=${lazyMediaActivation.backgrounds}, eager=${lazyMediaActivation.eagerImages}`);
```

This must remain before:

```ts
      // Wait a moment for the DOM changes to take effect
      await new Promise(r => setTimeout(r, 500));
```

- [ ] **Step 3: Run focused tests to verify GREEN**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: PASS.

### Task 3: Full Verification, Commit, Push, Deploy

**Files:**
- Verify: `src/design/page-capturer.ts`
- Verify: `src/design/page-capturer.test.ts`
- Verify: `docs/superpowers/specs/2026-06-05-clone-capture-lazy-media-activation-design.md`
- Verify: `docs/superpowers/plans/2026-06-05-clone-capture-lazy-media-activation.md`

- [ ] **Step 1: Run full tests**

Run:

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: exit 0 with no output.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add src/design/page-capturer.ts src/design/page-capturer.test.ts docs/superpowers/plans/2026-06-05-clone-capture-lazy-media-activation.md
git commit -m "fix(capture): activate relative lazy media before scroll"
```

- [ ] **Step 5: Push and deploy**

Run:

```bash
git push
pnpm run deploy
```

Expected: push succeeds and Wrangler reports a new Worker version ID.

- [ ] **Step 6: Live-check and final status**

Run:

```bash
curl -I https://oem-agent.adme-dev.workers.dev
git status --short --branch
```

Expected: Worker returns `HTTP/2 200`; git status is clean and `main...origin/main`.
