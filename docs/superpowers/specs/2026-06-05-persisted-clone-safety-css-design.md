# Persisted Clone Safety CSS Design

## Context

Clone Studio already injects CSS that keeps static clones readable when OEM scripts are stripped. It reveals common scroll-animation elements and forces desktop-only image variants visible in the editor preview. The Worker persisted clone HTML currently only stores tab visibility overrides and basic image resets, so the saved clone can still depend on the dashboard wrapper to avoid transparent reveal content or hidden desktop imagery.

This slice persists a small safety CSS block with the clone HTML itself.

## Goals

- Persist scroll-reveal final-state CSS in Worker-generated clone HTML.
- Persist desktop/mobile image variant CSS in Worker-generated clone HTML.
- Keep the existing Clone Studio wrapper CSS unchanged.
- Keep the override narrowly scoped to known static-clone failure patterns.
- Cover the CSS block and persistence wiring with tests.

## Non-Goals

- No JavaScript revival for scroll animations, tabs, or carousels.
- No changes to dashboard preview behavior.
- No changes to external stylesheet capture or sanitization.
- No changes to section conversion.
- No broad animation-disabling reset.

## Design

Add an exported `CAPTURE_STATIC_CLONE_SAFETY_CSS` constant in `src/design/page-capturer.ts`.

The CSS should include:

- `.imgdesktop`, `.dsktoponly`, and direct child `img` variants forced visible.
- `.imgmobile`, `.mobonly`, and direct child `img` variants forced hidden.
- `.animated`, `.animate__animated`, `.wow`, `.aos-init`, `[data-aos]`, and `[class*="fadeIn"]` forced to `opacity: 1`, `visibility: visible`, and `transform: none`.

Add the constant to the Worker `overrideCss` array that is assembled into stored clone HTML. Keep the existing tab and reset rules.

## Testing

Add tests in `src/design/page-capturer.test.ts`:

- Assert `CAPTURE_STATIC_CLONE_SAFETY_CSS` contains the desktop image selectors and visible display rule.
- Assert it contains mobile image selectors and hidden display rule.
- Assert it contains scroll-reveal selectors and final-state opacity, visibility, and transform rules.
- Source-level wiring test verifies the `overrideCss` array includes `CAPTURE_STATIC_CLONE_SAFETY_CSS`.

Use TDD: add tests first, verify they fail for missing export/wiring, then implement the constant and include it in persistence.

## Risk

The risk is low because this persists CSS that the dashboard preview already applies. The main behavioral change is that stored clone HTML becomes more readable outside Clone Studio. The selectors are intentionally narrow and target common stripped-script failure classes rather than all animated content.
