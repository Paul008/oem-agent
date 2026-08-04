import type { Ref } from 'vue'

import { computed, onScopeDispose, ref, watch } from 'vue'

import type {
  PublicationHistoryEntry,
  PublicationPropagation,
  PublicationState,
  PublicationValidationSummary,
} from '@/lib/model-page-publication'

import {
  buildModelPagePublicationCandidate,
  fetchModelPagePublicationCandidateHtml,
  fetchModelPagePublicationState,
  publishModelPagePublicationCandidate,
  rollbackModelPagePublication,
} from '@/lib/worker-api'

export type ModelPagePublicationStatus = 'none' | 'building' | 'ready' | 'failed' | 'stale'

export function useModelPagePublication(input: {
  pageId: Ref<string | null>
  draftVersion: Ref<number | null>
}) {
  const state = ref<PublicationState | null>(null)
  const history = ref<PublicationHistoryEntry[]>([])
  const validation = ref<PublicationValidationSummary | null>(null)
  const candidatePreviewUrl = ref<string | null>(null)
  const candidateIsStale = ref(false)
  const savedDraftVersion = ref<number | null>(input.draftVersion.value)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const propagation = ref<PublicationPropagation | null>(null)

  const candidate = computed(() => state.value?.candidate ?? null)
  const publishedRevision = computed(() => state.value?.published_revision ?? null)
  const status = computed<ModelPagePublicationStatus>(() => {
    if (!candidate.value)
      return 'none'
    if (candidateIsStale.value || candidate.value.draft_version !== savedDraftVersion.value)
      return 'stale'
    return candidate.value.status
  })
  const canPublish = computed(() => (
    status.value === 'ready'
    && candidate.value?.validation_digest != null
  ))
  const statusLabel = computed(() => {
    switch (status.value) {
      case 'building':
        return 'Building candidate'
      case 'ready':
        return `Candidate ${candidate.value?.revision} ready`
      case 'failed':
        return 'Candidate failed validation'
      case 'stale':
        return 'Candidate required — saved draft changed'
      default:
        return 'Candidate required'
    }
  })

  function requirePageId(): string {
    if (!input.pageId.value)
      throw new Error('A saved model page is required')
    return input.pageId.value
  }

  function requireDraftVersion(): number {
    const version = savedDraftVersion.value
    if (!Number.isInteger(version) || version == null || version <= 0)
      throw new Error('Save the draft before building a candidate')
    return version
  }

  function clearCandidatePreview() {
    if (candidatePreviewUrl.value)
      URL.revokeObjectURL(candidatePreviewUrl.value)
    candidatePreviewUrl.value = null
  }

  async function replaceCandidatePreview(pageId: string, revision: number) {
    const html = await fetchModelPagePublicationCandidateHtml(pageId, revision)
    const nextUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    clearCandidatePreview()
    candidatePreviewUrl.value = nextUrl
  }

  function captureError(cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }

  async function refresh() {
    const pageId = requirePageId()
    isLoading.value = true
    error.value = null
    try {
      const previousCandidateRevision = state.value?.candidate?.revision
      const response = await fetchModelPagePublicationState(pageId)
      state.value = response.state
      history.value = response.history
      propagation.value = null
      candidateIsStale.value = Boolean(
        response.state?.candidate
        && response.state.candidate.draft_version !== savedDraftVersion.value,
      )
      if (response.state?.candidate?.status === 'ready') {
        await replaceCandidatePreview(pageId, response.state.candidate.revision)
      }
      else {
        clearCandidatePreview()
      }
      if (response.state?.candidate?.revision !== previousCandidateRevision)
        validation.value = null
    }
    catch (cause) {
      captureError(cause)
      throw cause
    }
    finally {
      isLoading.value = false
    }
  }

  async function buildCandidate() {
    const pageId = requirePageId()
    const expectedDraftVersion = requireDraftVersion()
    isLoading.value = true
    error.value = null
    propagation.value = null
    try {
      const response = await buildModelPagePublicationCandidate(pageId, expectedDraftVersion)
      state.value = response.state
      validation.value = response.validation
      candidateIsStale.value = response.state.candidate?.draft_version !== savedDraftVersion.value
      await replaceCandidatePreview(pageId, response.revision)
      return response
    }
    catch (cause) {
      captureError(cause)
      throw cause
    }
    finally {
      isLoading.value = false
    }
  }

  async function publish() {
    const pageId = requirePageId()
    const expectedDraftVersion = requireDraftVersion()
    const readyCandidate = candidate.value
    if (!canPublish.value
      || !readyCandidate
      || readyCandidate.draft_version !== expectedDraftVersion
      || !readyCandidate.validation_digest) {
      throw new Error(`Build a candidate for saved draft ${expectedDraftVersion} before publishing`)
    }
    isLoading.value = true
    error.value = null
    try {
      const response = await publishModelPagePublicationCandidate(pageId, {
        revision: readyCandidate.revision,
        expectedDraftVersion,
        validationDigest: readyCandidate.validation_digest,
      })
      const { propagation: nextPropagation, ...nextState } = response
      state.value = nextState
      propagation.value = nextPropagation
      validation.value = null
      candidateIsStale.value = false
      clearCandidatePreview()
      return response
    }
    catch (cause) {
      captureError(cause)
      throw cause
    }
    finally {
      isLoading.value = false
    }
  }

  async function rollback(targetRevision: number) {
    const pageId = requirePageId()
    isLoading.value = true
    error.value = null
    try {
      const response = await rollbackModelPagePublication(pageId, targetRevision)
      const { propagation: nextPropagation, ...nextState } = response
      state.value = nextState
      propagation.value = nextPropagation
      candidateIsStale.value = Boolean(
        nextState.candidate
        && nextState.candidate.draft_version !== savedDraftVersion.value,
      )
      return response
    }
    catch (cause) {
      captureError(cause)
      throw cause
    }
    finally {
      isLoading.value = false
    }
  }

  function markDraftChanged(version: number) {
    savedDraftVersion.value = version
    candidateIsStale.value = Boolean(
      candidate.value
      && candidate.value.draft_version !== version,
    )
  }

  watch(input.draftVersion, (version) => {
    savedDraftVersion.value = version
    candidateIsStale.value = Boolean(
      candidate.value
      && candidate.value.draft_version !== version,
    )
  }, { flush: 'sync' })

  watch(input.pageId, () => {
    state.value = null
    history.value = []
    validation.value = null
    candidateIsStale.value = false
    propagation.value = null
    error.value = null
    clearCandidatePreview()
  }, { flush: 'sync' })

  onScopeDispose(clearCandidatePreview)

  return {
    state,
    candidate,
    history,
    validation,
    candidatePreviewUrl,
    status,
    statusLabel,
    canPublish,
    publishedRevision,
    propagation,
    isLoading,
    error,
    refresh,
    buildCandidate,
    publish,
    rollback,
    markDraftChanged,
  }
}
