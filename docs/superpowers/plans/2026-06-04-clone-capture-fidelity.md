# Clone Capture Fidelity (Hybrid Tailwind Converter) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise pixel fidelity of the Smart Capture → Tailwind converter (emit the ~13 currently-dropped CSS props, replace lossy quantization with exact arbitrary values, and route un-tokenizable props to inline `style`), on a tested foundation.

**Architecture:** Extract the pure converter rules out of the injected-script string into one self-contained, unit-tested function `tailwindRules()` in a new module; inject it into the page via `.toString()`; then make the fidelity changes against the now-testable rules. Hybrid output: Tailwind utilities (exact `[…]` arbitrary values where no token fits) for layout/spacing/color/type, inline `style=""` only for box-shadow/gradient/transform/filter/clip-path/mask and non-uniform borders.

**Tech Stack:** TypeScript, Vitest (node env — these rules are pure string→string, no DOM). The converter is injected into a Puppeteer-rendered page; the extracted function must be **fully self-contained** (no module-scope/import references) and **ES5-style** (`var`, function declarations, no arrow fns) so its `.toString()` body runs in the page and survives production minification.

**Spec:** `docs/superpowers/specs/2026-06-04-clone-capture-fidelity-design.md`

**Conventions:**
- Full test run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production`
- Single file: append the test path. Single test: add `-t "name"`.
- Ship build: `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build`. Keep `vue-tsc -b` at 0 errors.
- Commit with specific paths (never `git add -A` — avoid sweeping harness lock files).

---

## File Structure

- **Create** `dashboard/src/composables/capture-tailwind-rules.ts` — exports `tailwindRules()`, a self-contained function returning the pure rule fns. Single source of truth.
- **Create** `dashboard/src/composables/capture-tailwind-rules.test.ts` — behavioral unit tests.
- **Modify** `dashboard/src/composables/use-capture-injection.ts` — import + inject `tailwindRules` via `.toString()`; delete the inline rule defs (lines ~246–434) and dead `TW_PROPS` (line 334); repoint `tailwindHtml`/`convert` call sites to `R.*`; extend `STYLE_PROPS`; accumulate + apply the inline `styleString`.
- **Modify** `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts` — add the `sanitizeStyle` survival test.
- **Delete** `src/design/css-to-tailwind.ts` (orphan, 0 importers).

---

## Task 1: Extract converter rules into a tested module (pure refactor — no behavior change)

Move the existing rule functions verbatim into a new self-contained `tailwindRules()` and lock current behavior with characterization tests. **Do not change any behavior in this task** — quantization stays lossy here; later tasks change it.

**Files:**
- Create: `dashboard/src/composables/capture-tailwind-rules.ts`
- Create: `dashboard/src/composables/capture-tailwind-rules.test.ts`

- [ ] **Step 1: Create the module skeleton** by moving these functions/consts **verbatim** out of `use-capture-injection.ts` (the `const js = \`…\`` string) into the new file, wrapped in `tailwindRules()`. Move, in this order, the bodies currently at these locations: `pxToSp` (247–250), `fsTw` (251–254), `rgbHex` (255–258), `colTw` (259–262), `cssTw` (263–~333), `TW_PROPS` is **dead — do NOT move it**, `CLASS_MAP` (343–390), `mapColClass` (393–411), `mapClasses` (414–434).

