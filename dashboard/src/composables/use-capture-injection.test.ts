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
})
