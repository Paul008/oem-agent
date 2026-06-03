import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clonePage, fetchGeneratedPage, updateClonePage } from './worker-api'

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

  it('requests cloned HTML and modes only when the caller needs them', async () => {
    await fetchGeneratedPage('ford-au-mustang')
    await fetchGeneratedPage('ford-au-mustang', { includeRendered: true, includeModes: true })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/pages/ford-au-mustang')
    expect(fetchMock.mock.calls[0][0]).not.toContain('includeRendered=true')
    expect(fetchMock.mock.calls[0][0]).not.toContain('includeModes=true')
    expect(fetchMock.mock.calls[1][0]).toContain('/api/v1/oem-agent/pages/ford-au-mustang?includeRendered=true&includeModes=true')
  })
})

describe('worker-api updateClonePage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true, version: 6 }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('saves edited clone HTML and section index', async () => {
    await updateClonePage('ford-au', 'mustang', {
      edited_rendered: '<main>Edited Mustang</main>',
      section_index: [{ id: 'r1', label: 'Hero', selector: 'main', tag: 'main', classes: [], top: 0, height: 400, editable_fields: [] }],
    })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/admin/update-clone/ford-au/mustang')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT')
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({
      edited_rendered: '<main>Edited Mustang</main>',
      section_index: [{ id: 'r1', label: 'Hero', selector: 'main', tag: 'main', classes: [], top: 0, height: 400, editable_fields: [] }],
    }))
  })
})
