# Clone Capture Border Emission (`borderTw`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit faithful borders from the Smart Capture → Tailwind converter — uniform borders as Tailwind tokens, non-uniform/non-tokenizable as exact inline `style`.

**Architecture:** Add a pure `borderTw(read)` function to the self-contained `tailwindRules()` module (reads the 12 border longhands via an injected reader, returns `{classes, style}`), and call it once per element in `use-capture-injection.ts`'s `convert()` DOM walker — pushing classes into the existing `twClasses` and appending to the existing `styleString`.

**Tech Stack:** TypeScript, Vitest (node — `borderTw` is pure, tested via a fake reader). `tailwindRules()` is injected into the capture page via `.toString()`, so `borderTw` must be ES5-style (`var`, function declarations, no arrow fns) with TS annotations (erased at compile; NO `@ts-nocheck`) and stay self-contained (no outside refs).

**Spec:** `docs/superpowers/specs/2026-06-05-clone-capture-border-emission-design.md`

**Conventions:**
- Full test run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production` (single file: append path; single test: `-t "name"`).
- `vue-tsc -b` 0 errors; ship build `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build`.
- Commit with specific paths (never `git add -A`).

---

## File Structure

- **Modify** `dashboard/src/composables/capture-tailwind-rules.ts` — add inner `borderTw(read)` to `tailwindRules()`; add `borderTw` to the returned object (line ~210). Reuses the existing inner `rgbHex`.
- **Modify** `dashboard/src/composables/capture-tailwind-rules.test.ts` — `borderTw` unit tests.
- **Modify** `dashboard/src/composables/use-capture-injection.ts` — call `R.borderTw(...)` in `convert()` after the `STYLE_PROPS` loop.
- **Modify** `dashboard/src/composables/use-capture-injection.test.ts` — assert `R.borderTw(` is wired.
- **Modify** `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts` — extend the sanitizer test with a border case.

---

## Task 1: `borderTw` rule + unit tests

**Files:**
- Modify: `dashboard/src/composables/capture-tailwind-rules.ts` (add `borderTw` near `styleTw` ~line 204; add to `return {…}` ~line 210)
- Test: `dashboard/src/composables/capture-tailwind-rules.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `capture-tailwind-rules.test.ts`:

```ts
describe('borderTw', () => {
  function makeReader(map: Record<string, string>) {
    return function (p: string) { return map[p] || '' }
  }
  function uniform(width: string, style: string, color: string) {
    var m: Record<string, string> = {}
    ;['top', 'right', 'bottom', 'left'].forEach(function (s) {
      m['border-' + s + '-width'] = width
      m['border-' + s + '-style'] = style
      m['border-' + s + '-color'] = color
    })
    return m
  }

  it('no border → empty', () => {
    expect(R.borderTw(makeReader(uniform('0px', 'none', 'rgb(0, 0, 0)')))).toEqual({ classes: [], style: '' })
  })
  it('uniform solid → Tailwind tokens', () => {
    expect(R.borderTw(makeReader(uniform('2px', 'solid', 'rgb(226, 226, 226)')))).toEqual({
      classes: ['border-[length:2px]', 'border-[color:#e2e2e2]', 'border-solid'],
      style: '',
    })
  })
  it('uniform dashed → border-dashed token', () => {
    const r = R.borderTw(makeReader(uniform('1px', 'dashed', 'rgb(0, 0, 0)')))
    expect(r.classes).toContain('border-dashed')
    expect(r.classes).toContain('border-[length:1px]')
    expect(r.style).toBe('')
  })
  it('non-uniform (only bottom) → inline border-bottom', () => {
    expect(R.borderTw(makeReader({
      'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': 'rgb(204, 204, 204)',
      'border-top-width': '0px', 'border-right-width': '0px', 'border-left-width': '0px',
    }))).toEqual({ classes: [], style: 'border-bottom:1px solid rgb(204, 204, 204)' })
  })
  it('non-tokenizable uniform style (groove) → inline all sides', () => {
    const r = R.borderTw(makeReader(uniform('2px', 'groove', 'rgb(0, 0, 0)')))
    expect(r.classes).toEqual([])
    expect(r.style).toBe('border-top:2px groove rgb(0, 0, 0);border-right:2px groove rgb(0, 0, 0);border-bottom:2px groove rgb(0, 0, 0);border-left:2px groove rgb(0, 0, 0)')
  })
})
```

- [ ] **Step 2: Run to verify FAIL**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/capture-tailwind-rules.test.ts -t "borderTw"`
Expected: FAIL — `R.borderTw is not a function`.

- [ ] **Step 3: Implement `borderTw`** in `capture-tailwind-rules.ts`, immediately after the `styleTw` function (before the `return {…}`). ES5 style, reuse the existing inner `rgbHex`:

```ts
  function borderTw(read: (prop: string) => string): { classes: string[], style: string } {
    var sides = ['top', 'right', 'bottom', 'left'];
    var TOKEN: Record<string, number> = { solid: 1, dashed: 1, dotted: 1, double: 1 };
    var present: string[] = [];
    var info: Record<string, { w: string, s: string, c: string }> = {};
    for (var i = 0; i < sides.length; i++) {
      var side = sides[i];
      var w = read('border-' + side + '-width');
      var s = read('border-' + side + '-style');
      var c = read('border-' + side + '-color');
      var px = parseFloat(w);
      if (!isNaN(px) && px > 0 && s && s !== 'none') {
        present.push(side);
        info[side] = { w: px + 'px', s: s, c: c };
      }
    }
    if (present.length === 0) return { classes: [], style: '' };

    var first = info[present[0]];
    var allFour = present.length === 4;
    var samW = true, samS = true, samC = true;
    for (var j = 0; j < present.length; j++) {
      var d = info[present[j]];
      if (d.w !== first.w) samW = false;
      if (d.s !== first.s) samS = false;
      if (d.c !== first.c) samC = false;
    }
    var uniform = allFour && samW && samS && samC && !!TOKEN[first.s];
    if (uniform) {
      var hex = rgbHex(first.c);
      return {
        classes: ['border-[length:' + first.w + ']', 'border-[color:' + hex + ']', 'border-' + first.s],
        style: '',
      };
    }
    // non-uniform OR non-tokenizable style → exact inline per present side
    var decls: string[] = [];
    for (var k = 0; k < present.length; k++) {
      var p = present[k];
      var pd = info[p];
      decls.push('border-' + p + ':' + pd.w + ' ' + pd.s + ' ' + pd.c);
    }
    return { classes: [], style: decls.join(';') };
  }
```

Then add `borderTw` to the returned object (line ~210):
```ts
  return { pxToSp: pxToSp, fsTw: fsTw, rgbHex: rgbHex, colTw: colTw, cssTw: cssTw, mapClasses: mapClasses, styleTw: styleTw, borderTw: borderTw };
```

(Add any local `var` annotations vue-tsc demands; do NOT add `@ts-nocheck`.)

- [ ] **Step 4: Run to verify PASS (whole file)**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/capture-tailwind-rules.test.ts`
Expected: all PASS.
Run: `pnpm --dir dashboard exec vue-tsc -b` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/composables/capture-tailwind-rules.ts dashboard/src/composables/capture-tailwind-rules.test.ts
git commit -m "feat(capture): borderTw — uniform borders to Tailwind, non-uniform to inline"
```

---

## Task 2: Wire `borderTw` into the DOM walker + lock with tests

**Files:**
- Modify: `dashboard/src/composables/use-capture-injection.ts` (`convert()`, after the `STYLE_PROPS` loop)
- Modify: `dashboard/src/composables/use-capture-injection.test.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`

- [ ] **Step 1: Write the failing tests**

(a) In `use-capture-injection.test.ts`, add to the existing `describe('buildCaptureInjection uses the extracted rules', …)` (or a new `it`):
```ts
  it('wires borderTw into the DOM walker', () => {
    const { lateInjection } = buildCaptureInjection()
    expect(lateInjection).toContain('R.borderTw(')
  })
```

(b) In `clone-studio-html.test.ts`, extend the `describe('sanitizeStyle preserves inline fidelity styles', …)` with a border assertion (add a new `it`):
```ts
  it('keeps inline border declarations', () => {
    const safe = sanitizeCloneStudioHtmlForTest(
      '<div style="border-bottom:1px solid rgb(204, 204, 204)">x</div>'
    )
    expect(safe).toContain('border-bottom:1px solid rgb(204, 204, 204)')
  })
```

- [ ] **Step 2: Run to verify FAIL**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/use-capture-injection.test.ts -t "wires borderTw"`
Expected: FAIL — `R.borderTw(` not present.
(The sanitizer border test will already PASS — sanitizeStyle is permissive; that's expected, it's a lock test.)

- [ ] **Step 3: Implement the wiring** in `use-capture-injection.ts` `convert()`. The current code (after the `STYLE_PROPS` loop, before `cln.removeAttribute('class')`) is:
```js
      var styleString = '';
      for (var i = 0; i < STYLE_PROPS.length; i++) {
        var prop = STYLE_PROPS[i];
        var val = computed.getPropertyValue(prop);
        var converted = R.cssTw(prop, val);
        twClasses.push.apply(twClasses, converted);
        var inline = R.styleTw(prop, val);
        if (inline) styleString += (styleString ? ';' : '') + inline;
      }
```
Add the `borderTw` call immediately AFTER that loop closes (still before `cln.removeAttribute('class')`):
```js
      var b = R.borderTw(function(p){ return computed.getPropertyValue(p); });
      if (b.classes.length) twClasses.push.apply(twClasses, b.classes);
      if (b.style) styleString += (styleString ? ';' : '') + b.style;
```
Do not change the dedup or `setAttribute` logic — the additions flow through them.

- [ ] **Step 4: Run to verify PASS**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/use-capture-injection.test.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`
Expected: all PASS.
Run: `pnpm --dir dashboard exec vue-tsc -b` → 0 errors.
Run: `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/composables/use-capture-injection.ts dashboard/src/composables/use-capture-injection.test.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
git commit -m "feat(capture): wire borderTw into capture DOM walker; lock border sanitize"
```

---

## Task 3: Full suite + typecheck + build

- [ ] **Step 1: Full vitest**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production`
Expected: all pass (235 prior + new borderTw/wiring/sanitize tests).

- [ ] **Step 2: Typecheck**

Run: `pnpm --dir dashboard exec vue-tsc -b` → 0 errors.

- [ ] **Step 3: Build**

Run: `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build` → succeeds.

- [ ] **Step 4: Commit (only if Steps 1–3 required fixes)**

```bash
git add -A
git commit -m "chore(capture): typecheck/build fixes for border emission"
```

---

## Manual verification (post-merge)

Smart-capture a section with: a card with a uniform 1–2px solid border, and an element with only a bottom divider. Confirm the uniform border renders (Tailwind tokens: `border-[length:..] border-[color:..] border-solid`) and the divider renders (inline `border-bottom:…`), matching the source.

## Deployment

Dashboard-only — no worker deploy. Push + `pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main` after merge.

---

## Self-review notes (addressed)

- **Spec coverage:** `borderTw` function (Task 1: present-side detection, uniform-token path, non-uniform/non-tokenizable inline path, edge cases) ✓; wiring in `convert()` (Task 2) ✓; sanitizer preservation (Task 2 lock test) ✓; gates (Task 3) ✓. No `STYLE_PROPS` change (borderTw reads longhands directly) — matches spec.
- **Type consistency:** `borderTw(read: (prop:string)=>string): {classes:string[], style:string}` is consistent across module return, test calls, and the `convert()` call site (which passes `function(p){return computed.getPropertyValue(p)}`).
- **No placeholders:** every code/command step is concrete with exact expected outputs.
