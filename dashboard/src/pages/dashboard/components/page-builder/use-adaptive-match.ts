import { computed, reactive, ref } from 'vue'

import type {
  AdaptiveMatchAttempt,
  AdaptiveMatchAttemptQa,
  CandidateGraph,
} from '@/lib/adaptive-match-contracts'
import type {
  AdaptiveMatchApiRequest,
  AdaptiveMatchApiResponse,
  AdaptiveMatchProgressEvent,
} from '@/lib/worker-api'

import { parseAdaptiveMatchGraph, sectionToDeterministicGraph } from '@/lib/adaptive-match-contracts'
import { rankAdaptiveAttempts } from '@/lib/adaptive-match-qa'

export type AdaptiveMatchStage
  = | 'idle'
    | 'capturing'
    | 'detecting'
    | 'building'
    | 'testing'
    | 'repairing'
    | 'ready'
    | 'failed'
    | 'cancelled'

export interface CapturedAdaptiveMatchEvidence {
  contactSheetBase64: string
  evidence: AdaptiveMatchApiRequest['evidence']
}

interface CandidateEvaluation {
  qa: AdaptiveMatchAttemptQa
  contactSheetBase64?: string
}

export interface UseAdaptiveMatchOptions {
  captureEvidence: () => Promise<CapturedAdaptiveMatchEvidence>
  deterministicSection?: Record<string, any> | null
  evaluateCandidate: (
    graph: CandidateGraph,
    context: { attempt: number, evidence: CapturedAdaptiveMatchEvidence },
  ) => Promise<AdaptiveMatchAttemptQa | CandidateEvaluation>
  requestAdaptiveMatch: (
    input: AdaptiveMatchApiRequest,
    options?: { onProgress?: (event: AdaptiveMatchProgressEvent) => void },
  ) => Promise<AdaptiveMatchApiResponse>
  modelOverride?: AdaptiveMatchApiRequest['modelOverride']
}

function createRunId(): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 16)
    ?? Math.random().toString(36).slice(2, 18)
  return `adaptive-${Date.now()}-${random}`
}

function normaliseEvaluation(value: AdaptiveMatchAttemptQa | CandidateEvaluation): CandidateEvaluation {
  return 'qa' in value ? value : { qa: value }
}

export function useAdaptiveMatch(options: UseAdaptiveMatchOptions) {
  const state = reactive<{
    stage: AdaptiveMatchStage
    runId: string
    error: string
  }>({ stage: 'idle', runId: '', error: '' })
  const attempts = ref<AdaptiveMatchAttempt[]>([])
  const progress = ref<AdaptiveMatchProgressEvent | null>(null)
  const candidateGraph = ref<CandidateGraph | null>(null)
  const bestAttempt = computed(() => rankAdaptiveAttempts(attempts.value))
  const bestCandidate = computed(() => bestAttempt.value?.graph ?? null)
  let runToken = 0

  function isCurrent(token: number): boolean {
    return token === runToken && state.stage !== 'cancelled'
  }

  function cancel() {
    runToken += 1
    state.stage = 'cancelled'
    state.error = ''
    progress.value = null
  }

  async function start(): Promise<void> {
    const token = ++runToken
    state.stage = 'capturing'
    state.runId = createRunId()
    state.error = ''
    attempts.value = []
    progress.value = null
    candidateGraph.value = null

    let captured: CapturedAdaptiveMatchEvidence
    try {
      captured = await options.captureEvidence()
    }
    catch (error) {
      if (isCurrent(token)) {
        state.stage = 'failed'
        state.error = error instanceof Error ? error.message : 'OEM evidence capture failed'
      }
      return
    }
    if (!isCurrent(token))
      return

    state.stage = 'detecting'
    const isStatic = captured.evidence.detection.kind === 'static'
      && captured.evidence.detection.requiresAi === false
      && Boolean(options.deterministicSection)

    if (isStatic) {
      try {
        const graph = sectionToDeterministicGraph({
          regionId: captured.evidence.regionId,
          section: options.deterministicSection!,
        })
        candidateGraph.value = graph
        state.stage = 'testing'
        const evaluation = normaliseEvaluation(await options.evaluateCandidate(graph, { attempt: 1, evidence: captured }))
        if (!isCurrent(token))
          return
        attempts.value = [{ attempt: 1, safe: true, graph, qa: evaluation.qa }]
        state.stage = 'ready'
      }
      catch (error) {
        if (!isCurrent(token))
          return
        attempts.value = [{ attempt: 1, safe: false, error: error instanceof Error ? error.message : 'Static candidate failed' }]
        state.error = attempts.value[0].error || ''
        state.stage = 'failed'
      }
      return
    }

    let previousGraph: CandidateGraph | undefined
    let contactSheetBase64 = captured.contactSheetBase64
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (!isCurrent(token))
        return
      const mode = previousGraph ? 'repair' : 'interpret'
      state.stage = mode === 'repair' ? 'repairing' : 'building'
      const qaFailures = attempts.value.flatMap(item => item.qa?.failures ?? [])
      const request: AdaptiveMatchApiRequest = {
        version: 1,
        mode,
        runId: state.runId,
        attempt,
        contactSheetBase64,
        evidence: captured.evidence,
        ...(previousGraph ? { previousGraph } : {}),
        qaFailures,
        ...(options.modelOverride ? { modelOverride: options.modelOverride } : {}),
      }

      let graph: CandidateGraph
      try {
        const response = await options.requestAdaptiveMatch(request, {
          onProgress: (event) => {
            if (isCurrent(token))
              progress.value = event
          },
        })
        if (!isCurrent(token))
          return
        graph = parseAdaptiveMatchGraph(response.graph, captured.evidence.regionId)
      }
      catch (error) {
        if (!isCurrent(token))
          return
        attempts.value = [...attempts.value, {
          attempt,
          safe: false,
          error: (error instanceof Error ? error.message : 'Adaptive Match model failed').slice(0, 2_000),
        }]
        continue
      }

      previousGraph = graph
      candidateGraph.value = graph
      state.stage = 'testing'
      try {
        const evaluation = normaliseEvaluation(await options.evaluateCandidate(graph, { attempt, evidence: captured }))
        if (!isCurrent(token))
          return
        const record: AdaptiveMatchAttempt = { attempt, safe: true, graph, qa: evaluation.qa }
        attempts.value = [...attempts.value, record]
        if (evaluation.contactSheetBase64)
          contactSheetBase64 = evaluation.contactSheetBase64
        if (evaluation.qa.passed) {
          state.stage = 'ready'
          return
        }
      }
      catch (error) {
        if (!isCurrent(token))
          return
        attempts.value = [...attempts.value, {
          attempt,
          safe: false,
          error: (error instanceof Error ? error.message : 'Candidate evaluation failed').slice(0, 2_000),
        }]
      }
    }

    if (!isCurrent(token))
      return
    state.stage = bestAttempt.value ? 'ready' : 'failed'
    state.error = bestAttempt.value ? '' : 'No safe Adaptive Match candidate was produced after three attempts.'
  }

  return {
    state,
    attempts,
    progress,
    candidateGraph,
    bestAttempt,
    bestCandidate,
    start,
    cancel,
  }
}
