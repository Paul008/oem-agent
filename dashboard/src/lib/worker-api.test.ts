import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clonePage, fetchGeneratedPage } from './worker-api'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}))

describe('worker-api clonePage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('does not serialize model overrides for the non-AI clone workflow', async () => {
    await (clonePage as (...args: unknown[]) => Promise<unknown>)(
      'ford-au',
      'mustang',
      'https://www.ford.com.au/showroom/performance/mustang/',
      { provider: 'google_gemini', model: 'gemini-2.5-pro' },
    )

    const fetchMock = vi.mocked(fetch)
    const [, options] = fetchMock.mock.calls[0]

    expect(options?.body).toBe(JSON.stringify({
      source_url: 'https://www.ford.com.au/showroom/performance/mustang/',
    }))
  })
})

describe('worker-api fetchGeneratedPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ slug: 'ford-au-mustang' }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('requests cloned HTML only when the caller needs the rendered page', async () => {
    await fetchGeneratedPage('ford-au-mustang')
    await fetchGeneratedPage('ford-au-mustang', { includeRendered: true })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/pages/ford-au-mustang')
    expect(fetchMock.mock.calls[0][0]).not.toContain('includeRendered=true')
    expect(fetchMock.mock.calls[1][0]).toContain('/api/v1/oem-agent/pages/ford-au-mustang?includeRendered=true')
  })
})
