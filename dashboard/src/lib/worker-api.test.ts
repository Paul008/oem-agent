import { beforeEach, describe, expect, it, vi } from 'vitest'

import { supabase } from '@/lib/supabase'

import {
  adaptivePipeline,
  buildModelPagePublicationCandidate,
  clonePage,
  compileTailwindRecipeArtifact,
  createSubpage,
  fetchCompileRunStatus,
  fetchGeneratedPage,
  fetchGeneratedPages,
  fetchModelPagePublicationCandidateHtml,
  fetchModelPagePublicationState,
  importLegacyPage,
  mapAndStructurePage,
  publishModelPagePublicationCandidate,
  rollbackModelPagePublication,
  saveDealerOverrides,
  updateClonePage,
  updatePageSections,
  workerTextFetch,
} from './worker-api'

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

describe('worker-api adaptivePipeline', () => {
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

  it('serializes force clone refresh requests for full preview rebuilds', async () => {
    await adaptivePipeline('volkswagen-au', 'amarok', { forceClone: true })

    const fetchMock = vi.mocked(fetch)
    const [, options] = fetchMock.mock.calls[0]

    expect(options?.method).toBe('POST')
    expect(options?.body).toBe(JSON.stringify({ force_clone: true }))
  })

  it('keeps the legacy source URL and model override signature compatible', async () => {
    await adaptivePipeline(
      'ford-au',
      'mustang',
      'https://www.ford.com.au/showroom/performance/mustang/',
      { provider: 'google_gemini', model: 'gemini-2.5-pro' },
    )

    const fetchMock = vi.mocked(fetch)
    const [, options] = fetchMock.mock.calls[0]

    expect(options?.body).toBe(JSON.stringify({
      source_url: 'https://www.ford.com.au/showroom/performance/mustang/',
      modelOverride: { provider: 'google_gemini', model: 'gemini-2.5-pro' },
    }))
  })
})

describe('worker-api fetchCompileRunStatus', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({
          runId: 'volkswagen-au:amarok:1',
          status: 'capturing',
          stageLabel: 'Capturing source page',
          startedAt: '2026-07-03T00:00:00.000Z',
          updatedAt: '2026-07-03T00:00:01.000Z',
          completedAt: null,
          error: null,
          warnings: [],
          artifacts: [],
        }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('reads the compile run status for a model page', async () => {
    const status = await fetchCompileRunStatus('volkswagen-au', 'amarok')

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toBe('https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/compile-status/volkswagen-au/amarok')
    expect(status).toMatchObject({
      runId: 'volkswagen-au:amarok:1',
      status: 'capturing',
      stageLabel: 'Capturing source page',
    })
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

  it('uses the Worker host for generated page list and detail reads', async () => {
    await fetchGeneratedPages('mazda-au')
    await fetchGeneratedPage('mazda-au-cx-5', { includeRendered: true, includeModes: true })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toBe('https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages?oemId=mazda-au')
    expect(fetchMock.mock.calls[1][0]).toBe('https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/mazda-au-cx-5?includeRendered=true&includeModes=true')
  })

  it('requests modes without cloned HTML when only modes are needed', async () => {
    await fetchGeneratedPage('ford-au-mustang', { includeModes: true })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/pages/ford-au-mustang?includeModes=true')
    expect(fetchMock.mock.calls[0][0]).not.toContain('includeRendered=true')
  })

  it('sends Supabase Authorization on generated page reads', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: { access_token: 'supabase-token' } },
    } as any)

    await fetchGeneratedPage('toyota-au-rav4', { includeRendered: true, includeModes: true })

    const fetchMock = vi.mocked(fetch)
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer supabase-token')
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include')
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

  it('saves edited clone HTML without replacing the section index', async () => {
    await updateClonePage('ford-au', 'mustang', {
      edited_rendered: '<main>Edited Mustang</main>',
    })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/admin/update-clone/ford-au/mustang')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT')
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({
      edited_rendered: '<main>Edited Mustang</main>',
    }))
    expect(fetchMock.mock.calls[0][1]?.body).not.toContain('section_index')
  })
})

describe('worker-api mapAndStructurePage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true, mapping_source: 'deterministic' }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('serializes selected model overrides for AI fallback', async () => {
    await mapAndStructurePage('ford-au', 'mustang', {
      provider: 'google_gemini',
      model: 'gemini-2.5-pro',
    })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/admin/map-and-structure/ford-au/mustang')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({
      modelOverride: {
        provider: 'google_gemini',
        model: 'gemini-2.5-pro',
      },
    }))
  })

  it('omits the request body when no model override is selected', async () => {
    await mapAndStructurePage('ford-au', 'mustang')

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined()
  })
})

describe('worker-api compileTailwindRecipeArtifact', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true, result: { section_type: 'variant-color-explorer' } }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('posts the captured artifact to the Tailwind recipe compiler endpoint', async () => {
    const artifact = {
      oem_id: 'mitsubishi-au',
      model_slug: 'outlander',
      source_url: 'https://www.mitsubishi-motors.com.au/vehicles/outlander.html',
      region_id: 'range-picker',
      viewport: { name: 'desktop', width: 1440, height: 1200 },
      root: {
        path: '0',
        tag: 'section',
        text: 'Make Your Mark.',
        attributes: { class: 'range-selector' },
        computed_style: { display: 'grid' },
        children: [],
      },
    }

    await compileTailwindRecipeArtifact(artifact)

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/admin/compile-tailwind-recipe')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({ artifact }))
  })
})