**CRITICAL de-escaping:** those bodies live inside a template literal, so their regexes are double-escaped (e.g. `/rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)/`, `/^col-(\\d+)$/`, `/\\s+/`, `/^[pm][trblxyse]?-[0-5]$/`). In a real TS function these become **single-escaped** real regex literals (`/rgb\((\d+),\s*(\d+),\s*(\d+)\)/`, `/^col-(\d+)$/`, `/\s+/`, `/^[pm][trblxyse]?-[0-5]$/`). Convert every `\\` → `\` inside regex literals. Add a `styleTw` stub (returns `''`). Keep ES5 style (`var`, function decls). The file:

```ts
// Pure CSS-computed-value → Tailwind/inline-style rules for Smart Capture.
// Authored as ONE self-contained function so use-capture-injection can inject
// tailwindRules.toString() into the page (minification-safe: no outside refs).
// These are the single source of truth and are unit-tested directly.
export function tailwindRules() {
  function pxToSp(px) { /* moved verbatim from use-capture-injection.ts */ }
  function fsTw(px) { /* moved verbatim */ }
  function rgbHex(rgb) { /* moved verbatim, regex de-escaped */ }
  function colTw(rgb) { /* moved verbatim */ }
  function cssTw(prop, val) { /* moved verbatim */ }
  var CLASS_MAP = { /* moved verbatim */ };
  function mapColClass(cls) { /* moved verbatim, regex de-escaped */ }
  function mapClasses(originalClasses) { /* moved verbatim, regex de-escaped */ }

  // styleTw: inline-style escape hatch for un-tokenizable props. Stub for now
  // (Task 6 implements it). Returns '' meaning "not routed to inline style".
  function styleTw(prop, val) { return ''; }

  return { pxToSp: pxToSp, fsTw: fsTw, rgbHex: rgbHex, colTw: colTw, cssTw: cssTw, mapClasses: mapClasses, styleTw: styleTw };
}
```

- [ ] **Step 2: Write characterization tests** (lock CURRENT behavior, including the lossy bits — later tasks will update these expectations):

```ts
import { describe, expect, it } from 'vitest'
import { tailwindRules } from './capture-tailwind-rules'

const R = tailwindRules()

describe('tailwindRules (characterization — current behavior)', () => {
  it('colors → exact hex / keywords', () => {
    expect(R.colTw('rgb(0, 0, 0)')).toBe('black')
    expect(R.colTw('rgb(255, 255, 255)')).toBe('white')
    expect(R.colTw('rgba(0, 0, 0, 0)')).toBe('transparent')
    expect(R.colTw('rgb(26, 26, 26)')).toBe('[#1a1a1a]')
  })
  it('spacing → scale or exact arbitrary', () => {
    expect(R.cssTw('padding-top', '16px')).toEqual(['pt-4'])
    expect(R.cssTw('padding-top', '37px')).toEqual(['pt-[37px]'])
  })
  it('font-size currently SNAPS to scale (lossy — changes in Task 3)', () => {
    expect(R.cssTw('font-size', '16px')).toEqual(['text-base'])
    expect(R.cssTw('font-size', '17px')).toEqual(['text-base']) // 17≈16 within 1px → snaps
  })
  it('border-radius currently BUCKETED (lossy — changes in Task 3)', () => {
    expect(R.cssTw('border-radius', '6px')).toEqual(['rounded-lg']) // ≤8 bucket
  })
  it('opacity currently emits round(*100) (lossy — changes in Task 3)', () => {
    expect(R.cssTw('opacity', '0.73')).toEqual(['opacity-73'])
  })
  it('dropped props currently emit nothing (changes in Tasks 4–6)', () => {
    expect(R.cssTw('line-height', '26.4px')).toEqual([])
    expect(R.cssTw('box-shadow', '0 4px 12px rgba(0,0,0,0.3)')).toEqual([])
    expect(R.styleTw('box-shadow', '0 4px 12px rgba(0,0,0,0.3)')).toBe('')
  })
  it('maps Bootstrap classes', () => {
    expect(R.mapClasses('d-flex justify-content-center')).toEqual(['flex', 'justify-center'])
    expect(R.mapClasses('col-6')).toEqual(['w-1/2'])
  })
})
```

> Note: if the verbatim move was faithful, these pass immediately. They are characterization tests — run them to confirm the extraction preserved behavior. If any fail, the move was not verbatim; fix the move (not the test).

- [ ] **Step 3: Run the tests**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/capture-tailwind-rules.test.ts`
Expected: all PASS. (If a regex was mis-escaped, `colTw('rgb(26, 26, 26)')` or `mapClasses('col-6')` will fail — fix the escaping.)

- [ ] **Step 4: Typecheck the new module**

