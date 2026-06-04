# Clone Capture Video Media Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate video poster and source lazy attributes before clone capture scrolls and waits for media.

**Architecture:** Extend the existing browser-safe `activateLazyMediaForCapture()` helper in `src/design/page-capturer.ts` with video poster/source handling. Unit tests use fake video/source elements, and a source-level wiring test locks the diagnostic log fields.

**Tech Stack:** TypeScript, Puppeteer-in-Worker `page.evaluate`, Vitest, Cloudflare Worker deploy.

---

### Task 1: Add Failing Video Media Activation Tests

**Files:**
- Modify: `src/design/page-capturer.test.ts`

- [ ] **Step 1: Extend fake DOM helpers for videos**

In `src/design/page-capturer.test.ts`, update `createLazyMediaElement()` so the returned fake element supports child source queries:

```ts
function createLazyMediaElement(attrs: Record<string, string> = {}, props: { loading?: string; sources?: any[] } = {}) {
  const element: any = {
    attrs: { ...attrs },
    removedAttrs: [] as string[],
    style: {},
    loading: props.loading,
    sources: props.sources ?? [],
    getAttribute(name: string) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null
    },
    setAttribute(name: string, value: string) {
      this.attrs[name] = value
      if (name === 'src')
        this.src = value
      if (name === 'srcset')
        this.srcset = value
      if (name === 'poster')
        this.poster = value
    },
    removeAttribute(name: string) {
      this.removedAttrs.push(name)
      delete this.attrs[name]
    },
    querySelectorAll(selector: string) {
      if (selector === 'source')
        return this.sources

      return []
    },
  }

  return element
}
```

Then update `createLazyMediaDocument()` to accept and return videos:

```ts
function createLazyMediaDocument(input: {
  href?: string;
  images?: any[];
  srcsetElements?: any[];
  backgroundElements?: any[];
  videos?: any[];
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
      if (selector === 'video')
        return input.videos ?? []

      return []
    },
  }
}
```

- [ ] **Step 2: Add video helper behavior tests**

Add these tests inside `describe('activateLazyMediaForCapture', ...)`, after the existing eager image test:

```ts
  it('resolves video data-poster before scrolling', () => {
    const video = createLazyMediaElement({ 'data-poster': '/-/media/rav4-poster.jpg' })
    const doc = createLazyMediaDocument({
      videos: [video],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.videoPosters).toBe(1)
    expect(video.poster).toBe('https://www.toyota.com.au/-/media/rav4-poster.jpg')
    expect(video.attrs.poster).toBe('https://www.toyota.com.au/-/media/rav4-poster.jpg')
    expect(video.removedAttrs).toContain('data-poster')
  })

  it('resolves relative video poster attributes before scrolling', () => {
    const video = createLazyMediaElement({ poster: 'assets/video-poster.jpg' })
    const doc = createLazyMediaDocument({
      videos: [video],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.videoPosters).toBe(1)
    expect(video.poster).toBe('https://www.toyota.com.au/assets/video-poster.jpg')
    expect(video.attrs.poster).toBe('https://www.toyota.com.au/assets/video-poster.jpg')
    expect(video.removedAttrs).not.toContain('poster')
  })

  it('resolves video source data-src attributes before scrolling', () => {
    const source = createLazyMediaElement({ 'data-src': 'media/rav4-loop.mp4' })
    const absoluteSource = createLazyMediaElement({ 'data-src': 'https://cdn.example.test/rav4.mp4' })
    const video = createLazyMediaElement({}, { sources: [source, absoluteSource] })
    const doc = createLazyMediaDocument({
      videos: [video],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.videoSources).toBe(2)
    expect(source.src).toBe('https://www.toyota.com.au/media/rav4-loop.mp4')
    expect(source.attrs.src).toBe('https://www.toyota.com.au/media/rav4-loop.mp4')
    expect(source.removedAttrs).toContain('data-src')
    expect(absoluteSource.src).toBe('https://cdn.example.test/rav4.mp4')
    expect(absoluteSource.removedAttrs).toContain('data-src')
  })
```

- [ ] **Step 3: Add diagnostic log field assertion**

