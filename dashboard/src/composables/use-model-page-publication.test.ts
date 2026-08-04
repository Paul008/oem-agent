import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'

import type {
  PublicationCandidateResponse,
  PublicationHistoryEntry,
  PublicationHistoryResponse,
  PublicationState,
  PublicationTransitionResponse,
} from '@/lib/model-page-publication'

import {
  buildModelPagePublicationCandidate,
  fetchModelPagePublicationCandidateHtml,
  fetchModelPagePublicationState,
  publishModelPagePublicationCandidate,
  rollbackModelPagePublication,
} from '@/lib/worker-api'

import { useModelPagePublication } from './use-model-page-publication'

vi.mock('@/lib/worker-api', () => ({
  buildModelPagePublicationCandidate: vi.fn(),
  fetchModelPagePublicationCandidateHtml: vi.fn(),
  fetchModelPagePublicationState: vi.fn(),
  publishModelPagePublicationCandidate: vi.fn(),
  rollbackModelPagePublication: vi.fn(),
}))

const validation = {
  publishable: true,
  blocking: [],
  warnings: [],
  viewports: [],
  digest: 'sha256-validation-12',
} satisfies PublicationCandidateResponse['validation']

function publicationState(overrides: Partial<PublicationState> = {}): PublicationState {
  return {
    schema_version: 1,
    next_revision: 13,
    published_revision: 9,
    published_at: '2026-08-04T08:00:00.000Z',
    published_by: 'editor@example.com',
    candidate: {
      revision: 12,
      draft_version: 24,
      status: 'ready',
      validation_digest: validation.digest,
      created_at: '2026-08-04T08:10:00.000Z',
      created_by: 'editor@example.com',
    },
    history: [9],
    ...overrides,
  }
}

const revisionNine = {
  pageId: 'nissan-au-ariya',
  revision: 9,
  draftVersion: 20,
  format: 'composed-html-body' as const,
  bodyPath: 'model-pages/nissan-au-ariya/publication/revisions/9/body.html',
  publishedAt: null,
  publishedBy: null,
  platformRegions: ['hero', 'variants', 'inventory'],
  etag: '"sha256-body-9"',
  bodyBytes: 1400,
  bodySha256: 'sha256-body-9',
  regionRenderers: [{ regionId: 'intro', renderer: 'clone' as const, interactionKind: 'none' }],
} satisfies PublicationHistoryEntry

function historyResponse(state = publicationState()): PublicationHistoryResponse {
  return { state, history: [revisionNine] }
}

describe('useModelPagePublication', () => {
  const createdUrls: string[] = []
  const revokedUrls: string[] = []

  beforeEach(() => {
    createdUrls.length = 0
    revokedUrls.length = 0
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => {
        expect(blob.type).toBe('text/html')
        const url = `blob:candidate-${createdUrls.length + 1}`
        createdUrls.push(url)
        return url
      }),
      revokeObjectURL: vi.fn((url: string) => revokedUrls.push(url)),
    })
    vi.mocked(fetchModelPagePublicationState).mockResolvedValue(historyResponse())
    vi.mocked(fetchModelPagePublicationCandidateHtml).mockResolvedValue('<main>Candidate 12</main>')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('refreshes candidate, production history, and an authenticated blob preview', async () => {
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!

    await publication.refresh()

    expect(publication.status.value).toBe('ready')
    expect(publication.candidate.value?.revision).toBe(12)
    expect(publication.history.value).toEqual([revisionNine])
    expect(publication.candidatePreviewUrl.value).toBe('blob:candidate-1')
    expect(publication.canPublish.value).toBe(true)
    scope.stop()
  })

  it('marks a ready candidate stale when the saved draft version changes', async () => {
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!
    await publication.refresh()

    publication.markDraftChanged(25)

    expect(publication.status.value).toBe('stale')
    expect(publication.canPublish.value).toBe(false)
    expect(publication.statusLabel.value).toContain('Candidate required')
    await expect(publication.publish()).rejects.toThrow('Build a candidate for saved draft 25 before publishing')
    expect(publishModelPagePublicationCandidate).not.toHaveBeenCalled()
    scope.stop()
  })

  it('keeps a failed validation visible but never publishable', async () => {
    const failedValidation = {
      ...validation,
      publishable: false,
      blocking: [{ code: 'horizontal-overflow', message: 'Mobile layout overflows', viewport: 'mobile' as const }],
      digest: 'sha256-failed-13',
    }
    const state = publicationState({
      next_revision: 14,
      candidate: {
        revision: 13,
        draft_version: 24,
        status: 'failed',
        validation_digest: failedValidation.digest,
        created_at: '2026-08-04T08:20:00.000Z',
        created_by: 'editor@example.com',
      },
    })
    vi.mocked(buildModelPagePublicationCandidate).mockResolvedValue({
      status: 'failed',
      revision: 13,
      validation: failedValidation,
      state,
    })
    vi.mocked(fetchModelPagePublicationCandidateHtml).mockResolvedValue('<main>Failed candidate</main>')
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!

    await publication.buildCandidate()

    expect(publication.status.value).toBe('failed')
    expect(publication.validation.value).toEqual(failedValidation)
    expect(publication.candidatePreviewUrl.value).toBe('blob:candidate-1')
    expect(publication.canPublish.value).toBe(false)
    scope.stop()
  })

  it('revokes the prior blob URL on replacement and the current URL on scope disposal', async () => {
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!
    await publication.refresh()
    await publication.refresh()

    expect(revokedUrls).toEqual(['blob:candidate-1'])
    expect(publication.candidatePreviewUrl.value).toBe('blob:candidate-2')

    scope.stop()
    expect(revokedUrls).toEqual(['blob:candidate-1', 'blob:candidate-2'])
  })

  it('publishes only the current ready candidate and clears its preview', async () => {
    const published = publicationState({
      candidate: null,
      published_revision: 12,
      published_at: '2026-08-04T08:30:00.000Z',
      history: [12, 9],
    }) as PublicationTransitionResponse
    published.propagation = 'delivered'
    vi.mocked(publishModelPagePublicationCandidate).mockResolvedValue(published)
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!
    await publication.refresh()

    await publication.publish()

    expect(publication.publishedRevision.value).toBe(12)
    expect(publication.candidate.value).toBeNull()
    expect(publication.candidatePreviewUrl.value).toBeNull()
    expect(revokedUrls).toEqual(['blob:candidate-1'])
    scope.stop()
  })

  it('rolls production back without rebuilding or discarding the candidate', async () => {
    const rolledBack = publicationState({ published_revision: 9 }) as PublicationTransitionResponse
    rolledBack.propagation = 'delivered'
    vi.mocked(rollbackModelPagePublication).mockResolvedValue(rolledBack)
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!
    await publication.refresh()

    await publication.rollback(9)

    expect(publication.publishedRevision.value).toBe(9)
    expect(publication.candidate.value?.revision).toBe(12)
    expect(buildModelPagePublicationCandidate).not.toHaveBeenCalled()
    scope.stop()
  })
})