Run: `pnpm --dir dashboard exec vue-tsc -b`
Expected: 0 errors. (`use-capture-injection.ts` is untouched in this task, so the inline copy still exists — that's fine; Task 2 removes it.)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/composables/capture-tailwind-rules.ts dashboard/src/composables/capture-tailwind-rules.test.ts
git commit -m "feat(capture): extract pure Tailwind converter rules into tested module"
```

---

## Task 2: Inject the extracted rules; delete the inline copy

Rewire `use-capture-injection.ts` to use the single source of truth via `.toString()` injection, and delete the now-duplicate inline definitions. No behavior change (the moved code is identical).

**Files:**
- Modify: `dashboard/src/composables/use-capture-injection.ts`

- [ ] **Step 1: Write the failing test** — add to a new test file `dashboard/src/composables/use-capture-injection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildCaptureInjection } from './use-capture-injection'

describe('buildCaptureInjection uses the extracted rules', () => {
  it('injects tailwindRules() and no longer inlines the rule defs', () => {
    const { lateInjection } = buildCaptureInjection()
    // Rules are instantiated once from the shared module source
    expect(lateInjection).toContain('var R=(')
    expect(lateInjection).toContain('R.cssTw(')
    expect(lateInjection).toContain('R.mapClasses(')
    // The inline copies are gone (defs no longer duplicated in the string)
    expect(lateInjection).not.toContain('function cssTw(prop,val)')
    expect(lateInjection).not.toContain('function mapClasses(originalClasses)')
  })
})
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/use-capture-injection.test.ts`
Expected: FAIL — `var R=(` not present / `function cssTw(prop,val)` still inlined.

- [ ] **Step 3: Implement**
1. At the top of `use-capture-injection.ts`, add: `import { tailwindRules } from './capture-tailwind-rules'`.
2. In the `const js = \`(function() { … })\`` string, **delete** the inline definitions that were moved in Task 1 (`pxToSp`, `fsTw`, `rgbHex`, `colTw`, `cssTw`, the dead `TW_PROPS`, `CLASS_MAP`, `mapColClass`, `mapClasses` — currently lines ~246–434), and in their place inject the shared rules once. Insert near the top of the IIFE body (before `tailwindHtml`/`cleanHtml` are defined):

```ts
  var R=(${tailwindRules.toString()})();
```

   (Because `js` is a template literal, `${tailwindRules.toString()}` interpolates the function source at build time.)
3. In `tailwindHtml`'s `convert()` (the `mapClasses(src.className)` call ~line 469 and the `cssTw(prop, val)` call ~line 477), repoint to `R.mapClasses(...)` and `R.cssTw(...)`.
4. Leave `STYLE_PROPS`, `tailwindHtml`, `cleanHtml`, `extractImageUrls`, `extractRootStyles`, and the event listeners as-is (only the rule defs move and call sites repoint).

- [ ] **Step 4: Run tests + typecheck + build**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/use-capture-injection.test.ts dashboard/src/composables/capture-tailwind-rules.test.ts`
Expected: PASS.
Run: `pnpm --dir dashboard exec vue-tsc -b` → 0 errors.
Run: `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build` → succeeds (confirms the injected `.toString()` template assembles).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/composables/use-capture-injection.ts dashboard/src/composables/use-capture-injection.test.ts
git commit -m "refactor(capture): inject shared Tailwind rules, drop inline duplicate"
```

---

## Task 3: Exact values for font-size, border-radius, opacity

Replace lossy quantization with exact arbitrary values (keep an exact-scale match as a nicety). Edit `capture-tailwind-rules.ts`.

**Files:**
- Modify: `dashboard/src/composables/capture-tailwind-rules.ts`
- Modify: `dashboard/src/composables/capture-tailwind-rules.test.ts`

- [ ] **Step 1: Update the tests** (change the 3 characterization expectations to the new exact behavior):

```ts
describe('exact values (font-size, radius, opacity)', () => {
  it('font-size: exact scale match keeps token, else exact px', () => {
    expect(R.cssTw('font-size', '16px')).toEqual(['text-base'])   // exact scale → token
    expect(R.cssTw('font-size', '17px')).toEqual(['text-[17px]']) // no exact → arbitrary
    expect(R.cssTw('font-size', '22px')).toEqual(['text-[22px]'])
  })
  it('border-radius: exact px, rounded-full for pill', () => {
    expect(R.cssTw('border-radius', '6px')).toEqual(['rounded-[6px]'])
    expect(R.cssTw('border-radius', '9999px')).toEqual(['rounded-full'])
  })
  it('opacity: exact arbitrary fraction', () => {
    expect(R.cssTw('opacity', '0.73')).toEqual(['opacity-[.73]'])
    expect(R.cssTw('opacity', '1')).toEqual([]) // fully opaque → nothing
  })
})
```
Also DELETE the now-superseded "currently SNAPS"/"currently BUCKETED"/"emits round(*100)" characterization tests from Task 1 (lines describing font-size/border-radius/opacity) so the suite has one source of truth.

- [ ] **Step 2: Run to verify FAIL**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/capture-tailwind-rules.test.ts -t "exact values"`
Expected: FAIL.

- [ ] **Step 3: Implement** in `capture-tailwind-rules.ts`:
- `fsTw(px)`: make it return the scale token **only on exact match**, else the arbitrary value:
```js
  function fsTw(px) {
    var m={12:'xs',14:'sm',16:'base',18:'lg',20:'xl',24:'2xl',30:'3xl',36:'4xl',48:'5xl',60:'6xl'};
    return m[px] ? m[px] : '['+px+'px]';
  }
```
- `border-radius` case in `cssTw`: replace the bucket logic with exact:
```js
      case 'border-radius': if(!isNaN(px)&&px>0){if(px>=9999)cls.push('rounded-full');else cls.push('rounded-['+px+'px]');}break;
```
- `opacity` case in `cssTw`: emit an exact arbitrary fraction (strip a leading zero for tidiness):
```js
      case 'opacity': var op=parseFloat(val);if(op<1&&op>=0){var s=String(op).replace(/^0/,'');cls.push('opacity-['+s+']');}break;
```

- [ ] **Step 4: Run to verify PASS**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/capture-tailwind-rules.test.ts`
Expected: PASS (whole file).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/composables/capture-tailwind-rules.ts dashboard/src/composables/capture-tailwind-rules.test.ts
git commit -m "feat(capture): exact font-size/border-radius/opacity (drop quantization)"
```

---

## Task 4: Emit the dropped Tailwind-routable props

Add `cssTw` cases for the props that are extracted but currently dropped and belong in Tailwind. (Inline-routed props are Task 6.)

**Files:**
- Modify: `dashboard/src/composables/capture-tailwind-rules.ts`
- Modify: `dashboard/src/composables/capture-tailwind-rules.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('newly-emitted Tailwind props', () => {
  it('line-height: px and unitless', () => {
    expect(R.cssTw('line-height', '26.4px')).toEqual(['leading-[26.4px]'])
    expect(R.cssTw('line-height', '1.55')).toEqual(['leading-[1.55]'])
    expect(R.cssTw('line-height', 'normal')).toEqual([])
  })
  it('letter-spacing', () => {
    expect(R.cssTw('letter-spacing', '0.3px')).toEqual(['tracking-[0.3px]'])
    expect(R.cssTw('letter-spacing', 'normal')).toEqual([])
  })
  it('position offsets only when positioned (caller passes position via prop name)', () => {
    expect(R.cssTw('top', '37px')).toEqual(['top-[37px]'])
    expect(R.cssTw('left', '0px')).toEqual([]) // 0px filtered by the existing guard
    expect(R.cssTw('z-index', '10')).toEqual(['z-[10]'])
    expect(R.cssTw('z-index', 'auto')).toEqual([])
  })
  it('min-width, font-style, text-decoration, font-family', () => {
    expect(R.cssTw('min-width', '240px')).toEqual(['min-w-[240px]'])
    expect(R.cssTw('font-style', 'italic')).toEqual(['italic'])
    expect(R.cssTw('text-decoration', 'underline solid rgb(0,0,0)')).toEqual(['underline'])
    expect(R.cssTw('font-family', 'Inter, sans-serif')).toEqual(['font-[Inter]'])
  })
  it('font-weight: arbitrary fallback for unmapped weights', () => {
    expect(R.cssTw('font-weight', '700')).toEqual(['font-bold'])     // mapped
    expect(R.cssTw('font-weight', '350')).toEqual(['font-[350]'])    // unmapped → arbitrary
  })
})
```

- [ ] **Step 2: Run to verify FAIL**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/capture-tailwind-rules.test.ts -t "newly-emitted"`
Expected: FAIL.

- [ ] **Step 3: Implement** — add these cases to the `cssTw` switch in `capture-tailwind-rules.ts`. Note the existing guard at the top of `cssTw` already returns `[]` for `''`/`none`/`normal`/`auto`/`0px`, so `line-height:normal`, `letter-spacing:normal`, `left:0px`, `z-index:auto` are filtered before the switch:
```js
      case 'line-height': if(val.indexOf('px')>=0){if(!isNaN(px)&&px>0)cls.push('leading-['+px+'px]');}else{var lh=parseFloat(val);if(!isNaN(lh))cls.push('leading-['+lh+']');}break;
      case 'letter-spacing': if(!isNaN(px))cls.push('tracking-['+px+'px]');break;
      case 'top': if(!isNaN(px))cls.push('top-['+px+'px]');break;
      case 'right': if(!isNaN(px))cls.push('right-['+px+'px]');break;
      case 'bottom': if(!isNaN(px))cls.push('bottom-['+px+'px]');break;
      case 'left': if(!isNaN(px))cls.push('left-['+px+'px]');break;
      case 'z-index': if(/^-?\d+$/.test(val))cls.push('z-['+val+']');break;
      case 'min-width': if(!isNaN(px)&&px>0)cls.push('min-w-['+px+'px]');break;
      case 'font-style': if(val==='italic')cls.push('italic');break;
      case 'text-decoration': if(val.indexOf('underline')>=0)cls.push('underline');else if(val.indexOf('line-through')>=0)cls.push('line-through');break;
      case 'font-family': var fam=val.split(',')[0].replace(/["']/g,'').trim();if(fam){cls.push('font-['+fam.replace(/\s+/g,'_')+']');}break;
```
Also extend the existing `font-weight` case to add the arbitrary fallback:
```js
      case 'font-weight': var fw={'400':'font-normal','500':'font-medium','600':'font-semibold','700':'font-bold','800':'font-extrabold'}; cls.push(fw[val]?fw[val]:'font-['+val+']');break;
```
(`top/right/bottom/left` are gated by the caller — Task 5 adds them to `STYLE_PROPS` only when emitting; the `0px` guard handles static-flow zeros. `z-index` uses its own integer test because `0` is meaningful and the top-level guard does not strip `z-index`.)

- [ ] **Step 4: Run to verify PASS (whole file)**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/capture-tailwind-rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/composables/capture-tailwind-rules.ts dashboard/src/composables/capture-tailwind-rules.test.ts
git commit -m "feat(capture): emit line-height/letter-spacing/offsets/z-index/min-width/font props"
```

---

## Task 5: Inline-style routing (`styleTw`) + wire into the DOM walker

Implement `styleTw` for un-tokenizable props, accumulate an inline `styleString` per element in `tailwindHtml`, and extend `STYLE_PROPS` so all the new props (Tasks 4 + 5) are actually read.

**Files:**
- Modify: `dashboard/src/composables/capture-tailwind-rules.ts` (+ test)
- Modify: `dashboard/src/composables/use-capture-injection.ts` (`STYLE_PROPS`, `tailwindHtml`)

- [ ] **Step 1: Write failing `styleTw` tests** in `capture-tailwind-rules.test.ts`:

```ts
describe('styleTw inline routing', () => {
  it('routes un-tokenizable props verbatim', () => {
    expect(R.styleTw('box-shadow', '0 4px 12px rgba(0,0,0,0.3)')).toBe('box-shadow:0 4px 12px rgba(0,0,0,0.3)')
    expect(R.styleTw('background-image', 'linear-gradient(180deg, #000, rgba(0,0,0,0))')).toBe('background-image:linear-gradient(180deg, #000, rgba(0,0,0,0))')
    expect(R.styleTw('transform', 'translateX(-50%)')).toBe('transform:translateX(-50%)')
    expect(R.styleTw('filter', 'blur(4px)')).toBe('filter:blur(4px)')
  })
  it('returns empty for none/empty and for non-inline props', () => {
    expect(R.styleTw('box-shadow', 'none')).toBe('')
    expect(R.styleTw('background-image', 'none')).toBe('')
    expect(R.styleTw('transform', 'none')).toBe('')
    expect(R.styleTw('font-size', '17px')).toBe('') // Tailwind-routed → not inline
  })
})
```

- [ ] **Step 2: Run to verify FAIL**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/capture-tailwind-rules.test.ts -t "styleTw"`
Expected: FAIL.

- [ ] **Step 3: Implement `styleTw`** in `capture-tailwind-rules.ts` (replace the stub):

```js
  function styleTw(prop, val) {
    if (!val || val === 'none' || val === 'normal' || val === 'auto' || val === 'rgba(0, 0, 0, 0)') return '';
    var INLINE = { 'box-shadow':1, 'background-image':1, 'transform':1, 'filter':1, 'backdrop-filter':1, 'clip-path':1, 'mask':1 };
    if (!INLINE[prop]) return '';
    return prop + ':' + val;
  }
```

- [ ] **Step 4: Wire into `use-capture-injection.ts`**
1. Extend `STYLE_PROPS` (the array at ~line 438) to add the props the new cases read: `'line-height','letter-spacing','font-style','text-decoration','font-family','top','right','bottom','left','z-index','min-width','box-shadow','background-image','transform','filter','backdrop-filter','clip-path','mask'`. Remove the bare `'border'` entry (uniform border handled below via longhands; if you keep border out of scope for this pass, simply drop `'border'`).
2. In `tailwindHtml`'s `convert()`, after the existing `for` loop that pushes `R.cssTw(prop,val)` into `twClasses`, accumulate inline styles in the same loop and apply them after class assignment:

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
   Then, where the code currently does `cln.removeAttribute('style')` (line ~483) and sets the class (lines ~486–494), set the style AFTER removing it:
```js
      cln.removeAttribute('style');
      // …existing class dedup + setAttribute('class', …)…
      if (styleString) cln.setAttribute('style', styleString);
```
   (Position offsets `top/right/bottom/left` only meaningfully apply when positioned; the existing `cssTw` `0px` guard drops static-flow zeros, and a positioned element will also emit a `position` class, so no extra gating is needed here.)

- [ ] **Step 5: Run tests + build**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/capture-tailwind-rules.test.ts dashboard/src/composables/use-capture-injection.test.ts`
Expected: PASS.
Run: `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build` → succeeds.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/composables/capture-tailwind-rules.ts dashboard/src/composables/capture-tailwind-rules.test.ts dashboard/src/composables/use-capture-injection.ts
git commit -m "feat(capture): inline-style routing for shadow/gradient/transform/filter + STYLE_PROPS"
```

---

## Task 6: Verify the sanitizer preserves inline styles

The styled HTML is re-rendered through `clone-studio-html.ts`'s `sanitizeStyle`. It is already property-permissive (only strips `expression()`/`@import`/`javascript:`/`vbscript:`/`-moz-binding` and rewrites `url()`). Lock that contract so a future tightening can't silently drop our shadows/gradients.

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`

- [ ] **Step 1: Write the test** (uses the existing `sanitizeCloneStudioHtmlForTest` export, which sanitizes full HTML including `style` attributes):

```ts
describe('sanitizeStyle preserves inline fidelity styles', () => {
  it('keeps box-shadow, gradient and transform; strips js/expression', () => {
    const safe = sanitizeCloneStudioHtmlForTest(
      '<div style="box-shadow:0 4px 12px rgba(0,0,0,0.3);background-image:linear-gradient(180deg,#000,rgba(0,0,0,0));transform:translateX(-50%)">x</div>'
    )
    expect(safe).toContain('box-shadow:0 4px 12px rgba(0,0,0,0.3)')
    expect(safe).toContain('linear-gradient(180deg,#000,rgba(0,0,0,0))')
    expect(safe).toContain('transform:translateX(-50%)')

    const danger = sanitizeCloneStudioHtmlForTest(
      '<div style="width:expression(alert(1));background:url(javascript:alert(1))">x</div>'
    )
    expect(danger).not.toContain('expression(')
    expect(danger).not.toContain('javascript:')
  })
})
```

- [ ] **Step 2: Run it**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts -t "preserves inline fidelity styles"`
Expected: PASS immediately (sanitizeStyle already allows these). **If it FAILS** (a property is being stripped), extend `sanitizeStyle` in `clone-studio-html.ts` to pass `box-shadow`/`linear-gradient`/`radial-gradient`/`transform`/`filter` through while keeping the `javascript:`/`expression(`/`url()` guards, then re-run until green.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
git commit -m "test(clone-studio): lock sanitizeStyle preservation of fidelity inline styles"
```

---

## Task 7: Retire the orphaned converter

`src/design/css-to-tailwind.ts` is an unused duplicate (0 importers, confirmed). Remove it so the converter is single-sourced.

**Files:**
- Delete: `src/design/css-to-tailwind.ts`

- [ ] **Step 1: Re-confirm zero importers**

Run: `grep -rn "css-to-tailwind\|getTailwindConverterScript" dashboard/src src --include=*.ts --include=*.vue | grep -v "src/design/css-to-tailwind.ts"`
Expected: no output. If there IS output, STOP — do not delete; report it.

- [ ] **Step 2: Delete and verify build/typecheck**

```bash
git rm src/design/css-to-tailwind.ts
```
Run: `pnpm --dir dashboard exec vue-tsc -b` → 0 errors. (Worker tsc is separate; this file is worker-side — also run the worker typecheck if present.)
Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tail -5` (root/worker typecheck) — confirm no new errors referencing the deleted file.

- [ ] **Step 3: Commit**

```bash
git add -- src/design/css-to-tailwind.ts
git commit -m "chore(design): remove orphaned css-to-tailwind duplicate"
```

---

## Task 8: Full suite + typecheck + build

- [ ] **Step 1: Full vitest**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production`
Expected: all pass (219 prior + new capture-rules/injection/sanitize tests).

- [ ] **Step 2: Typecheck**

Run: `pnpm --dir dashboard exec vue-tsc -b` → 0 errors.

- [ ] **Step 3: Build**

Run: `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build` → succeeds.

- [ ] **Step 4: Commit (only if Steps 1–3 required fixes)**

```bash
git add -A
git commit -m "chore(capture): typecheck/build fixes for fidelity pass"
```

---

## Manual verification (post-merge, in the dashboard)

Smart-capture a section that has: a gradient hero/overlay, a drop-shadow card, italic + underlined text, and a non-standard font size (e.g. 17px). Confirm the captured/rendered output matches the source visibly closer than before — gradient and shadow present (as inline style), exact type size/leading/weight, correct typeface. Compare against a capture from before this change if possible.

## Deployment

Dashboard-only — no worker deploy. Push + `pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main` after merge (per project deploy workflow).

---

## Self-review notes (addressed)

- **Spec coverage:** extraction+tests (Task 1), injection/single-source (Task 2), exact font-size/radius/opacity (Task 3), dropped props emitted (Task 4), hybrid inline routing + STYLE_PROPS + DOM-walker wiring (Task 5), sanitizer preservation (Task 6), orphan retired (Task 7), gates (Task 8). Border longhand handling from the spec is intentionally narrowed: Task 5 drops the unreliable bare `'border'` extraction; uniform/non-uniform border emission is **deferred** (noted below) to keep this pass focused — flagged so it isn't mistaken for "done".
- **Deferred from spec (logged, not silently dropped):** full uniform-vs-non-uniform border emission via longhands. Everything else in the spec's routing table is covered.
- **Type/name consistency:** `tailwindRules()` returns `{pxToSp,fsTw,rgbHex,colTw,cssTw,mapClasses,styleTw}`; injection binds it to `R`; call sites use `R.cssTw`/`R.mapClasses`/`R.styleTw`. Consistent across Tasks 1–5.
- **No placeholders:** every code/command step is concrete. The one verbatim-move step (Task 1) gives exact source line ranges + de-escaping rule + characterization tests that fail if the move wasn't faithful.
