import { describe, expect, it, vi } from 'vitest'

import { withFidelityMeasurementFallback, withFidelityMeasurementTimeout } from './fidelity-measurement'

describe('fidelity measurement timeouts', () => {
  it('returns a completed measurement and clears its timeout', async () => {
    vi.useFakeTimers()

    await expect(withFidelityMeasurementTimeout(() => Promise.resolve('done'), 5_000, 'Capture'))
      .resolves
      .toBe('done')
    expect(vi.getTimerCount()).toBe(0)

    vi.useRealTimers()
  })

  it('rejects a measurement that stops making progress', async () => {
    vi.useFakeTimers()
    const pending = withFidelityMeasurementTimeout(() => new Promise<never>(() => {}), 5_000, 'Desktop capture')
    const rejection = expect(pending).rejects.toThrow('Desktop capture timed out after 5 seconds')

    await vi.advanceTimersByTimeAsync(5_000)
    await rejection
    expect(vi.getTimerCount()).toBe(0)

    vi.useRealTimers()
  })

  it('returns a safe fallback when optional font work times out', async () => {
    vi.useFakeTimers()
    const pending = withFidelityMeasurementFallback(
      () => new Promise<never>(() => {}),
      2_000,
      'OEM fonts',
      '',
    )

    await vi.advanceTimersByTimeAsync(2_000)
    await expect(pending).resolves.toBe('')
    expect(vi.getTimerCount()).toBe(0)

    vi.useRealTimers()
  })

  it('returns a safe fallback when optional font work rejects', async () => {
    await expect(withFidelityMeasurementFallback(
      () => Promise.reject(new Error('Font stylesheet blocked by CORS')),
      2_000,
      'OEM font preparation',
      'fallback-font-css',
    )).resolves.toBe('fallback-font-css')
  })
})
