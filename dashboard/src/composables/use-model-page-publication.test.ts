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
  const candidate = state.candidate
  return {
    state,
    history: [revisionNine],
    candidateValidation: candidate && candidate.status !== 'building'
      ? { revision: candidate.revision, status: candidate.status, validation }
      : null,
  } as PublicationHistoryResponse
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
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
    expect(publication.candidatePreviewUrl.value).toBeNull()
    expect(revokedUrls).toEqual(['blob:candidate-1'])
    expect(publication.statusLabel.value).toContain('Candidate required')
    await expect(publication.publish()).rejects.toThrow('Build a candidate for saved draft 25 before publishing')
    expect(publishModelPagePublicationCandidate).not.toHaveBeenCalled()
    scope.stop()
  })

  it('never fetches or retains candidate HTML when a deep-linked candidate is stale', async () => {
    vi.mocked(fetchModelPagePublicationState).mockResolvedValueOnce(historyResponse(publicationState({
      candidate: {
        revision: 12,
        draft_version: 23,
        status: 'ready',
        validation_digest: validation.digest,
        created_at: '2026-08-04T08:10:00.000Z',
        created_by: 'editor@example.com',
      },
    })))
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!

    await publication.refresh()

    expect(publication.status.value).toBe('stale')
    expect(publication.candidatePreviewUrl.value).toBeNull()
    expect(fetchModelPagePublicationCandidateHtml).not.toHaveBeenCalled()
    expect(createdUrls).toEqual([])
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
    const { propagation: _propagation, ...publishedState } = published
    vi.mocked(fetchModelPagePublicationState)
      .mockResolvedValueOnce(historyResponse())
      .mockResolvedValueOnce({
        state: publishedState,
        history: [{ ...revisionNine, revision: 12, draftVersion: 24 }, revisionNine],
        candidateValidation: null,
      } as PublicationHistoryResponse)
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

  it('discards an old page response after the page changes', async () => {
    const oldPage = deferred<PublicationHistoryResponse>()
    const newState = publicationState({
      next_revision: 31,
      candidate: {
        revision: 30,
        draft_version: 24,
        status: 'ready',
        validation_digest: validation.digest,
        created_at: '2026-08-04T09:00:00.000Z',
        created_by: 'editor@example.com',
      },
    })
    vi.mocked(fetchModelPagePublicationState)
      .mockReturnValueOnce(oldPage.promise)
      .mockResolvedValueOnce(historyResponse(newState))
    const pageId = ref<string | null>('nissan-au-ariya')
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({ pageId, draftVersion: ref(24) }))!

    const oldRefresh = publication.refresh()
    pageId.value = 'nissan-au-qashqai'
    await publication.refresh()
    oldPage.resolve(historyResponse())
    await oldRefresh

    expect(publication.candidate.value?.revision).toBe(30)
    expect(publication.candidatePreviewUrl.value).toBe('blob:candidate-1')
    scope.stop()
  })

  it('keeps the newest same-page refresh when responses finish out of order', async () => {
    const first = deferred<PublicationHistoryResponse>()
    const second = deferred<PublicationHistoryResponse>()
    const newestState = publicationState({
      next_revision: 23,
      candidate: {
        revision: 22,
        draft_version: 24,
        status: 'ready',
        validation_digest: validation.digest,
        created_at: '2026-08-04T09:00:00.000Z',
        created_by: 'editor@example.com',
      },
    })
    vi.mocked(fetchModelPagePublicationState)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!

    const firstRefresh = publication.refresh()
    const secondRefresh = publication.refresh()
    second.resolve(historyResponse(newestState))
    await secondRefresh
    first.resolve(historyResponse())
    await firstRefresh

    expect(publication.candidate.value?.revision).toBe(22)
    expect(publication.candidatePreviewUrl.value).toBe('blob:candidate-1')
    scope.stop()
  })

  it('does not create a blob URL when scope disposal happens during HTML fetch', async () => {
    const html = deferred<string>()
    vi.mocked(fetchModelPagePublicationCandidateHtml).mockReturnValueOnce(html.promise)
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!

    const refresh = publication.refresh()
    await vi.waitFor(() => expect(fetchModelPagePublicationCandidateHtml).toHaveBeenCalledOnce())
    scope.stop()
    html.resolve('<main>Late candidate</main>')
    await refresh

    expect(createdUrls).toEqual([])
    expect(revokedUrls).toEqual([])
  })

  it('clears an old preview and keeps matching state when replacement HTML fails', async () => {
    const nextState = publicationState({
      next_revision: 14,
      candidate: {
        revision: 13,
        draft_version: 24,
        status: 'ready',
        validation_digest: validation.digest,
        created_at: '2026-08-04T09:00:00.000Z',
        created_by: 'editor@example.com',
      },
    })
    vi.mocked(fetchModelPagePublicationState)
      .mockResolvedValueOnce(historyResponse())
      .mockResolvedValueOnce(historyResponse(nextState))
    vi.mocked(fetchModelPagePublicationCandidateHtml)
      .mockResolvedValueOnce('<main>Candidate 12</main>')
      .mockRejectedValueOnce(new Error('Candidate HTML unavailable'))
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!
    await publication.refresh()

    await expect(publication.refresh()).rejects.toThrow('Candidate HTML unavailable')

    expect(publication.candidate.value?.revision).toBe(12)
    expect(publication.candidatePreviewUrl.value).toBeNull()
    expect(revokedUrls).toEqual(['blob:candidate-1'])
    scope.stop()
  })

  it('restores failed candidate validation and HTML on refresh', async () => {
    const failedValidation = {
      ...validation,
      publishable: false,
      blocking: [{ code: 'horizontal-overflow', message: 'Mobile layout overflows', viewport: 'mobile' as const }],
      digest: 'sha256-failed-13',
    }
    const failedState = publicationState({
      next_revision: 14,
      candidate: {
        revision: 13,
        draft_version: 24,
        status: 'failed',
        validation_digest: failedValidation.digest,
        created_at: '2026-08-04T09:00:00.000Z',
        created_by: 'editor@example.com',
      },
    })
    vi.mocked(fetchModelPagePublicationState).mockResolvedValueOnce({
      state: failedState,
      history: [revisionNine],
      candidateValidation: {
        revision: 13,
        status: 'failed',
        validation: failedValidation,
      },
    } as PublicationHistoryResponse)
    vi.mocked(fetchModelPagePublicationCandidateHtml).mockResolvedValueOnce('<main>Failed candidate 13</main>')
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!

    await publication.refresh()

    expect(publication.status.value).toBe('failed')
    expect(publication.validation.value).toEqual(failedValidation)
    expect(publication.candidatePreviewUrl.value).toBe('blob:candidate-1')
    scope.stop()
  })

  it('stays loading until every overlapping read finishes', async () => {
    const first = deferred<PublicationHistoryResponse>()
    const second = deferred<PublicationHistoryResponse>()
    vi.mocked(fetchModelPagePublicationState)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!

    const firstRefresh = publication.refresh()
    const secondRefresh = publication.refresh()
    expect(publication.isLoading.value).toBe(true)
    second.resolve({ state: null, history: [], candidateValidation: null } as PublicationHistoryResponse)
    await secondRefresh
    expect(publication.isLoading.value).toBe(true)
    first.resolve({ state: null, history: [], candidateValidation: null } as PublicationHistoryResponse)
    await firstRefresh
    expect(publication.isLoading.value).toBe(false)
    scope.stop()
  })

  it('refreshes immutable manifest history after publish', async () => {
    const published = publicationState({
      candidate: null,
      published_revision: 12,
      published_at: '2026-08-04T09:30:00.000Z',
      history: [12, 9],
    }) as PublicationTransitionResponse
    published.propagation = 'delivered'
    const revisionTwelve = { ...revisionNine, revision: 12, draftVersion: 24 }
    vi.mocked(publishModelPagePublicationCandidate).mockResolvedValueOnce(published)
    vi.mocked(fetchModelPagePublicationState)
      .mockResolvedValueOnce(historyResponse())
      .mockResolvedValueOnce({
        state: published,
        history: [revisionTwelve, revisionNine],
        candidateValidation: null,
      } as PublicationHistoryResponse)
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!
    await publication.refresh()

    await publication.publish()

    expect(publication.history.value.map(entry => entry.revision)).toEqual([12, 9])
    expect(publication.publishedRevision.value).toBe(12)
    scope.stop()
  })

  it('keeps authoritative publish success when history reconciliation fails', async () => {
    const published = publicationState({
      candidate: null,
      published_revision: 12,
      published_at: '2026-08-04T09:30:00.000Z',
      history: [12, 9],
    }) as PublicationTransitionResponse
    published.propagation = 'delivered'
    vi.mocked(publishModelPagePublicationCandidate).mockResolvedValueOnce(published)
    vi.mocked(fetchModelPagePublicationState)
      .mockResolvedValueOnce(historyResponse())
      .mockRejectedValueOnce(new Error('History temporarily unavailable'))
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!
    await publication.refresh()

    await expect(publication.publish()).resolves.toBe(published)

    expect(publication.publishedRevision.value).toBe(12)
    expect(publication.candidate.value).toBeNull()
    expect(publication.canPublish.value).toBe(false)
    expect(publication.propagation.value).toBe('delivered')
    expect(publication.error.value).toBeNull()
    expect(publication.reconciliationError.value).toBe('History temporarily unavailable')
    scope.stop()
  })

  it('keeps authoritative rollback success when history reconciliation fails', async () => {
    const rolledBack = publicationState({ published_revision: 9 }) as PublicationTransitionResponse
    rolledBack.propagation = 'delivered'
    vi.mocked(rollbackModelPagePublication).mockResolvedValueOnce(rolledBack)
    vi.mocked(fetchModelPagePublicationState)
      .mockResolvedValueOnce(historyResponse())
      .mockRejectedValueOnce(new Error('History temporarily unavailable'))
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!
    await publication.refresh()

    await expect(publication.rollback(9)).resolves.toBe(rolledBack)

    expect(publication.publishedRevision.value).toBe(9)
    expect(publication.candidate.value?.revision).toBe(12)
    expect(publication.propagation.value).toBe('delivered')
    expect(publication.error.value).toBeNull()
    expect(publication.reconciliationError.value).toBe('History temporarily unavailable')
    scope.stop()
  })

  it('does not attach local propagation to a later external transition snapshot', async () => {
    const published = publicationState({
      candidate: null,
      published_revision: 12,
      published_at: '2026-08-04T09:30:00.000Z',
      history: [12, 9],
    }) as PublicationTransitionResponse
    published.propagation = 'delivered'
    const externalState = publicationState({
      candidate: null,
      published_revision: 9,
      history: [12, 9],
    })
    vi.mocked(publishModelPagePublicationCandidate).mockResolvedValueOnce(published)
    vi.mocked(fetchModelPagePublicationState)
      .mockResolvedValueOnce(historyResponse())
      .mockResolvedValueOnce({
        state: externalState,
        history: [revisionNine],
        candidateValidation: null,
      } as PublicationHistoryResponse)
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!
    await publication.refresh()

    await publication.publish()

    expect(publication.publishedRevision.value).toBe(9)
    expect(publication.propagation.value).toBeNull()
    expect(publication.reconciliationError.value).toBeNull()
    scope.stop()
  })

  it('rejects a second publication mutation while one is in flight', async () => {
    const candidateBuild = deferred<PublicationCandidateResponse>()
    vi.mocked(buildModelPagePublicationCandidate).mockReturnValueOnce(candidateBuild.promise)
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!

    const build = publication.buildCandidate()
    await expect(publication.rollback(9)).rejects.toThrow('Another publication change is already in progress')
    candidateBuild.resolve({
      status: 'ready',
      revision: 12,
      validation,
      state: publicationState(),
    })
    await build
    scope.stop()
  })

  it('keeps mutation gating after a saved draft change invalidates its response', async () => {
    const candidateBuild = deferred<PublicationCandidateResponse>()
    vi.mocked(buildModelPagePublicationCandidate).mockReturnValueOnce(candidateBuild.promise)
    const scope = effectScope()
    const publication = scope.run(() => useModelPagePublication({
      pageId: ref('nissan-au-ariya'),
      draftVersion: ref(24),
    }))!

    const build = publication.buildCandidate()
    publication.markDraftChanged(25)
    await expect(publication.rollback(9)).rejects.toThrow('Another publication change is already in progress')
    candidateBuild.resolve({
      status: 'ready',
      revision: 12,
      validation,
      state: publicationState(),
    })
    await build
    scope.stop()
  })
})
