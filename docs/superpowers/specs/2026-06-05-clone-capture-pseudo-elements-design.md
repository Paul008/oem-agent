# Clone Capture Pseudo-Element Text Design

## Goal

Improve Clone Studio capture fidelity by preserving simple text that OEM pages render through CSS `::before` and `::after` pseudo-elements.

## Approach

During Cloudflare browser capture, after the final content container is chosen and before `container.innerHTML` is serialized, scan visible elements in that container for computed `::before` and `::after` content. When the content is a real quoted text string, insert a small span at the beginning or end of the element:

```html
<span data-oem-pseudo="before">New</span>
```

The span gets a conservative inline style copied from the pseudo-element so badges and labels remain readable without requiring the pseudo CSS to survive in Clone Studio.

## Included

- Browser capture only (`cloudflare-browser` backend).
- Text pseudo-elements where `getComputedStyle(el, '::before'|'::after').content` is a quoted string.
- Minimal style copy: display, color, background-color, font-weight, font-size, line-height, margin, padding, border-radius, text-transform, letter-spacing.
- Tests for content normalization and style serialization.

## Excluded

- `url(...)`, `counter(...)`, `attr(...)`, quote keywords, and empty pseudo content.
- Reconstructing pseudo layout geometry.
- External capture pseudo-elements, because raw HTML snapshots do not include computed pseudo styles.
- Running or preserving OEM scripts.

## Safety

The materialized spans use `textContent`, not HTML assignment. The existing dangerous-attribute cleanup still runs after materialization.

## Verification

- Focused `page-capturer.test.ts` must cover content filtering and span style generation.
- Worker typecheck/tests must pass.
- Dashboard build/deploy still run because the user asked to push/deploy continued work.
