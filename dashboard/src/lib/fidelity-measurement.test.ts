import { describe, expect, it, vi } from 'vitest'

import { withFidelityMeasurementTimeout } from './fidelity-measurement'

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
})
