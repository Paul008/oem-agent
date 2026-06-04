# Spec — Clone capture border emission (`borderTw`)

> 2026-06-05. Fast-follow to the clone-capture fidelity pass
> (`2026-06-04-clone-capture-fidelity-design.md`), which deferred border emission. Adds
> faithful border output to the Smart Capture → Tailwind converter (Path B). See
> [[project_clone_studio_editing]] / the CSS→Tailwind note in MEMORY.

## Problem

The fidelity pass removed the bare `'border'` entry from `STYLE_PROPS` (the CSS `border`
shorthand is reported inconsistently by `getComputedStyle`) and deferred real border handling.
Result: borders are currently NOT emitted at all by the converter — dividers, card outlines,
button borders disappear in captured output. Border needs all 12 longhand values
(`border-{top,right,bottom,left}-{width,style,color}`) read together, so it cannot be a per-prop
`cssTw`/`styleTw` case in the existing `STYLE_PROPS` loop.

## Decision (locked with user 2026-06-05)

**Hybrid policy:** uniform borders → Tailwind tokens (editable, design-system-aligned);
non-uniform (or non-tokenizable style) → exact inline `style`. Consistent with the fidelity
pass's hybrid philosophy.

## Component: `borderTw(read)` in `capture-tailwind-rules.ts`

Add to the self-contained `tailwindRules()` (same ES5 + TS-annotation style; no `@ts-nocheck`;
must stay self-contained so `.toString()` injection works). Add `borderTw` to the returned
object.

Signature:
```ts
function borderTw(read: (prop: string) => string): { classes: string[], style: string }
```
- `read` returns a CSS value for a longhand prop. In-page it wraps
  `computed.getPropertyValue`; in tests it's a fake backed by a map. Keeps `borderTw` pure and
  node-testable (no DOM).

Logic:
1. For each side in `['top','right','bottom','left']`, read `border-{side}-width`,
   `border-{side}-style`, `border-{side}-color`. A side is **present** when
   `parseFloat(width) > 0 && style !== 'none' && style !== ''`.
2. If **no** side present → return `{ classes: [], style: '' }`.
3. **Uniform**: all 4 sides present AND equal width AND equal style AND equal color, AND the
   shared style is one of `solid|dashed|dotted|double` → return Tailwind tokens:
   ```
   classes: ['border-[length:'+W+'px]', 'border-[color:'+HEX+']', 'border-'+style]
   style: ''
   ```
   where `W` is the integer/float px width and `HEX` is `rgbHex(color)` (reuse the existing
   `rgbHex` helper; if it returns a non-`#` value, use it verbatim inside the brackets).
4. **Otherwise** (sides differ, OR a present side has a non-tokenizable style like
   `groove/ridge/inset/outset/hidden`): return exact inline per **present** side:
   ```
   style: present sides joined by ';' as 'border-'+side+':'+W+'px '+style+' '+color
   classes: []
   ```
   (Use the raw computed `color` string for inline — no hex conversion needed; it's already a
   valid CSS color from `getComputedStyle`.)

Notes:
- Tailwind v3 type hints `border-[length:2px]` (→ border-width) and `border-[color:#hex]`
  (→ border-color) disambiguate width vs color. `border-solid|dashed|dotted|double` are real
  tokens.
- `getComputedStyle` resolves `border-color` to a concrete value (defaults to the element's
  `color`/currentColor), so a present side always has a usable color.

## Wiring: `use-capture-injection.ts` `convert()`

After the existing `STYLE_PROPS` loop (which builds `twClasses` + `styleString`), once per
element, before classes/style are applied to `cln`:
```js
      var b = R.borderTw(function(p){ return computed.getPropertyValue(p); });
      if (b.classes.length) twClasses.push.apply(twClasses, b.classes);
      if (b.style) styleString += (styleString ? ';' : '') + b.style;
```
No `STYLE_PROPS` change — `borderTw` reads the border longhands directly via the reader. The
bare `'border'` entry stays removed. `twClasses` dedup and the `cln.setAttribute('style', …)`
(applied after `removeAttribute('style')` + class set) are unchanged and handle the additions.

## Sanitizer

Inline border declarations (`border-bottom:1px solid rgb(204,204,204)`) contain no `url()`/`js`,
so the downstream `sanitizeStyle` (clone-studio-html.ts) already preserves them. Extend the
existing Task-6 sanitizer test with a border case to lock it.

## Error handling / edge cases

- All-sides-absent (width 0 / style none) → `{classes:[], style:''}` (no border emitted).
- A single present side (e.g. a bottom divider) → non-uniform path → inline `border-bottom:…`.
- Mixed: 2 sides solid + 2 absent → non-uniform → inline for the 2 present sides only.
- Non-tokenizable uniform style (`groove`) → inline (all 4 sides).
- Fractional widths (`0.5px`) preserved via `parseFloat` → `0.5` in output.
- `read` returning `''` for a prop → treated as absent/None (no throw).

## Testing (node, pure — `capture-tailwind-rules.test.ts`)

A `makeReader(map)` helper returns `(p) => map[p] || ''`. Cases:
1. No border: all widths `'0px'` → `{classes:[], style:''}`.
2. Uniform solid: 4×`2px`/`solid`/`rgb(226,226,226)` → `classes: ['border-[length:2px]','border-[color:#e2e2e2]','border-solid']`, `style:''`.
3. Uniform dashed: style `dashed` → includes `'border-dashed'`.
4. Non-uniform (only bottom present): bottom `1px solid rgb(204,204,204)`, others `0px` →
   `classes:[]`, `style:'border-bottom:1px solid rgb(204, 204, 204)'`.
5. Non-tokenizable uniform style `groove` → inline for all four sides (classes empty).
6. Wiring (in `use-capture-injection.test.ts`): `buildCaptureInjection().lateInjection`
   contains `R.borderTw(`.

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production`. Keep
`vue-tsc -b` at 0 errors; `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build` succeeds.

## Out of scope

Unchanged from the fidelity pass: Path-A JS revival (carousels/lazy/scroll-reveal),
pseudo-elements, font `size-adjust`/metric hardening, post-JS-settle capture, responsive
multi-width capture.

## Manual verification

Smart-capture a section with: a card that has a uniform 1–2px solid border, and an element with
only a bottom divider. Confirm the uniform border renders (Tailwind tokens) and the divider
renders (inline `border-bottom`), matching the source.