In `describe('PageCapturer readiness wiring', ...)`, after the `lazyActivation` source lookup, add:

```ts
    const lazyActivationLog = source.indexOf('videoSources=${lazyMediaActivation.videoSources}, videoPosters=${lazyMediaActivation.videoPosters}', lazyActivation)
```

Then add this expectation after `expect(lazyActivation).toBeGreaterThan(-1)`:

```ts
    expect(lazyActivationLog).toBeGreaterThan(lazyActivation)
```

- [ ] **Step 4: Run focused tests to verify RED**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: FAIL because `activateLazyMediaForCapture()` does not yet return or populate `videoSources` / `videoPosters`, and the diagnostic log lacks the video fields.

### Task 2: Implement Video Media Activation

**Files:**
- Modify: `src/design/page-capturer.ts`

- [ ] **Step 1: Extend the result type and initial result**

In `CaptureLazyMediaActivationResult`, add:

```ts
  videoSources: number;
  videoPosters: number;
```

In the `result` object inside `activateLazyMediaForCapture()`, add:

```ts
    videoSources: 0,
    videoPosters: 0,
```

- [ ] **Step 2: Add video activation block**

Inside `activateLazyMediaForCapture()`, after the background activation block and before `return result;`, add:

```ts
  Array.from(activeDocument.querySelectorAll('video')).forEach((video: any) => {
    if (typeof video.querySelectorAll === 'function') {
      Array.from(video.querySelectorAll('source')).forEach((source: any) => {
        const value = typeof source.getAttribute === 'function' ? source.getAttribute('data-src') : null;
        if (!value)
          return;

        const src = abs(value);
        if (src) {
          source.src = src;
          if (typeof source.setAttribute === 'function')
            source.setAttribute('src', src);
        }
        if (typeof source.removeAttribute === 'function')
          source.removeAttribute('data-src');
        result.videoSources++;
      });
    }

    const dataPoster = typeof video.getAttribute === 'function' ? video.getAttribute('data-poster') : null;
    const poster = dataPoster || (typeof video.getAttribute === 'function' ? video.getAttribute('poster') : null) || video.poster;
    if (!poster)
      return;

    const resolvedPoster = abs(poster);
    if (resolvedPoster) {
      video.poster = resolvedPoster;
      if (typeof video.setAttribute === 'function')
        video.setAttribute('poster', resolvedPoster);
    }
    if (dataPoster && typeof video.removeAttribute === 'function')
      video.removeAttribute('data-poster');
    result.videoPosters++;
  });
```

Important: this helper is serialized into the browser by Puppeteer. Keep every helper it uses inside the function body. Do not call module-scope helpers.

- [ ] **Step 3: Extend the lazy media diagnostic log**

In `PageCapturer.captureDom()`, replace:

```ts
      console.log(`[PageCapturer] Lazy media activation: images=${lazyMediaActivation.imageSources}, srcsets=${lazyMediaActivation.sourceSets}, backgrounds=${lazyMediaActivation.backgrounds}, eager=${lazyMediaActivation.eagerImages}`);
```

with:

```ts
      console.log(`[PageCapturer] Lazy media activation: images=${lazyMediaActivation.imageSources}, srcsets=${lazyMediaActivation.sourceSets}, backgrounds=${lazyMediaActivation.backgrounds}, eager=${lazyMediaActivation.eagerImages}, videoSources=${lazyMediaActivation.videoSources}, videoPosters=${lazyMediaActivation.videoPosters}`);
```

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: PASS.

### Task 3: Full Verification, Commit, Push, Deploy

**Files:**
- Verify: `src/design/page-capturer.ts`
- Verify: `src/design/page-capturer.test.ts`
- Verify: `docs/superpowers/specs/2026-06-05-clone-capture-video-media-activation-design.md`
- Verify: `docs/superpowers/plans/2026-06-05-clone-capture-video-media-activation.md`

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
git add src/design/page-capturer.ts src/design/page-capturer.test.ts docs/superpowers/plans/2026-06-05-clone-capture-video-media-activation.md
git commit -m "fix(capture): activate video media before scroll"
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
