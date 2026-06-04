# Spec — Clone capture fidelity pass (Hybrid Tailwind converter)

> 2026-06-04. Improves pixel fidelity of the **Smart Capture → Tailwind** path (Path B), where
> the client-side computed-style → Tailwind converter is lossy. Does NOT touch the Clone Studio
> clone-first path (Path A, which preserves original OEM CSS). Builds on the converter analysis
> in [[project_clone_studio_editing]] and the design-pipeline notes.

## Problem (evidence)

The active converter lives **inside an injected-script template-literal string** in
`dashboard/src/composables/use-capture-injection.ts` (`const js = \`(function(){…})\``, lines
~85–600). It has **no tests**. Confirmed fidelity losses:

- **13 props extracted but never emitted** — `STYLE_PROPS` (lines 438–447) lists them, but `cssTw`
  has **no `case`** for: `line-height`, `letter-spacing`, `font-family`, `box-shadow`, `border`,
  `top`, `right`, `bottom`, `left`, `z-index`, `min-width`, `text-decoration`, `font-style`.
  → wrong typeface, lost vertical rhythm, missing borders/shadows, absolutely-positioned
  elements lose their coordinates.
- **Lossy quantization:** `font-size` snaps to a fixed scale (`fsTw`, line ~323), `border-radius`
  is bucketed (`:327`), `opacity` emits `opacity-${round(op*100)}` (`:330`) which is invalid
  Tailwind for non-multiples-of-5.
- **Not captured at all:** CSS `background-image`/gradients, `transform` (forced `none`, `:20`),
  pseudo-elements, `filter`/`backdrop-filter`, `clip-path`/`mask`.

Already faithful (unchanged): colors emit exact `[#hex]`/rgba (`colTw`), spacing/width emit exact
`[Npx]` (`pxToSp`).

## Decisions (locked with user 2026-06-04)

1. **Hybrid output:** Tailwind utilities (exact arbitrary values where no token fits) for
   layout/spacing/color/type; inline `style=""` only for genuinely un-tokenizable exact-critical
   props (multi-layer box-shadow, gradients, complex transforms, filters, masks, non-uniform
   borders).
2. **Extract + real unit tests**, with `.toString()` injection made minification-safe by
   extracting the rules as **one self-contained function**.

## Architecture

### New module: `dashboard/src/composables/capture-tailwind-rules.ts`
Exports a single self-contained function:
```ts
export function tailwindRules(): {
  cssTw: (prop: string, val: string) => string[]
  colTw: (rgb: string) => string
  fsTw: (px: number) => string
  pxToSp: (px: number) => string
  rgbHex: (rgb: string) => string
  mapClasses: (className: string) => string[]
  // NEW: returns inline-style declarations for un-tokenizable props
  styleTw: (prop: string, val: string) => string  // '' when prop is Tailwind-routed or empty
}
```
All helpers are **inner functions** of `tailwindRules` (self-contained: no module-scope/import
references), so `tailwindRules.toString()` stays internally consistent after minification.
ES5-compatible style (`var`, no arrow fns) so the stringified body runs in the injected page
script. This module is the **single source of truth** and is directly unit-tested.

### `use-capture-injection.ts` changes
- Import `tailwindRules`. In `buildCaptureInjection`, build the injected script so it instantiates
  the rules once: inject `;var R=(${tailwindRules.toString()})();` ahead of the DOM glue.
- **Delete** the inline rule definitions currently in the `js` string (the `colTw`/`cssTw`/`fsTw`/
  `pxToSp`/`rgbHex`/`mapClasses` bodies, ~lines 249–447) and replace call sites with `R.cssTw(...)`,
  `R.colTw(...)`, etc.
- `tailwindHtml(el)` (the DOM walker, stays in the string) accumulates per element BOTH:
  - a class list from `R.cssTw(prop,val)` for every `STYLE_PROPS` entry, AND
  - an inline `styleString` concatenated from `R.styleTw(prop,val)` for the inline-routed props.
  After the loop, set `cln.className = twClasses.join(' ')` and, if `styleString` non-empty,
  `cln.setAttribute('style', (existingStyle ? existingStyle + ';' : '') + styleString)`.

### Retire the orphan
Delete `src/design/css-to-tailwind.ts` (469 LOC, unused per memory — nothing imports
`getTailwindConverterScript`) so the converter logic is single-sourced. (Verify zero importers
first; if any exist, STOP and reassess.)

## Hybrid routing table

`STYLE_PROPS` is extended to also extract: `line-height`, `letter-spacing`, `font-style`,
`text-decoration`, `background-image`, `transform`, `filter`, `backdrop-filter`, `clip-path`.

**Tailwind (via `cssTw`), exact arbitrary values:**
| Prop | Output | Change |
|---|---|---|
| font-size | `text-[17px]` | drop `fsTw` snapping (keep scale only on exact match) |
| border-radius | `rounded-[6px]` (keep `rounded-full` for ≥9999) | drop ≤4/≤8 buckets |
| opacity | `opacity-[.73]` | drop invalid `opacity-73` |
| line-height | `leading-[26.4px]` / `leading-[1.55]` (unitless preserved) | NEW |
| letter-spacing | `tracking-[0.3px]` | NEW |
| top/right/bottom/left | `top-[37px]` … (only when `position` ≠ static) | NEW |
| z-index | `z-[10]` (numeric only) | NEW |
| min-width | `min-w-[240px]` | NEW |
| font-family | `font-[Inter]` (primary family, spaces→`_`) | NEW |
| font-style | `italic` | NEW |
| text-decoration | `underline` / `line-through` | NEW |
| font-weight | existing map + `font-[350]` arbitrary fallback for unmapped | extend |
| border (uniform) | `border border-[#e2e2e2] border-[2px]` | NEW (uniform only) |

