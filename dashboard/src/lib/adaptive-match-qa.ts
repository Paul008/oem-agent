import type {
  AdaptiveMatchAttempt,
  AdaptiveMatchAttemptQa,
  CandidateGraph,
  CandidateMutation,
} from './adaptive-match-contracts'

import { adaptiveMatchGraphSchema, candidateMutationSchema } from './adaptive-match-contracts'

interface ViewportQaInput {
  name: 'desktop' | 'tablet' | 'mobile'
  mismatchRatio: number
  horizontalOverflow: boolean
  clippedContent: boolean
}

interface CandidateQaInput {
  viewports: ViewportQaInput[]
  interaction: { required: number, passed: number, failures: string[] }
  content: { expectedText: number, matchedText: number, expectedAssets: number, matchedAssets: number }
}

export function evaluateAdaptiveCandidate(input: CandidateQaInput): AdaptiveMatchAttemptQa {
  const failures: string[] = []
  const viewportNames = ['desktop', 'tablet', 'mobile'] as const
  for (const name of viewportNames) {
    const viewport = input.viewports.find(item => item.name === name)
    if (!viewport) {
      failures.push(`${name} viewport was not tested`)
      continue
    }
    if (!Number.isFinite(viewport.mismatchRatio) || viewport.mismatchRatio > 0.03)
      failures.push(`${name} pixel mismatch exceeds 3%`)
    if (viewport.horizontalOverflow)
      failures.push(`${name} has horizontal overflow`)
    if (viewport.clippedContent)
      failures.push(`${name} has clipped content`)
  }

  failures.push(...input.interaction.failures)
  if (input.interaction.passed < input.interaction.required && !input.interaction.failures.length)
    failures.push(`${input.interaction.required - input.interaction.passed} interaction check failed`)

  const missingText = Math.max(0, input.content.expectedText - input.content.matchedText)
  const missingAssets = Math.max(0, input.content.expectedAssets - input.content.matchedAssets)
  if (missingText)
    failures.push(`${missingText} required text item${missingText === 1 ? '' : 's'} ${missingText === 1 ? 'is' : 'are'} missing`)
  if (missingAssets)
    failures.push(`${missingAssets} required asset${missingAssets === 1 ? '' : 's'} ${missingAssets === 1 ? 'is' : 'are'} missing`)

  const worstMismatchRatio = input.viewports.reduce((worst, viewport) => Math.max(worst, Number.isFinite(viewport.mismatchRatio) ? viewport.mismatchRatio : 1), 0)
  const overflowFailures = input.viewports.reduce((count, viewport) => count + Number(viewport.horizontalOverflow) + Number(viewport.clippedContent), 0)
  return {
    passed: failures.length === 0,
    failures,
    failureCount: failures.length,
    worstMismatchRatio,
    interactionPassed: input.interaction.passed,
    contentMatched: input.content.matchedText + input.content.matchedAssets,
    overflowFailures,
  }
}

export function rankAdaptiveAttempts(attempts: AdaptiveMatchAttempt[]): AdaptiveMatchAttempt | null {
  const candidates = attempts.slice(0, 3).filter(attempt => attempt.safe && attempt.graph && attempt.qa)
  candidates.sort((left, right) => {
    const a = left.qa!
    const b = right.qa!
    return b.interactionPassed - a.interactionPassed
      || b.contentMatched - a.contentMatched
      || a.worstMismatchRatio - b.worstMismatchRatio
      || a.overflowFailures - b.overflowFailures
      || a.failureCount - b.failureCount
      || left.attempt - right.attempt
  })
  return candidates[0] ?? null
}

function decodePointer(path: string): string[] {
  if (!/^\/(?:section|interaction)(?:\/|$)/.test(path))
    throw new Error(`Mutation path is not allowed: ${path}`)
  const segments = path.slice(1).split('/').map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
  if (segments.some(segment => !segment || ['__proto__', 'prototype', 'constructor'].includes(segment)))
    throw new Error(`Mutation path is not allowed: ${path}`)
  return segments
}

function parentAt(root: any, segments: string[]): { parent: any, key: string } {
  const key = segments.at(-1)!
  let parent = root
  for (const segment of segments.slice(0, -1)) {
    if (parent == null || typeof parent !== 'object' || !(segment in parent))
      throw new Error(`Mutation path does not exist: /${segments.join('/')}`)
    parent = parent[segment]
  }
  return { parent, key }
}

function readAt(root: any, path: string): unknown {
  const segments = decodePointer(path)
  return segments.reduce((value, segment) => {
    if (value == null || typeof value !== 'object' || !(segment in value))
      throw new Error(`Mutation source does not exist: ${path}`)
    return value[segment]
  }, root)
}

export function applyCandidateMutation(graph: CandidateGraph, input: CandidateMutation): CandidateGraph {
  const mutation = candidateMutationSchema.parse(input)
  if (mutation.regionId !== graph.regionId)
    throw new Error(`Mutation region mismatch: expected ${graph.regionId}, received ${mutation.regionId}`)
  const next = structuredClone(graph) as any

  for (const operation of mutation.operations) {
    const segments = decodePointer(operation.path)
    const { parent, key } = parentAt(next, segments)
    if (operation.op === 'set') {
      parent[key] = structuredClone(operation.value)
      continue
    }
    if (operation.op === 'insert') {
      if (!Array.isArray(parent))
        throw new Error(`Insert target is not an array: ${operation.path}`)
      const index = key === '-' ? parent.length : Number(key)
      if (!Number.isInteger(index) || index < 0 || index > parent.length)
        throw new Error(`Invalid insert index: ${operation.path}`)
      parent.splice(index, 0, structuredClone(operation.value))
      continue
    }
    if (operation.op === 'remove') {
      if (Array.isArray(parent))
        parent.splice(Number(key), 1)
      else delete parent[key]
      continue
    }
    if (!operation.from)
      throw new Error('Move operations require a source path')
    const moved = structuredClone(readAt(next, operation.from))
    const source = parentAt(next, decodePointer(operation.from))
    if (Array.isArray(source.parent))
      source.parent.splice(Number(source.key), 1)
    else delete source.parent[source.key]
    parent[key] = moved
  }

  return adaptiveMatchGraphSchema.parse(next)
}
