import { describe, expect, it } from 'vitest'

import { ALPINE_CSP_JS } from './alpine-csp'
import {
  buildCloneRuntimeScript,
  CLONE_INTERACTION_ATTR,
  CLONE_REGION_ID_ATTR,
  CLONE_RUNTIME_VERSION,
} from './clone-runtime'

describe('buildCloneRuntimeScript', () => {
  it('registers all four M2 components before loading Alpine', () => {
    const script = buildCloneRuntimeScript()

    const registration = script.indexOf("Alpine.data('cloneTabs'")
    const alpineLib = script.indexOf(ALPINE_CSP_JS.slice(0, 80))

    expect(registration).toBeGreaterThan(-1)
    expect(script).toContain("Alpine.data('cloneAccordion'")
    expect(script).toContain("Alpine.data('cloneCarousel'")
    expect(script).toContain("Alpine.data('cloneGallery'")
    expect(alpineLib).toBeGreaterThan(registration)
  })

  it('is syntactically valid JavaScript', () => {
    expect(() => new Function(buildCloneRuntimeScript())).not.toThrow()
  })

  it('never emits a closing script tag that would break inline embedding', () => {
    expect(buildCloneRuntimeScript()).not.toMatch(/<\/script/i)
  })

  it('hides inactive panels with priority high enough to beat capture-forced styles', () => {
    const script = buildCloneRuntimeScript()

    expect(script).toContain("setProperty('display', 'none', 'important')")
  })

  it('force-shows the active tab panel and expanded accordion panel instead of relying on removeProperty', () => {
    const script = buildCloneRuntimeScript()

    // The annotator strips forced display styles from every stamped panel (see clone-annotator.ts
    // stripForcedStyles), including whichever one was active at capture time, so falling back to
    // the captured stylesheet via removeProperty('display') is not reliable — OEM markup frequently
    // has no class-based "visible" rule at all. Both cloneTabs.show() and cloneAccordion.togglePanel()
    // must force display:block !important on reveal, matching the hide path's !important priority.
    expect(script).toContain("setProperty('display', 'block', 'important')")
    expect(script).not.toContain("removeProperty('display')")
  })

  it('exposes stable attribute names and version', () => {
    expect(CLONE_INTERACTION_ATTR).toBe('data-clone-interaction')
    expect(CLONE_REGION_ID_ATTR).toBe('data-clone-region-id')
    expect(CLONE_RUNTIME_VERSION).toBe('clone-runtime-v1')
  })
})
