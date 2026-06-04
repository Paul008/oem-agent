# Clone Studio Interactivity — Decision & Recommendation

Written 2026-06-04. Resolves handoff item #3 ("Decide the interactivity strategy").

## Problem

Clone Studio renders captured OEM HTML in an `<iframe sandbox="allow-scripts">`. That
sandbox **throttles `requestAnimationFrame` and timers to a near halt**, so any
motion driven by GSAP `gsap.to`, `setInterval`, or Slick/Swiper auto-advance does
not run. `gsap.set` (static positioning) works; animation does not.

Verified probe (authenticated production, 2026-06-03):

| Sandbox | 1s rAF count | 1s timer count | Result |
|---|---:|---:|---|
| `allow-scripts` | 2 | 2 | timers/rAF effectively stalled |
| `allow-scripts allow-same-origin` | 120 | 20 | advance normally |

So the throttle is the sandbox, not the clone HTML. Adding `allow-same-origin`
fixes timing — but a sandbox that is **both** `allow-scripts` and
`allow-same-origin` can script the parent document, and the clone body is
untrusted OEM HTML.

## Options

1. **Same-origin preview, behind a flag (already spiked).**
   `CloneStudioCanvas.vue` already supports an opt-in same-origin path via
   `VITE_CLONE_STUDIO_SAME_ORIGIN=true` or the `allowSameOriginSandbox` prop. The
   clone pipeline strips OEM `<script>` tags and injects only the Clone Studio
   bridge. Pro: cheap, restores real carousel/tab/GSAP behavior immediately. Con:
   security depends entirely on the script sanitizer being airtight — if a
   script-bearing clone ever slips through, it runs same-origin with parent access.

2. **Interactive islands.** Detect carousels/tabs/accordions and replace each with
   a trusted Alpine/Vue component driven by extracted data. Pro: no untrusted
   scripts ever run; fully controllable; aligns with the structured-section model.
   Con: real build per pattern; only covers patterns we explicitly support.

3. **Multi-state capture (snapshots).** At capture time, snapshot each carousel
   slide / tab panel; the editor flips between stored states. Pro: zero runtime
   scripts; deterministic. Con: capturer + storage changes; no true motion, only
   state-stepping; brittle for infinite/auto carousels.

## Recommendation

**Phased: (A) ship same-origin preview behind a flag for preview-only after a
sanitizer hardening pass, then (B) productize interactive islands for the few
high-value patterns. Use snapshots only as a capture-time fallback where islands
don't fit.**

Rationale:

- The same-origin spike already exists and already proves it un-throttles timing.
  The blocker is not feasibility — it is trust. So the gating work is **sanitizer
  hardening + a verification test**, not new rendering architecture.
- Islands are the correct *durable* answer (no untrusted scripts, fits the
  structured-section model the mapper now produces), but they are a per-pattern
  build and shouldn't block a usable preview.
- Snapshots are the weakest general answer (no real motion) and should be reserved
  for cases where islands are impractical.

## Concrete next steps

**A. Same-origin preview (flagged, preview-only)**

Status (verified 2026-06-04): the sanitizer hardening and the gated flag that this
section originally called for **already exist and are tested** — the remaining work
is live verification only.

1. ~~Harden the clone sanitizer~~ **DONE.** `sanitizeCloneStudioHtml` in
   `clone-studio-html.ts` already strips `<script>`, inline `on*=` handlers,
   `javascript:` URLs, `<iframe>`/`<object>`/`<embed>`, `srcdoc`, `<base>`, and
   meta-refresh, and re-sanitizes the body in the bridge before re-emitting it.
2. ~~Add a unit test~~ **DONE.** `clone-studio-html.test.ts` asserts all of the
   above are removed for a script-bearing fixture (plus CSS-escape bypasses).
3. ~~Keep `allowSameOriginSandbox` off by default~~ **DONE.**
   `cloneStudioIframeSandbox()` defaults to `allow-scripts`; same-origin is opt-in
   only via the `allowSameOriginSandbox` prop or `VITE_CLONE_STUDIO_SAME_ORIGIN`.
4. **Remaining (live):** enable the flag on the preview surface and verify on Ford,
   Kia, GWM, Hyundai, Toyota that `gsap.to` actually advances (controlled
   before/after, not the throttled audit toggle). One last review: confirm the flag
   is never enabled on the editor *save* path, only on preview.

**B. Interactive islands (durable)**
1. Start with carousels and tabs — the two patterns that show up across stacks and
   are already represented as `gallery`/`feature-cards`/`tabs` sections by the
   structurer and the new mapper.
2. Render those sections with the existing trusted Vue components instead of the
   raw clone region when the page is in structured mode. This is where the unified
   mapper (`src/design/section-mapper.ts`) pays off: a page mapped to clean
   sections renders interactively with zero untrusted scripts.

## Cross-reference

This makes the interactivity strategy converge with the structured-editing path
(#2): the more reliably the mapper turns a clone into trusted sections, the less
we need same-origin scripts at all. Same-origin preview is the bridge; structured
sections + islands are the destination.
