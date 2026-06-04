import { describe, expect, it } from 'vitest'
import { buildCaptureInjection } from './use-capture-injection'

describe('buildCaptureInjection uses the extracted rules', () => {
  it('injects tailwindRules() once and repoints call sites', () => {
    const { lateInjection } = buildCaptureInjection()
    // shared rules injected and call sites repointed
    expect(lateInjection).toContain('var R=(')
    expect(lateInjection).toContain('R.cssTw(')
    expect(lateInjection).toContain('R.mapClasses(')
    // each rule fn defined exactly once — only inside the injected tailwindRules body,
    // i.e. no leftover inline duplicate (this would be 2 if an inline copy remained)
    expect((lateInjection.match(/function cssTw\b/g) || []).length).toBe(1)
    expect((lateInjection.match(/function mapClasses\b/g) || []).length).toBe(1)
  })

  it('wires borderTw into the DOM walker', () => {
    const { lateInjection } = buildCaptureInjection()
    expect(lateInjection).toContain('R.borderTw(')
  })

  it('materializes simple pseudo-element text in clean and Tailwind capture output', () => {
    const { lateInjection } = buildCaptureInjection()

    expect(lateInjection).toContain('function normalizePseudoElementContentForCapture')
    expect(lateInjection).toContain('function pseudoElementInlineStyleForCapture')
    expect(lateInjection).toContain('function materializePseudoElementForCapture')
    expect(lateInjection).toContain("window.getComputedStyle(src, '::' + pseudo)")
    expect(lateInjection).toContain("span.setAttribute('data-oem-pseudo', pseudo)")
    expect(lateInjection).toContain("span.setAttribute('data-oem-pseudo-capture', 'true')")
    expect(lateInjection).toContain('span.textContent = text')
    expect(lateInjection).toContain("materializePseudoElementsForCapture(el, clone, true)")
    expect(lateInjection).toContain("materializePseudoElementsForCapture(el, clone, false)")

    const convertIndex = lateInjection.indexOf('convert(el, clone);')
    const tailwindPseudoIndex = lateInjection.indexOf("materializePseudoElementsForCapture(el, clone, true)")
    expect(convertIndex).toBeGreaterThan(-1)
    expect(tailwindPseudoIndex).toBeGreaterThan(convertIndex)
  })
})
