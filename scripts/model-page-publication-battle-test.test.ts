import { describe, expect, it } from 'vitest'

import {
  evaluatePublicationReport,
  parsePublicationArgs,
  renderPublicationMarkdown,
} from './model-page-publication-battle-test.mjs'

describe('parsePublicationArgs', () => {
  it('defaults to a read-only ARIYA comparison at the required viewports', () => {
    expect(parsePublicationArgs([])).toMatchObject({
      pageId: 'nissan-au-ariya',
      mutate: false,
      publish: false,
      rollback: false,
      viewports: ['desktop', 'tablet', 'mobile'],
      viewportDefinitions: {
        desktop: { width: 1440, height: 1100 },
        tablet: { width: 1024, height: 900 },
        mobile: { width: 390, height: 844 },
      },
    })
  })

  it.each([
    ['--publish'],
    ['--rollback', '21'],
    ['--publish', '--mutate'],
    ['--rollback', '21', '--confirm-production'],
  ])('requires both confirmation flags before mutation: %s', (...args) => {
    expect(() => parsePublicationArgs(args)).toThrow('requires --mutate and --confirm-production')
  })

  it('derives only known URLs from explicit bases and the page ID', () => {
    const options = parsePublicationArgs([
      '--worker-base', 'http://127.0.0.1:8787/',
      '--dashboard-base', 'http://127.0.0.1:4173/',
      '--dealer-base', 'http://127.0.0.1:3000/',
    ])

    expect(options.urls).toEqual({
      history: 'http://127.0.0.1:8787/api/v1/oem-agent/admin/pages/nissan-au-ariya/publication/history',
      candidateHtmlBase: 'http://127.0.0.1:8787/api/v1/oem-agent/admin/pages/nissan-au-ariya/publication/candidate-html',
      manifest: 'http://127.0.0.1:8787/api/v1/oem-agent/pages/nissan-au-ariya/production-manifest',
      publishedBodyBase: 'http://127.0.0.1:8787/api/v1/oem-agent/pages/nissan-au-ariya/production-body-html',
      publish: 'http://127.0.0.1:8787/api/v1/oem-agent/admin/pages/nissan-au-ariya/publication/publish',
      rollback: 'http://127.0.0.1:8787/api/v1/oem-agent/admin/pages/nissan-au-ariya/publication/rollback',
      editor: 'http://127.0.0.1:4173/preview/nissan-au-ariya',
      dealer: 'http://127.0.0.1:3000/models/ariya',
    })
  })

  it('rejects credentials and path-bearing bases', () => {
    expect(() => parsePublicationArgs(['--worker-base', 'https://user:secret@example.com']))
      .toThrow('must not include credentials')
    expect(() => parsePublicationArgs(['--dealer-base', 'https://example.com/sneaky']))
      .toThrow('must be an origin without a path')
  })

  it('supports a deterministic fixture report without a browser or network', () => {
    const options = parsePublicationArgs(['--fixture', '--run-id', 'fixture-run'])
    expect(options.fixture).toBe(true)
    expect(options.runId).toBe('fixture-run')
    expect(options.artifactDir).toBe('artifacts/model-page-publication/fixture-run')
  })
})

describe('evaluatePublicationReport', () => {
  it('blocks revision disagreement, absent platform inventory, CSP errors, overflow and failed interactions', () => {
    const result = evaluatePublicationReport({
      startingRevision: 21,
      expectedRevision: 22,
      mutation: { requested: false, restoration: { attempted: false, verified: false } },
      captures: [{
        target: 'dealer',
        viewport: 'desktop',
        revision: 21,
        response: { status: 200 },
        audit: {
          horizontalOverflowPx: 12,
          failedAssets: [],
          consoleErrors: ['Refused to execute script because of CSP'],
          regionRenderers: [],
          interactions: [{ kind: 'accordion', found: 1, attempted: 1, passed: 0 }],
          variantCount: 0,
          inventoryCount: 0,
          iframeHeight: 100,
        },
      }],
      comparisons: [],
    })

    expect(result.blocking.map(finding => finding.code)).toEqual(expect.arrayContaining([
      'revision-mismatch',
      'horizontal-overflow',
      'csp-error',
      'interaction-failed',
      'variants-missing',
      'inventory-missing',
    ]))
    expect(result.passed).toBe(false)
  })

  it('treats an unverified rollback restoration as blocking', () => {
    const result = evaluatePublicationReport({
      startingRevision: 21,
      expectedRevision: 22,
      mutation: {
        requested: true,
        restoration: { attempted: true, verified: false, error: 'revision stayed at 22' },
      },
      captures: [],
      comparisons: [],
    })

    expect(result.blocking).toContainEqual(expect.objectContaining({ code: 'rollback-restoration-failed' }))
  })

  it('passes consistent captures and blocks an unknown rendered revision', () => {
    const capture = {
      target: 'direct-body',
      viewport: 'mobile',
      revision: 22,
      response: { status: 200 },
      audit: {
        horizontalOverflowPx: 0,
        failedAssets: [],
        brokenImages: [],
        consoleErrors: [],
        interactions: [{ kind: 'accordion', found: 1, attempted: 1, passed: 1 }],
      },
    }
    expect(evaluatePublicationReport({
      expectedRevision: 22,
      mutation: { requested: false },
      captures: [capture],
      comparisons: [{ pair: 'editor-vs-direct', viewport: 'mobile', mismatchPercent: 0.01 }],
    }).passed).toBe(true)

    expect(evaluatePublicationReport({
      expectedRevision: 22,
      mutation: { requested: false },
      captures: [{ ...capture, revision: null }],
      comparisons: [],
    }).blocking).toContainEqual(expect.objectContaining({ code: 'revision-mismatch' }))
  })
})

describe('renderPublicationMarkdown', () => {
  it('lists revision evidence, viewports, screenshots and findings', () => {
    const markdown = renderPublicationMarkdown({
      runId: 'fixture-run',
      createdAt: '2026-08-04T00:00:00.000Z',
      pageId: 'nissan-au-ariya',
      passed: false,
      startingRevision: 21,
      expectedRevision: 22,
      captures: [{
        target: 'dealer',
        viewport: 'mobile',
        revision: 22,
        screenshotPath: 'dealer-mobile.png',
        response: { status: 200, cacheControl: 'public, max-age=300' },
        audit: { variantCount: 4, inventoryCount: 8 },
      }],
      comparisons: [{ viewport: 'mobile', mismatchPercent: 0.05, diffPath: 'diff-mobile.png' }],
      blocking: [{ code: 'example', message: 'Example finding' }],
      warnings: [],
    })

    expect(markdown).toContain('Publication battle test: FAIL')
    expect(markdown).toContain('Starting revision: 21')
    expect(markdown).toContain('dealer-mobile.png')
    expect(markdown).toContain('diff-mobile.png')
    expect(markdown).toContain('Example finding')
  })
})