**Inline `style=""` (via `styleTw`), faithful verbatim:**
`box-shadow`, `background-image` (incl. `linear/radial-gradient`), `transform`, `filter`,
`backdrop-filter`, `clip-path`, `mask`, and non-uniform per-side borders. `styleTw` returns the
raw computed value as `prop:value` (e.g. `box-shadow:0 4px 12px rgba(0,0,0,.3)`); returns `''`
for `none`/empty/default values to avoid noise.

## Sanitizer compatibility (critical)

The styled HTML flows downstream and is re-rendered through `clone-studio-html.ts`'s
`sanitizeStyle` (line ~407, currently rewrites `url()` and is otherwise permissive on declarations).
- **Verify** `sanitizeStyle` passes `box-shadow`, `linear-gradient(...)`, `radial-gradient(...)`,
  `transform`, `filter` through unchanged while still neutralizing `javascript:`,
  `expression(`, and rewriting/sanitizing any `url()` per the existing URL policy.
- If any of those are currently stripped, extend `sanitizeStyle` to allow them. A property that
  cannot be made safe is dropped — never injected unsanitized. No raw value bypasses the URL/JS
  guards.

## Error handling / edge cases

- `cssTw` returns `[]` for unhandled/empty/default values (existing contract) — never throws.
- `styleTw` returns `''` for `none`/initial/empty — no empty `style=""` attributes.
- `top/right/bottom/left` emitted **only** when `position` is not `static` (avoid meaningless
  offsets on static-flow elements).
- `z-index` emitted only for finite integers (skip `auto`).
- Unitless `line-height` preserved as a unitless arbitrary value (`leading-[1.55]`), px as
  `leading-[26.4px]`.
- Non-uniform borders (differing per-side width/color/style) → inline; uniform → Tailwind.
- **Border is read via longhands, not the `border` shorthand** (computed `border` is unreliable
  across browsers). `tailwindHtml` reads `border-top-width/right/bottom/left` (+ style + color);
  if all four sides are equal and width > 0 → emit Tailwind `border border-[Wpx] border-[#hex]`;
  if sides differ → emit an inline `border-*` style for each differing side. Replace the bare
  `'border'` entry in `STYLE_PROPS` with the longhand set this requires.

## Testing (real behavioral, node env)

New `dashboard/src/composables/capture-tailwind-rules.test.ts`:
1. `tailwindRules().cssTw` exact outputs:
   - `('font-size','17px') → ['text-[17px]']`; `('font-size','16px') → ['text-base']` (exact-scale match still wins)
   - `('border-radius','6px') → ['rounded-[6px]']`; `('border-radius','9999px') → ['rounded-full']`
   - `('opacity','0.73') → ['opacity-[.73]']`
   - `('line-height','26.4px') → ['leading-[26.4px]']`; `('line-height','1.55') → ['leading-[1.55]']`
   - `('letter-spacing','0.3px') → ['tracking-[0.3px]']`
   - `('z-index','10') → ['z-[10]']`; `('z-index','auto') → []`
   - `('font-style','italic') → ['italic']`; `('text-decoration','underline solid') → ['underline']`
2. `colTw('rgb(26, 26, 26)') → '[#1a1a1a]'`; `colTw('rgb(0, 0, 0)') → 'black'` (unchanged contract).
3. `styleTw` routing: `('box-shadow','0 4px 12px rgba(0,0,0,0.3)') → 'box-shadow:0 4px 12px rgba(0,0,0,0.3)'`;
   `('box-shadow','none') → ''`; `('background-image','linear-gradient(...)') → 'background-image:linear-gradient(...)'`;
   `('background-image','none') → ''`; a Tailwind-routed prop like `('font-size','17px') → ''`.
4. Injection wiring: `buildCaptureInjection().lateInjection` contains `var R=(` (the rules
   instantiation) and the DOM glue calls `R.cssTw`/`R.styleTw`; it no longer inlines a `function cssTw`.
5. `sanitizeStyle` (clone-studio-html.ts) test: a shadow+gradient style survives; a
   `background:url(javascript:alert(1))` / `expression(...)` is neutralized.

Run targeted then full: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production`.
Ship build: `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build`; keep `vue-tsc -b` at 0 errors.

## Out of scope (explicit — not this pass)

- Path A Clone Studio JS revival (carousels/lazy-load/scroll-reveal end-states).
- Pseudo-element (`::before/::after`) materialization.
- Font pipeline hardening (`size-adjust`/`ascent-override`, guaranteed @font-face capture).
- Post-JS-settle DOM capture.
- Mobile/responsive multi-width capture.

## Manual verification (post-merge)

Smart-capture a section with a gradient hero, a drop-shadow card, italic/underlined text, and a
non-standard font size; confirm the captured render matches the source visibly closer than before
(gradient present, shadow present, type size/weight/leading correct).
