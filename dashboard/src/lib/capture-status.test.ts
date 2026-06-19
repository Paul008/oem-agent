import { describe, expect, it } from 'vitest'

import type { CaptureDiagnosticsRecord } from './worker-api'

import { describeCaptureStatus } from './capture-status'

function rec(overrides: Partial<CaptureDiagnosticsRecord>): CaptureDiagnosticsRecord {
  return {
    oem_id: 'toyota-au',
    model_slug: 'rav4',
    captured_at: '2026-06-04T10:00:00.000Z',
    status: 'ok',
    success: true,
    bot_blocked: false,
    backend: 'cloudflare-browser',
    source_url: 'https://www.toyota.com.au/rav4',
    capture_time_ms: 1200,
    ...overrides,
  }
}

describe('describeCaptureStatus', () => {
  it('returns a positive tone for a successful capture and keeps backend visible', () => {
    const d = describeCaptureStatus(rec({ status: 'ok', success: true }))
    expect(d.tone).toBe('success')
    expect(d.label.toLowerCase()).toContain('captured')
    expect(d.detail).toContain('cloudflare-browser')
  })

  it('returns a warning tone and challenge reason for a blocked capture', () => {
    const d = describeCaptureStatus(rec({ status: 'blocked', success: false, bot_blocked: true, reason: 'Security/challenge page detected' }))
    expect(d.tone).toBe('warning')
    expect(d.label.toLowerCase()).toContain('blocked')
    expect(d.detail.toLowerCase()).toContain('challenge')
  })

  it('returns an error tone and the failure reason for an errored capture', () => {
    const d = describeCaptureStatus(rec({ status: 'error', success: false, reason: 'navigation timeout' }))
    expect(d.tone).toBe('error')
    expect(d.detail).toContain('navigation timeout')
  })

  it('returns a neutral tone when no diagnostics exist', () => {
    const d = describeCaptureStatus(null)
    expect(d.tone).toBe('neutral')
    expect(d.label.toLowerCase()).toContain('no capture')
  })
})
