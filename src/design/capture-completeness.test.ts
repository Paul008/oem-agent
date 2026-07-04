import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CAPTURE_COMPLETENESS,
  evaluateCaptureCompleteness,
} from './capture-completeness'

interface TestAudit {
  captured_scroll_height: number;
  dom_image_count: number;
  hydration_status: 'stable' | 'budget-exhausted' | 'max-passes' | 'unsupported';
  hydration_passes: Array<{ pass: number; scroll_height: number; image_count: number; elapsed_ms: number }>;
  shells_checked: number;
  shells_recovered: number;
  empty_shells: string[];
}

function makeAudit(overrides: Partial<TestAudit> = {}): TestAudit {
  return {
    captured_scroll_height: 16000,
    dom_image_count: 100,
    hydration_status: 'stable' as const,
    hydration_passes: [{ pass: 1, scroll_height: 16000, image_count: 100, elapsed_ms: 30000 }],
    shells_checked: 2,
    shells_recovered: 2,
    empty_shells: [] as string[],
    ...overrides,
  }
}

describe('evaluateCaptureCompleteness', () => {
  it('passes a stable, fully mounted capture', () => {
    const verdict = evaluateCaptureCompleteness({ audit: makeAudit(), lastGoodScrollHeight: 15800 })

    expect(verdict.passed).toBe(true)
    expect(verdict.reasons).toEqual([])
  })

  it('skips the gate when no audit exists (non-browser backend)', () => {
    const verdict = evaluateCaptureCompleteness({ audit: undefined })

    expect(verdict.passed).toBe(true)
    expect(verdict.reasons[0]).toContain('gate skipped')
  })

  it('fails a stable stump below the absolute height floor (Mitsubishi Triton case)', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ captured_scroll_height: 1331, dom_image_count: 16 }),
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons).toHaveLength(1)
    expect(verdict.reasons[0]).toContain('below the 3000px minimum')
  })

  it('fails a partial capture below the height floor even with some images (Ford Mustang case)', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ captured_scroll_height: 2581, dom_image_count: 8 }),
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons[0]).toContain('below the 3000px minimum')
  })

  it('fails a tall page with almost no images via the image floor', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ captured_scroll_height: 4000, dom_image_count: 3 }),
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons).toHaveLength(1)
    expect(verdict.reasons[0]).toContain('below the minimum 5')
  })

  it('does not double-report the floor for zero-height captures', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ captured_scroll_height: 0, dom_image_count: 100 }),
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons).toHaveLength(1)
    expect(verdict.reasons[0]).toContain('zero page height')
  })

  it('allows profiles to disable the floors', () => {
    const verdict = evaluateCaptureCompleteness(
      { audit: makeAudit({ captured_scroll_height: 1331, dom_image_count: 2 }) },
      { ...DEFAULT_CAPTURE_COMPLETENESS, minHeightPx: 0, minImages: 0 },
    )

    expect(verdict.passed).toBe(true)
  })

  it('fails when hydration never stabilized', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ hydration_status: 'budget-exhausted' }),
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons[0]).toContain('hydration did not stabilize')
  })

  it('does not fail stability when hydration reported unsupported', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ hydration_status: 'unsupported' }),
    })

    expect(verdict.passed).toBe(true)
  })

  it('fails when feature-app shells never mounted', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ empty_shells: ['[class*="CmsFeatureAppLoader"] [0]'] }),
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons[0]).toContain('never mounted')
  })

  it('fails when height regresses badly against the last good capture', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ captured_scroll_height: 6000 }),
      lastGoodScrollHeight: 16000,
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons[0]).toContain('last good')
  })

  it('collects multiple failure reasons', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ hydration_status: 'max-passes', empty_shells: ['.featureAppSection [3]'] }),
      lastGoodScrollHeight: 20001,
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons).toHaveLength(3)
  })

  it('fails when the capture measured zero page height', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ captured_scroll_height: 0 }),
      lastGoodScrollHeight: 16000,
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons[0]).toContain('zero page height')
  })

  it('honours config overrides', () => {
    const verdict = evaluateCaptureCompleteness(
      { audit: makeAudit({ empty_shells: ['.x [0]'] }) },
      { ...DEFAULT_CAPTURE_COMPLETENESS, maxEmptyShells: 1 },
    )

    expect(verdict.passed).toBe(true)
  })
})
