import { describe, expect, it } from 'vitest'

import type { AdaptiveMatchAttempt, CandidateGraph } from './adaptive-match-contracts'

import { applyCandidateMutation, evaluateAdaptiveCandidate, rankAdaptiveAttempts } from './adaptive-match-qa'

function passingInput(mismatchRatio = 0.03) {
  return {
    viewports: [
      { name: 'desktop' as const, mismatchRatio, horizontalOverflow: false, clippedContent: false },
      { name: 'tablet' as const, mismatchRatio: 0.02, horizontalOverflow: false, clippedContent: false },
      { name: 'mobile' as const, mismatchRatio: 0.01, horizontalOverflow: false, clippedContent: false },
    ],
    interaction: { required: 2, passed: 2, failures: [] as string[] },
    content: { expectedText: 5, matchedText: 5, expectedAssets: 3, matchedAssets: 3 },
  }
}

const graph: CandidateGraph = {
  version: 1,
  kind: 'accordion',
  regionId: 'faq',
  confidence: 0.9,
  section: {
    type: 'accordion',
    title: 'Questions',
    items: [{ question: 'Warranty?', answer: 'Five years.' }],
    allowMultiple: true,
    layoutTokens: {},
    appearanceTokens: {},
  },
  interaction: { kind: 'accordion', allowMultiple: true, keyboard: true },
  provenance: { strategy: 'ai-interpretation', attempt: 1 },
}

describe('evaluateAdaptiveCandidate', () => {
  it('passes the balanced gate at exactly three percent', () => {
    expect(evaluateAdaptiveCandidate(passingInput(0.03))).toMatchObject({
      passed: true,
      worstMismatchRatio: 0.03,
      failureCount: 0,
    })
  })

  it('fails above three percent', () => {
    const result = evaluateAdaptiveCandidate(passingInput(0.030001))
    expect(result.passed).toBe(false)
    expect(result.failures).toContain('desktop pixel mismatch exceeds 3%')
  })

  it('fails when an interaction, content check, or overflow check fails', () => {
    const input = passingInput()
    input.interaction = { required: 2, passed: 1, failures: ['next control did not change the active slide'] }
    input.content.matchedAssets = 2
    input.viewports[2].horizontalOverflow = true

    const result = evaluateAdaptiveCandidate(input)
    expect(result.passed).toBe(false)
    expect(result.failures).toEqual(expect.arrayContaining([
      'next control did not change the active slide',
      '1 required asset is missing',
      'mobile has horizontal overflow',
    ]))
  })
})

describe('rankAdaptiveAttempts', () => {
  it('selects the safe candidate with more interaction and content checks before visual score', () => {
    const attempts = [
      { attempt: 1, safe: true, graph, qa: { ...evaluateAdaptiveCandidate(passingInput(0.08)), interactionPassed: 2, contentMatched: 8 } },
      { attempt: 2, safe: true, graph: { ...graph, provenance: { ...graph.provenance, attempt: 2 } }, qa: { ...evaluateAdaptiveCandidate(passingInput(0.04)), interactionPassed: 1, contentMatched: 8 } },
      { attempt: 3, safe: false, error: 'unsafe output' },
      { attempt: 4, safe: true, graph, qa: { ...evaluateAdaptiveCandidate(passingInput(0)), interactionPassed: 9, contentMatched: 9 } },
    ] as AdaptiveMatchAttempt[]

    expect(rankAdaptiveAttempts(attempts)?.attempt).toBe(1)
  })
})

describe('applyCandidateMutation', () => {
  it('applies an allowlisted section mutation without changing the input graph', () => {
    const result = applyCandidateMutation(graph, {
      version: 1,
      regionId: 'faq',
      operations: [{ op: 'set', path: '/section/title', value: 'Common questions' }],
      explanation: 'Match the source heading.',
    })

    expect(result.section.title).toBe('Common questions')
    expect(graph.section.title).toBe('Questions')
  })

  it('rejects identity and provenance mutations', () => {
    expect(() => applyCandidateMutation(graph, {
      version: 1,
      regionId: 'faq',
      operations: [{ op: 'set', path: '/regionId', value: 'other' }],
      explanation: 'Invalid identity change.',
    })).toThrow(/path/i)
    expect(() => applyCandidateMutation(graph, {
      version: 1,
      regionId: 'faq',
      operations: [{ op: 'set', path: '/provenance/attempt', value: 3 }],
      explanation: 'Invalid provenance change.',
    })).toThrow(/path/i)
  })
})