describe('worker-api protected model page writes', () => {
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

  it.each([
    ['clonePage', () => clonePage('gac-au', 'emkoo')],
    ['adaptivePipeline', () => adaptivePipeline('foton-au', 'tunland')],
    ['updateClonePage', () => updateClonePage('gac-au', 'emkoo', { edited_rendered: '<main />' })],
    ['updatePageSections', () => updatePageSections('foton-au', 'tunland', [])],
    ['createSubpage', () => createSubpage('gac-au', 'emkoo', 'specs', 'Specifications', 'specs')],
    ['saveDealerOverrides', () => saveDealerOverrides('foton-au', 'tunland', { dealer_name: 'Dealer' })],
    ['importLegacyPage', () => importLegacyPage('gac-au', 'emkoo', undefined, { header: {}, content: {} })],
  ])('blocks %s before making a request', async (_, call) => {
    await expect(call()).rejects.toThrow('protected from dashboard writes')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('worker-api publication requests', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('candidate-html')) {
          return new Response('<main>Candidate 12</main>', {
            headers: { 'content-type': 'text/html; charset=utf-8' },
          })
        }
        if (url.endsWith('/history')) {
          return new Response(JSON.stringify({ state: null, history: [] }), {
            headers: { 'content-type': 'application/json' },
          })
        }
        if (url.endsWith('/candidate')) {
          return new Response(JSON.stringify({
            status: 'ready',
            revision: 12,
            validation: {
              publishable: true,
              blocking: [],
              warnings: [],
              viewports: [],
              digest: 'sha256-validation-12',
            },
            state: {
              schema_version: 1,
              next_revision: 13,
              published_revision: 9,
              published_at: '2026-08-04T08:00:00.000Z',
              published_by: 'editor@example.com',
              candidate: {
                revision: 12,
                draft_version: 24,
                status: 'ready',
                validation_digest: 'sha256-validation-12',
                created_at: '2026-08-04T08:10:00.000Z',
                created_by: 'editor@example.com',
              },
              history: [9],
            },
          }), {
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({
          schema_version: 1,
          next_revision: 13,
          published_revision: 9,
          published_at: '2026-08-04T08:00:00.000Z',
          published_by: 'editor@example.com',
          candidate: null,
          history: [9],
          propagation: 'delivered',
        }), {
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
  })

  it('maps publication history to the Task 5 admin route', async () => {
    await fetchModelPagePublicationState('nissan-au-ariya')

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      'https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/pages/nissan-au-ariya/publication/history',
    )
  })

  it('sends the saved draft version when building a candidate', async () => {
    await buildModelPagePublicationCandidate('nissan-au-ariya', 24)

    const [url, options] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/pages/nissan-au-ariya/publication/candidate')
    expect(options?.method).toBe('POST')
    expect(options?.body).toBe(JSON.stringify({ expectedDraftVersion: 24 }))
  })

  it('sends the ready candidate identity when publishing', async () => {
    await publishModelPagePublicationCandidate('nissan-au-ariya', {
      revision: 12,
      expectedDraftVersion: 24,
      validationDigest: 'sha256-validation-12',
    })

    const [, options] = vi.mocked(fetch).mock.calls[0]
    expect(options?.method).toBe('POST')
    expect(options?.body).toBe(JSON.stringify({
      revision: 12,
      expectedDraftVersion: 24,
      validationDigest: 'sha256-validation-12',
    }))
  })

  it('sends only the published target revision when rolling back', async () => {
    await rollbackModelPagePublication('nissan-au-ariya', 9)

    const [, options] = vi.mocked(fetch).mock.calls[0]
    expect(options?.method).toBe('POST')
    expect(options?.body).toBe(JSON.stringify({ targetRevision: 9 }))
  })

  it('fetches candidate HTML with the same session authentication as JSON requests', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: { access_token: 'candidate-token' } },
    } as any)

    const html = await fetchModelPagePublicationCandidateHtml('nissan-au-ariya', 12)

    const [url, options] = vi.mocked(fetch).mock.calls[0]
    const headers = new Headers(options?.headers)
    expect(url).toBe('https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/pages/nissan-au-ariya/publication/candidate-html?revision=12')
    expect(html).toBe('<main>Candidate 12</main>')
    expect(headers.get('Authorization')).toBe('Bearer candidate-token')
    expect(options?.credentials).toBe('include')
  })

  it('surfaces text-response HTTP status and response details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        error: 'Ready publication candidate no longer matches',
        code: 'candidate_conflict',
      }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      })),
    )

    await expect(workerTextFetch('/admin/pages/nissan-au-ariya/publication/candidate-html?revision=12'))
      .rejects
      .toThrow('Worker API error 409: {"error":"Ready publication candidate no longer matches","code":"candidate_conflict"}')
  })
})
