# Persisted Carousel Safety CSS Design

## Context

Clone Studio already injects CSS that constrains common carousel libraries when OEM scripts are stripped. Without those scripts, carousel tracks can keep full multi-slide widths and overflow the static clone frame. The Worker persisted clone HTML now stores reveal and desktop-image safety CSS, but carousel overflow protection still lives only in the dashboard wrapper.

This slice persists carousel overflow safety CSS with Worker-generated clone HTML.

## Goals

- Persist common carousel wrapper and track constraints in Worker-generated clone HTML.
- Keep the existing Clone Studio wrapper CSS unchanged.
- Keep carousel safety separate from reveal/image safety for readability and testing.
- Cover the CSS block and persistence wiring with tests.

## Non-Goals

- No JavaScript revival for carousels.
- No trusted carousel navigation controls in persisted HTML.
- No changes to dashboard preview behavior.
- No broad layout reset beyond common carousel selectors.
- No changes to section conversion.

## Design

Add an exported `CAPTURE_STATIC_CAROUSEL_SAFETY_CSS` constant in `src/design/page-capturer.ts`.

The CSS should include:

- Wrapper/container selectors: `.slick-list`, `.swiper`, `.swiper-container`, `.swiper-wrapper`, `.splide`, `.splide__track`, `.splide__list`, `.carousel`, `.carousel-inner`, `[class*="swiper"]`, `[class*="carousel"]`, `[class*="slider"]`.
- Wrapper/container rules: `max-width: 100%` and `overflow: hidden`.
- Track selectors: `.slick-track`, `.swiper-wrapper`, `.splide__list`, `.carousel-inner`.
- Track rules: `width: 100%`, `max-width: 100%`, and `transform: none`.
- Slide selectors: `.slick-slide`, `.swiper-slide`, `.splide__slide`, `.carousel-item`.
- Slide rules: `width: 100%`, `max-width: 100%`, and `flex-shrink: 0`.

Add the constant to the Worker `overrideCss` array after `CAPTURE_STATIC_CLONE_SAFETY_CSS`.

## Testing

Add tests in `src/design/page-capturer.test.ts`:

- Assert `CAPTURE_STATIC_CAROUSEL_SAFETY_CSS` contains common wrapper selectors and overflow/max-width rules.
- Assert it contains track selectors and width/transform rules.
- Assert it contains slide selectors and flex-shrink/width rules.
- Source-level wiring test verifies the `overrideCss` array includes `CAPTURE_STATIC_CAROUSEL_SAFETY_CSS` after `CAPTURE_STATIC_CLONE_SAFETY_CSS` and before the assembled style tag.

Use TDD: add tests first, verify they fail for missing export/wiring, then implement the constant and include it in persistence.

## Risk

The risk is low because this persists CSS that the dashboard preview already applies. The selectors are intentionally limited to common carousel library class names and generic carousel/slider class patterns. The behavioral change is that stored clone HTML is less likely to horizontally overflow outside Clone Studio.
