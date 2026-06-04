import { describe, expect, it } from 'vitest'
import { buildCaptureInjection } from './use-capture-injection'

describe('buildCaptureInjection uses the extracted rules', () => {
  it('injects tailwindRules() and no longer inlines the rule defs', () => {
    const { lateInjection } = buildCaptureInjection()
    expect(lateInjection).toContain('var R=(')
    expect(lateInjection).toContain('R.cssTw(')
    expect(lateInjection).toContain('R.mapClasses(')
    expect(lateInjection).not.toContain('function cssTw(prop,val)')
    expect(lateInjection).not.toContain('function mapClasses(originalClasses)')
  })
})
