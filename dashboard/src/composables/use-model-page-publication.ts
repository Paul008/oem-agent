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

export function resolvePublicationPreviewView(
  requestedView: string,
  candidateStatus: ModelPagePublicationStatus,
  candidatePreviewUrl: string | null,
): string {
  if (requestedView === 'candidate' && (candidateStatus === 'stale' || !candidatePreviewUrl))
    return 'edit'
  return requestedView
}

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
  const pendingOperations = ref(0)
  const error = ref<string | null>(null)
  const reconciliationError = ref<string | null>(null)
  const propagation = ref<PublicationPropagation | null>(null)
  let pageGeneration = 0
  let requestSequence = 0
  let latestRequest = 0
  let disposed = false

  interface OperationContext {
    pageId: string
    pageGeneration: number
    requestId: number
  }

  let activeMutation: OperationContext | null = null

  const candidate = computed(() => state.value?.candidate ?? null)
  const publishedRevision = computed(() => state.value?.published_revision ?? null)
  const isLoading = computed(() => pendingOperations.value > 0)
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
    && validation.value?.publishable === true
    && validation.value.digest === candidate.value.validation_digest
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

  function candidateMatchesSavedDraft(candidateToCheck: PublicationState['candidate'] | undefined): boolean {
    return Boolean(
      candidateToCheck
      && candidateToCheck.draft_version === savedDraftVersion.value,
    )
  }

  function beginOperation(pageId: string): OperationContext {
    if (disposed)
      throw new Error('Model page publication scope has been disposed')
    const context = {
      pageId,
      pageGeneration,
      requestId: ++requestSequence,
    }
    latestRequest = context.requestId
    pendingOperations.value += 1
    return context
  }

  function beginMutation(pageId: string): OperationContext {
    if (activeMutation)
      throw new Error('Another publication change is already in progress')
    const context = beginOperation(pageId)
    activeMutation = context
    return context
  }

  function isCurrent(context: OperationContext): boolean {
    return !disposed
      && context.pageGeneration === pageGeneration
      && context.requestId === latestRequest
      && context.pageId === input.pageId.value
  }

  function finishOperation(context: OperationContext) {
    pendingOperations.value = Math.max(0, pendingOperations.value - 1)
    if (activeMutation === context)
      activeMutation = null
  }

  function invalidateRequests(options: { releaseMutation?: boolean } = {}) {
    pageGeneration += 1
    latestRequest = ++requestSequence
    if (options.releaseMutation)
      activeMutation = null
  }

  async function fetchCandidatePreview(
    context: OperationContext,
    revision: number,
  ): Promise<string | null> {
    if (!isCurrent(context))
      return null
    clearCandidatePreview()
    const html = await fetchModelPagePublicationCandidateHtml(context.pageId, revision)
    if (!isCurrent(context))
      return null
    const nextUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    if (!isCurrent(context)) {
      URL.revokeObjectURL(nextUrl)
      return null
    }
    return nextUrl
  }

  async function fetchAndCommitSnapshot(context: OperationContext) {
    const response = await fetchModelPagePublicationState(context.pageId)
    if (!isCurrent(context))
      return response
    const nextCandidate = response.state?.candidate
    let nextPreviewUrl: string | null = null
    const candidateIsCurrentDraft = candidateMatchesSavedDraft(nextCandidate)
    if (candidateIsCurrentDraft && (nextCandidate?.status === 'ready' || nextCandidate?.status === 'failed')) {
      nextPreviewUrl = await fetchCandidatePreview(context, nextCandidate.revision)
      if (!isCurrent(context))
        return response
    }
    else {
      clearCandidatePreview()
    }
    if (!isCurrent(context)) {
      if (nextPreviewUrl)
        URL.revokeObjectURL(nextPreviewUrl)
      return response
    }
    state.value = response.state
    history.value = response.history
    validation.value = response.candidateValidation?.validation ?? null
    candidateIsStale.value = Boolean(nextCandidate && !candidateIsCurrentDraft)
    candidatePreviewUrl.value = nextPreviewUrl
    return response
  }

  function captureError(cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }

  function commitTransition(response: PublicationState & { propagation: PublicationPropagation }) {
    const { propagation: nextPropagation, ...nextState } = response
    const previousCandidate = state.value?.candidate
    const nextCandidate = nextState.candidate
    const candidateMatches = previousCandidate?.revision === nextCandidate?.revision
      && previousCandidate?.status === nextCandidate?.status
      && previousCandidate?.draft_version === nextCandidate?.draft_version
      && previousCandidate?.validation_digest === nextCandidate?.validation_digest
    state.value = nextState
    candidateIsStale.value = Boolean(
      nextCandidate
      && nextCandidate.draft_version !== savedDraftVersion.value,
    )
    if (!candidateMatches || candidateIsStale.value) {
      validation.value = null
      clearCandidatePreview()
    }
    propagation.value = nextPropagation
  }

  async function reconcileTransition(
    context: OperationContext,
    transition: PublicationState & { propagation: PublicationPropagation },
  ) {
    try {
      const snapshot = await fetchAndCommitSnapshot(context)
      if (!isCurrent(context))
        return
      propagation.value = snapshot.state?.published_revision === transition.published_revision
        ? transition.propagation
        : null
      reconciliationError.value = null
    }
    catch (cause) {
      if (isCurrent(context))
        reconciliationError.value = cause instanceof Error ? cause.message : String(cause)
    }
  }

  async function refresh() {
    const pageId = requirePageId()
    if (activeMutation)
      throw new Error('Another publication change is already in progress')
    const context = beginOperation(pageId)
    error.value = null
    reconciliationError.value = null
    try {
      const response = await fetchAndCommitSnapshot(context)
      if (isCurrent(context))
        propagation.value = null
      return response
    }
    catch (cause) {
      if (isCurrent(context))
        captureError(cause)
      throw cause
    }
    finally {
      finishOperation(context)
    }
  }

  async function buildCandidate() {
    const pageId = requirePageId()
    const expectedDraftVersion = requireDraftVersion()
    const context = beginMutation(pageId)
    error.value = null
    reconciliationError.value = null
    propagation.value = null
    try {
      const response = await buildModelPagePublicationCandidate(pageId, expectedDraftVersion)
      if (!isCurrent(context))
        return response
      const nextCandidate = response.state.candidate
      const candidateIsCurrentDraft = candidateMatchesSavedDraft(nextCandidate)
      const nextPreviewUrl = candidateIsCurrentDraft
        && (nextCandidate?.status === 'ready' || nextCandidate?.status === 'failed')
        ? await fetchCandidatePreview(context, response.revision)
        : null
      if (!isCurrent(context))
        return response
      if (!candidateIsCurrentDraft)
        clearCandidatePreview()
      state.value = response.state
      validation.value = response.validation
      candidateIsStale.value = Boolean(nextCandidate && !candidateIsCurrentDraft)
      candidatePreviewUrl.value = nextPreviewUrl
      return response
    }
    catch (cause) {
      if (isCurrent(context))
        captureError(cause)
      throw cause
    }
    finally {
      finishOperation(context)
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
    const context = beginMutation(pageId)
    error.value = null
    reconciliationError.value = null
    try {
      const response = await publishModelPagePublicationCandidate(pageId, {
        revision: readyCandidate.revision,
        expectedDraftVersion,
        validationDigest: readyCandidate.validation_digest,
      })
      if (!isCurrent(context))
        return response
      commitTransition(response)
      await reconcileTransition(context, response)
      return response
    }
    catch (cause) {
      if (isCurrent(context))
        captureError(cause)
      throw cause
    }
    finally {
      finishOperation(context)
    }
  }

  async function rollback(targetRevision: number) {
    const pageId = requirePageId()
    const context = beginMutation(pageId)
    error.value = null
    reconciliationError.value = null
    try {
      const expectedPublishedRevision = publishedRevision.value
      if (expectedPublishedRevision == null)
        throw new Error('No published revision is available to roll back')
      const response = await rollbackModelPagePublication(pageId, targetRevision, expectedPublishedRevision)
      if (!isCurrent(context))
        return response
      commitTransition(response)
      await reconcileTransition(context, response)
      return response
    }
    catch (cause) {
      if (isCurrent(context))
        captureError(cause)
      throw cause
    }
    finally {
      finishOperation(context)
    }
  }

  function markDraftChanged(version: number) {
    invalidateRequests()
    savedDraftVersion.value = version
    candidateIsStale.value = Boolean(
      candidate.value
      && candidate.value.draft_version !== version,
    )
    if (candidateIsStale.value)
      clearCandidatePreview()
  }

  watch(input.draftVersion, (version) => {
    invalidateRequests()
    savedDraftVersion.value = version
    candidateIsStale.value = Boolean(
      candidate.value
      && candidate.value.draft_version !== version,
    )
    if (candidateIsStale.value)
      clearCandidatePreview()
  }, { flush: 'sync' })

  watch(input.pageId, () => {
    invalidateRequests({ releaseMutation: true })
    state.value = null
    history.value = []
    validation.value = null
    candidateIsStale.value = false
    propagation.value = null
    error.value = null
    reconciliationError.value = null
    clearCandidatePreview()
  }, { flush: 'sync' })

  onScopeDispose(() => {
    disposed = true
    invalidateRequests({ releaseMutation: true })
    clearCandidatePreview()
  })

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
    reconciliationError,
    refresh,
    buildCandidate,
    publish,
    rollback,
    markDraftChanged,
  }
}
