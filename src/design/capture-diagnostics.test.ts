/**
 * Tests for capture diagnostics persistence.
 *
 * Failed captures must NOT silently disappear: their backend, status, source
 * and final URLs, timing and failure reason are persisted OUTSIDE
 * pages/definitions so the dashboard can surface why a capture failed.
 */

import { describe, it, expect } from 'vitest'
import type { PageCaptureResult } from './page-capturer'
import {
  buildDiagnosticsRecord,
  recordCaptureDiagnostics,
  readCaptureDiagnostics,
  diagnosticsKey,
  CAPTURE_DIAGNOSTICS_PREFIX,
} from './capture-diagnostics'

const AT = '2026-06-04T10:00:00.000Z'
const SOURCE = 'https://www.toyota.com.au/rav4'

class MemoryR2Bucket {
  objects = new Map<string, string>()
  async get(key: string): Promise<any> {
    const body = this.objects.get(key)
    if (!body) return null
    return { json: async () => JSON.parse(body), text: async () => body }
  }
  async put(key: string, value: string): Promise<void> {
    this.objects.set(key, value)
  }
  readJson<T>(key: string): T {
    const body = this.objects.get(key)
    if (!body) throw new Error(`Missing R2 object: ${key}`)
    return JSON.parse(body) as T
  }
}

function result(overrides: Partial<PageCaptureResult>): PageCaptureResult {
  return {
    success: false,
    capture_time_ms: 1234,
    capture_backend: 'cloudflare-browser',
    ...overrides,
  }
}

describe('buildDiagnosticsRecord', () => {
  it('marks a successful capture as ok with no failure reason', () => {
    const rec = buildDiagnosticsRecord({
      oemId: 'toyota-au', modelSlug: 'rav4', sourceUrl: SOURCE, capturedAt: AT,
      result: result({ success: true, elements_captured: 120, images_uploaded: 50, html_size_kb: 800, page: { source_url: SOURCE } as any }),
    })
    expect(rec.status).toBe('ok')
    expect(rec.success).toBe(true)
    expect(rec.reason).toBeUndefined()
    expect(rec.backend).toBe('cloudflare-browser')
    expect(rec.source_url).toBe(SOURCE)
    expect(rec.final_url).toBe(SOURCE)
    expect(rec.elements_captured).toBe(120)
  })

  it('marks a bot-blocked capture as blocked with a challenge reason', () => {
    const rec = buildDiagnosticsRecord({
      oemId: 'toyota-au', modelSlug: 'rav4', sourceUrl: SOURCE, capturedAt: AT,
      result: result({ success: false, bot_blocked: true }),
    })
    expect(rec.status).toBe('blocked')
    expect(rec.reason?.toLowerCase()).toContain('challenge')
  })

  it('marks an errored capture as error and carries the error message', () => {
    const rec = buildDiagnosticsRecord({
      oemId: 'toyota-au', modelSlug: 'rav4', sourceUrl: SOURCE, capturedAt: AT,
      result: result({ success: false, error: 'navigation timeout' }),
    })
    expect(rec.status).toBe('error')
    expect(rec.reason).toBe('navigation timeout')
  })
})

describe('recordCaptureDiagnostics / readCaptureDiagnostics', () => {
  it('persists the record outside pages/definitions', async () => {
    const r2 = new MemoryR2Bucket()
    const rec = buildDiagnosticsRecord({
      oemId: 'toyota-au', modelSlug: 'rav4', sourceUrl: SOURCE, capturedAt: AT,
      result: result({ success: false, error: 'navigation timeout' }),
    })
    await recordCaptureDiagnostics(r2 as any, rec)

    const key = diagnosticsKey('toyota-au', 'rav4')
    expect(key.startsWith(CAPTURE_DIAGNOSTICS_PREFIX)).toBe(true)
    expect(key).not.toContain('pages/definitions')

    const read = await readCaptureDiagnostics(r2 as any, 'toyota-au', 'rav4')
    expect(read?.latest.status).toBe('error')
    expect(read?.history.length).toBe(1)
  })

  it('keeps a newest-first history capped at 20 entries', async () => {
    const r2 = new MemoryR2Bucket()
    for (let i = 0; i < 25; i++) {
      const rec = buildDiagnosticsRecord({
        oemId: 'toyota-au', modelSlug: 'rav4', sourceUrl: SOURCE,
        capturedAt: `2026-06-04T10:00:${String(i).padStart(2, '0')}.000Z`,
        result: result({ success: false, error: `err-${i}` }),
      })
      await recordCaptureDiagnostics(r2 as any, rec)
    }
    const read = await readCaptureDiagnostics(r2 as any, 'toyota-au', 'rav4')
    expect(read?.history.length).toBe(20)
    // newest first
    expect(read?.history[0].reason).toBe('err-24')
    expect(read?.latest.reason).toBe('err-24')
  })

  it('returns null when no diagnostics exist', async () => {
    const r2 = new MemoryR2Bucket()
    const read = await readCaptureDiagnostics(r2 as any, 'toyota-au', 'rav4')
    expect(read).toBeNull()
  })
})

describe('buildDiagnosticsRecord capture audit fields', () => {
  it('maps audit, completeness verdict and suggested backend onto the record', () => {
    const record = buildDiagnosticsRecord({
      oemId: 'volkswagen-au',
      modelSlug: 'amarok',
      sourceUrl: 'https://www.volkswagen.com.au/en/models/amarok.html',
      capturedAt: '2026-07-04T00:00:00.000Z',
      result: {
        success: false,
        capture_time_ms: 95000,
        capture_backend: 'cloudflare-browser',
        error: 'Capture completeness gate failed: 2 feature-app shell(s) never mounted',
        capture_audit: {
          captured_scroll_height: 6000,
          dom_image_count: 31,
          hydration_status: 'stable',
          hydration_passes: [{ pass: 1, scroll_height: 6000, image_count: 31, elapsed_ms: 40000 }],
          shells_checked: 3,
          shells_recovered: 1,
          empty_shells: Array.from({ length: 12 }, (_, index) => `.shell [${index}]`),
        },
        completeness: { passed: false, reasons: ['2 feature-app shell(s) never mounted'] },
        suggested_backend: 'scrapling-stealth',
      } as any,
    })

    expect(record.status).toBe('error')
    expect(record.captured_scroll_height).toBe(6000)
    expect(record.dom_image_count).toBe(31)
    expect(record.hydration_status).toBe('stable')
    expect(record.empty_shell_count).toBe(12)
    expect(record.empty_shells).toHaveLength(10)
    expect(record.completeness_passed).toBe(false)
    expect(record.completeness_reasons).toEqual(['2 feature-app shell(s) never mounted'])
    expect(record.suggested_backend).toBe('scrapling-stealth')
  })

  it('leaves audit fields undefined when the capture had no audit', () => {
    const record = buildDiagnosticsRecord({
      oemId: 'mitsubishi-au',
      modelSlug: 'asx',
      sourceUrl: 'https://www.mitsubishi-motors.com.au/asx',
      capturedAt: '2026-07-04T00:00:00.000Z',
      result: { success: true, capture_time_ms: 1200, capture_backend: 'external-html' } as any,
    })

    expect(record.captured_scroll_height).toBeUndefined()
    expect(record.hydration_status).toBeUndefined()
    expect(record.empty_shell_count).toBeUndefined()
  })
})
