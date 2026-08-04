import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComposedPublicationCandidate } from './composer'
import type { PublicationValidationOptions } from './validator'

const publicationMocks = vi.hoisted(() => ({
  compose: vi.fn(),
  validate: vi.fn(),
}))

vi.mock('./composer', () => ({
  composePublicationCandidate: publicationMocks.compose,
}))

vi.mock('./validator', async importOriginal => {
  const actual = await importOriginal<typeof import('./validator')>()
  return { ...actual, validatePublicationCandidate: publicationMocks.validate }
})

import {
  PublicationServiceConflictError,
  buildCandidate,
  getPublicationCandidateValidation,
  getProductionPublication,
  publishCandidate,
  rollbackPublication,
  type DeliverPublicationWebhook,
  type PublicationWebhook,
} from './service'
import { publicationKeys } from './storage'
import type { PublicationState } from './types'
import type { PublicationValidationReport } from './validator'

interface StoredObject {
  body: string | Uint8Array
  etag: string
  options?: R2PutOptions
}

class MemoryR2Bucket {
  readonly objects = new Map<string, StoredObject>()
  readonly puts: Array<{ key: string; options?: R2PutOptions }> = []
  onGet?: (key: string) => void
  private etagSequence = 0

  async get(key: string): Promise<any> {
    this.onGet?.(key)
    const stored = this.objects.get(key)
    if (!stored) return null
    const text = typeof stored.body === 'string'
      ? stored.body
      : new TextDecoder().decode(stored.body)
    return {
      key,
      etag: stored.etag,
      size: typeof stored.body === 'string'
        ? new TextEncoder().encode(stored.body).byteLength
        : stored.body.byteLength,
      httpMetadata: stored.options?.httpMetadata,
      json: async <T>() => JSON.parse(text) as T,
      text: async () => text,
    }
  }

  async put(key: string, value: any, options?: R2PutOptions): Promise<any> {
    this.puts.push({ key, options })
    const current = this.objects.get(key)
    const onlyIf = options?.onlyIf
    if (onlyIf instanceof Headers) {
      if (onlyIf.get('if-none-match') === '*' && current) return null
      if (onlyIf.get('if-match') && onlyIf.get('if-match') !== current?.etag) return null
    } else if (onlyIf?.etagMatches && onlyIf.etagMatches !== current?.etag) {
      return null
    }

    const body = value instanceof Uint8Array ? new Uint8Array(value) : String(value)
    const stored = { body, etag: `etag-${++this.etagSequence}`, options }
    this.objects.set(key, stored)
    return { key, etag: stored.etag }
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key)
  }

  async list(options?: R2ListOptions): Promise<any> {
    const prefix = options?.prefix || ''
    return {
      objects: [...this.objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, etag: value.etag })),
      delimitedPrefixes: [],
      truncated: false,
    }
  }
}

const pageId = 'nissan-au-ariya'
const actor = 'editor@test'
const now = () => '2026-08-04T01:02:03.000Z'

function composedCandidate(): ComposedPublicationCandidate {
  const body = '<main data-oem-publication-body="true"><div>revision</div></main>'
  return {
    body,
    referenceBody: body,
    regions: [{
      regionId: 'features',
      order: 0,
      renderer: 'clone',
      interactionKind: 'none',
      html: '<div>revision</div>',
    }],
    warnings: [],
    bytes: new TextEncoder().encode(body).byteLength,
    sha256: '8a33575abf07021e55727c5b48416fa5eda75c8a839a86c8dbe97c7c93dd88de',
    etag: '"sha256-8a33575abf07021e55727c5b48416fa5eda75c8a839a86c8dbe97c7c93dd88de"',
  }
}

function validationReport(publishable = true, digest?: string): PublicationValidationReport {
  return {
    publishable,
    blocking: publishable ? [] : [{ code: 'visual-mismatch', message: 'Candidate mismatch is blocking' }],
    warnings: [],
    viewports: [],
    digest: digest || (publishable
      ? '2976d29373b8c5ff8a0057beedcd49f9d2917bd45d2fa76fefdde544275ca74b'
      : '62725a008c945bfeed32893595e8bfbb3482c11a0e7d6dfd61986ebbd8a31226'),
  }
}

function buildInput(
  bucket: MemoryR2Bucket,
  overrides: Record<string, unknown> = {},
) {
  return {
    bucket: bucket as unknown as R2Bucket,
    pageId,
    page: { version: 24 },
    expectedDraftVersion: 24,
    actor,
    origin: 'https://admin.test',
    now,
    ...overrides,
  }
}

async function readyCandidate(bucket: MemoryR2Bucket) {
  return buildCandidate(buildInput(bucket))
}

function publishInput(
  bucket: MemoryR2Bucket,
  candidate: Awaited<ReturnType<typeof readyCandidate>>,
  overrides: Record<string, unknown> = {},
) {
  return {
    bucket: bucket as unknown as R2Bucket,
    pageId,
    revision: candidate.revision,
    expectedDraftVersion: 24,
    validationDigest: candidate.validation.digest,
    actor,
    loadCurrentPage: async () => ({ version: 24 }),
    now,
    ...overrides,
  }
}

async function storedJson<T>(bucket: MemoryR2Bucket, key: string): Promise<T> {
  const object = await bucket.get(key)
  if (!object) throw new Error(`Missing test object: ${key}`)
  return object.json() as Promise<T>
}

function overwriteJson(bucket: MemoryR2Bucket, key: string, value: unknown): void {
  const object = bucket.objects.get(key)
  if (!object) throw new Error(`Missing test object: ${key}`)
  object.body = JSON.stringify(value)
}

async function replaceCandidateDigest(bucket: MemoryR2Bucket, digest: string): Promise<void> {
  const key = publicationKeys(pageId).state
  const state = await storedJson<PublicationState>(bucket, key)
  if (!state.candidate) throw new Error('Missing test candidate')
  overwriteJson(bucket, key, {
    ...state,
    candidate: { ...state.candidate, validation_digest: digest },
  })
}

describe('model page publication service', () => {
  beforeEach(() => {
    publicationMocks.compose.mockReset().mockResolvedValue(composedCandidate())
    publicationMocks.validate.mockReset().mockResolvedValue(validationReport())
  })

  it('rejects a stale draft with 409 semantics before allocating a revision', async () => {
    const bucket = new MemoryR2Bucket()

    await expect(buildCandidate(buildInput(bucket, { page: { version: 25 } })))
      .rejects.toMatchObject({ status: 409, code: 'draft_version_conflict' })
    expect(bucket.objects.size).toBe(0)
  })

  it('rejects a non-positive saved draft version before allocating a revision', async () => {
    const bucket = new MemoryR2Bucket()

    await expect(buildCandidate(buildInput(bucket, {
      page: { version: 0 },
      expectedDraftVersion: 0,
    }))).rejects.toMatchObject({ status: 409, code: 'draft_version_conflict' })
    expect(bucket.objects.size).toBe(0)
  })

  it('does not move production when candidate validation fails', async () => {
    const bucket = new MemoryR2Bucket()
    publicationMocks.validate.mockResolvedValueOnce(validationReport(false))
    const result = await buildCandidate(buildInput(bucket))

    expect(result.status).toBe('failed')
    expect(result.state.published_revision).toBeNull()
    expect(result.audit).toEqual({
      page_id: pageId,
      draft_revision: 24,
      candidate_revision: 1,
      published_revision: undefined,
      action: 'publication.candidate.failed',
    })
    expect(bucket.objects.has(publicationKeys(pageId, 1).manifest)).toBe(true)
  })

  it('ignores caller-supplied composer and validator properties', async () => {
    const bucket = new MemoryR2Bucket()
    publicationMocks.validate.mockResolvedValueOnce(validationReport(false))
    const input = {
      ...buildInput(bucket),
      composeCandidate: async () => composedCandidate(),
      validateCandidate: async () => validationReport(true),
    } as Parameters<typeof buildCandidate>[0]

    const result = await buildCandidate(input)

    expect(result.status).toBe('failed')
    expect(result.validation.publishable).toBe(false)
  })

  it('restores the exact canonical validation report for a failed current candidate', async () => {
    const bucket = new MemoryR2Bucket()
    publicationMocks.validate.mockResolvedValueOnce(validationReport(false))
    const candidate = await buildCandidate(buildInput(bucket))

    const restored = await getPublicationCandidateValidation({
      bucket: bucket as unknown as R2Bucket,
      pageId,
    })

    expect(candidate.status).toBe('failed')
    expect(restored).toEqual(validationReport(false))
  })

  it('does not restore candidate validation when its stored digest is not canonical', async () => {
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)
    overwriteJson(bucket, publicationKeys(pageId, candidate.revision).validation, {
      ...validationReport(),
      digest: 'forged-digest',
    })

    await expect(getPublicationCandidateValidation({
      bucket: bucket as unknown as R2Bucket,
      pageId,
    })).resolves.toBeNull()
  })

  it('rejects non-monotonic state before any evidence is written', async () => {
    const bucket = new MemoryR2Bucket()
    await bucket.put(publicationKeys(pageId).state, JSON.stringify({
      schema_version: 1,
      next_revision: 1,
      published_revision: null,
      candidate: null,
      history: [1],
    }))
    publicationMocks.validate.mockImplementationOnce(async (
      _candidate: ComposedPublicationCandidate,
      options: PublicationValidationOptions,
    ) => {
      await options.writeEvidence!({
        key: `${publicationKeys(pageId, 1).evidencePrefix}desktop/candidate.png`,
        bytes: new Uint8Array([1]),
        contentType: 'image/png',
      })
      return validationReport()
    })

    await expect(buildCandidate(buildInput(bucket))).rejects.toThrow('Malformed publication state')
    expect([...bucket.objects.keys()].some(key => key.includes('/evidence/'))).toBe(false)
  })

  it('allocates each revision under state CAS and rejects a stale competing state write', async () => {
    const bucket = new MemoryR2Bucket()
    let releaseComposition!: () => void
    const compositionPaused = new Promise<void>(resolve => { releaseComposition = resolve })
    let compositionStarted!: () => void
    const started = new Promise<void>(resolve => { compositionStarted = resolve })
    publicationMocks.compose.mockImplementationOnce(async () => {
      compositionStarted()
      await compositionPaused
      return composedCandidate()
    })
    const firstBuild = buildCandidate(buildInput(bucket))
    await started

    const second = await readyCandidate(bucket)
    releaseComposition()

    await expect(firstBuild).rejects.toBeInstanceOf(PublicationServiceConflictError)
    expect(second.revision).toBe(2)
    expect(second.state.next_revision).toBe(3)
  })

  it('uses a revision-scoped create-only evidence writer', async () => {
    const bucket = new MemoryR2Bucket()
    publicationMocks.validate.mockImplementationOnce(async (
      _candidate: ComposedPublicationCandidate,
      options: PublicationValidationOptions,
    ) => {
      const key = `${publicationKeys(pageId, 1).evidencePrefix}desktop/candidate.png`
      await options.writeEvidence!({ key, bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' })
      await expect(options.writeEvidence!({ key, bytes: new Uint8Array([4]), contentType: 'image/png' }))
        .rejects.toThrow('Publication revision already exists')
      return validationReport()
    })
    const result = await buildCandidate(buildInput(bucket))

    const evidencePut = bucket.puts.find(({ key }) => key.endsWith('/evidence/desktop/candidate.png'))
    expect(result.status).toBe('ready')
    expect(evidencePut?.options?.onlyIf).toBeInstanceOf(Headers)
    expect((evidencePut?.options?.onlyIf as Headers).get('if-none-match')).toBe('*')
  })

  it('publishes only the ready candidate matching the latest saved draft', async () => {
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)
    let loads = 0
    const published = await publishCandidate(publishInput(bucket, candidate, {
      loadCurrentPage: async () => {
        loads += 1
        return { version: 24 }
      },
    }))

    expect(loads).toBe(1)
    expect(published.published_revision).toBe(candidate.revision)
    expect(published.published_at).toBe('2026-08-04T01:02:03.000Z')
    expect(published.published_by).toBe(actor)
    expect(published.propagation).toBe('delivered')
    expect(published.audit.action).toBe('publication.publish')
    expect(published.audit.published_revision).toBe(candidate.revision)
    const storedManifest = await (await bucket.get(publicationKeys(pageId, candidate.revision).manifest)).json()
    expect(storedManifest.publishedAt).toBeNull()
    expect(storedManifest.publishedBy).toBeNull()
  })

  it('re-reads the saved page immediately before pointer CAS and rejects a changed draft', async () => {
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)

    await expect(publishCandidate(publishInput(bucket, candidate, {
      loadCurrentPage: async () => ({ version: 25 }),
    }))).rejects.toMatchObject({ status: 409, code: 'draft_version_conflict' })

    const state = JSON.parse(await (await bucket.get(publicationKeys(pageId).state)).text()) as PublicationState
    expect(state.published_revision).toBeNull()
  })

  it('checks the saved draft after the CAS preparation read and before its conditional put', async () => {
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)
    let savedVersion = 24
    let stateReads = 0
    bucket.onGet = key => {
      if (key !== publicationKeys(pageId).state) return
      stateReads += 1
      if (stateReads === 2) savedVersion = 25
    }

    await expect(publishCandidate(publishInput(bucket, candidate, {
      loadCurrentPage: async () => ({ version: savedVersion }),
    }))).rejects.toMatchObject({ status: 409, code: 'draft_version_conflict' })

    const state = JSON.parse(await (await bucket.get(publicationKeys(pageId).state)).text()) as PublicationState
    expect(state.published_revision).toBeNull()
  })

  it('rejects stale candidate state, digest, and missing immutable artifacts', async () => {
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)

    await expect(publishCandidate(publishInput(bucket, candidate, { validationDigest: 'wrong' })))
      .rejects.toMatchObject({ status: 409 })

    bucket.objects.delete(publicationKeys(pageId, candidate.revision).body)
    await expect(publishCandidate(publishInput(bucket, candidate)))
      .rejects.toThrow('Publication revision is incomplete')
  })

  it('rejects a self-consistent publishable report that still has blocking findings', async () => {
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)
    const forgedDigest = '13e6fa8f7f00b1fea95fad4402ff41d14de7ce56c4cc338682e259a6f2723889'
    overwriteJson(bucket, publicationKeys(pageId, candidate.revision).validation, {
      publishable: true,
      blocking: [{ code: 'forged', message: 'Still blocking' }],
      warnings: [],
      viewports: [],
      digest: forgedDigest,
    })
    await replaceCandidateDigest(bucket, forgedDigest)

    await expect(publishCandidate(publishInput(bucket, candidate, {
      validationDigest: forgedDigest,
    }))).rejects.toThrow('Publication validation is not publishable')
    expect((await storedJson<PublicationState>(bucket, publicationKeys(pageId).state)).published_revision).toBeNull()
  })

  it('rejects a stored validation digest that is not canonical for its report', async () => {
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)
    overwriteJson(bucket, publicationKeys(pageId, candidate.revision).validation, {
      ...validationReport(),
      digest: 'forged-digest',
    })
    await replaceCandidateDigest(bucket, 'forged-digest')

    await expect(publishCandidate(publishInput(bucket, candidate, {
      validationDigest: 'forged-digest',
    }))).rejects.toThrow('Publication validation digest does not match its report')
  })

  it('reads only the selected manifest and ignores malformed unrelated revisions', async () => {
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)
    await bucket.put(publicationKeys(pageId, 99).manifest, '{malformed')

    const published = await publishCandidate(publishInput(bucket, candidate))

    expect(published.published_revision).toBe(candidate.revision)
  })

  it('does not select a matching embedded revision from the wrong directory', async () => {
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)
    const keys = publicationKeys(pageId, candidate.revision)
    const manifest = await storedJson(bucket, keys.manifest)
    await bucket.put(publicationKeys(pageId, 99).manifest, JSON.stringify(manifest))
    bucket.objects.delete(keys.manifest)

    await expect(publishCandidate(publishInput(bucket, candidate)))
      .rejects.toThrow('Publication revision is incomplete')
  })

  it.each([
    ['byte length', (manifest: Record<string, any>) => ({ ...manifest, bodyBytes: manifest.bodyBytes + 1 })],
    ['SHA-256', (manifest: Record<string, any>) => ({ ...manifest, bodySha256: '0'.repeat(64) })],
    ['ETag', (manifest: Record<string, any>) => ({ ...manifest, etag: '"sha256-forged"' })],
  ])('rejects a manifest with mismatched body %s', async (_label, mutate) => {
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)
    const key = publicationKeys(pageId, candidate.revision).manifest
    const manifest = await storedJson<Record<string, any>>(bucket, key)
    overwriteJson(bucket, key, mutate(manifest))

    await expect(publishCandidate(publishInput(bucket, candidate)))
      .rejects.toThrow('Publication body integrity does not match its manifest')
  })

  it('rejects changed body bytes before moving production', async () => {
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)
    const body = bucket.objects.get(publicationKeys(pageId, candidate.revision).body)!
    body.body = '<main>tampered</main>'

    await expect(publishCandidate(publishInput(bucket, candidate)))
      .rejects.toThrow('Publication body integrity does not match its manifest')
    expect((await storedJson<PublicationState>(bucket, publicationKeys(pageId).state)).published_revision).toBeNull()
  })

  it('keeps the successful pointer and reports failed propagation for delivery errors or non-2xx', async () => {
    const hooks: PublicationWebhook[] = [
      { id: 'dealer-a', url: 'https://dealer-a.test/hook', events: ['page.updated'] },
      { id: 'dealer-b', url: 'https://dealer-b.test/hook', events: ['page.updated'] },
    ]
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)
    const deliverWebhook: DeliverPublicationWebhook = async ({ webhook }) => {
      if (webhook.id === 'dealer-a') return { status: 204 }
      throw new Error('network unavailable')
    }

    const result = await publishCandidate(publishInput(bucket, candidate, { hooks, deliverWebhook }))

    expect(result.propagation).toBe('failed')
    expect(result.published_revision).toBe(candidate.revision)
    const state = JSON.parse(await (await bucket.get(publicationKeys(pageId).state)).text()) as PublicationState
    expect(state.published_revision).toBe(candidate.revision)

    const secondBucket = new MemoryR2Bucket()
    const secondCandidate = await readyCandidate(secondBucket)
    const non2xx = await publishCandidate(publishInput(secondBucket, secondCandidate, {
      hooks: hooks.slice(0, 1),
      deliverWebhook: async () => ({ status: 503 }),
    }))
    expect(non2xx.propagation).toBe('failed')
  })

  it('keeps the successful pointer when the webhook adapter throws synchronously', async () => {
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)
    const deliverWebhook: DeliverPublicationWebhook = () => {
      throw new Error('synchronous adapter failure')
    }

    const result = await publishCandidate(publishInput(bucket, candidate, {
      hooks: [{ id: 'dealer-a', url: 'https://dealer-a.test/hook', events: ['page.updated'] }],
      deliverWebhook,
    }))

    expect(result.propagation).toBe('failed')
    expect(result.published_revision).toBe(candidate.revision)
  })

  it('reports pending propagation when registered hooks have no delivery adapter', async () => {
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)
    const result = await publishCandidate(publishInput(bucket, candidate, {
      hooks: [{ id: 'dealer-a', url: 'https://dealer-a.test/hook', events: ['page.updated'] }],
    }))

    expect(result.propagation).toBe('pending')
    expect(result.published_revision).toBe(candidate.revision)
  })

  it('rolls back by moving only the mutable pointer and retaining the current candidate', async () => {
    const bucket = new MemoryR2Bucket()
    const first = await readyCandidate(bucket)
    await publishCandidate(publishInput(bucket, first))
    const second = await readyCandidate(bucket)
    await publishCandidate(publishInput(bucket, second))
    const third = await readyCandidate(bucket)

    const rolledBack = await rollbackPublication({
      bucket: bucket as unknown as R2Bucket,
      pageId,
      targetRevision: first.revision,
      actor: 'rollback@test',
      now,
    })

    expect(rolledBack.published_revision).toBe(first.revision)
    expect(rolledBack.candidate?.revision).toBe(third.revision)
    expect(rolledBack.next_revision).toBe(4)
    expect(rolledBack.history).toEqual(expect.arrayContaining([first.revision, second.revision]))
    expect(rolledBack.audit.action).toBe('publication.rollback')
  })

  it('verifies rollback target body integrity before moving the pointer', async () => {
    const bucket = new MemoryR2Bucket()
    const first = await readyCandidate(bucket)
    await publishCandidate(publishInput(bucket, first))
    const second = await readyCandidate(bucket)
    await publishCandidate(publishInput(bucket, second))
    bucket.objects.get(publicationKeys(pageId, first.revision).body)!.body = '<main>tampered rollback</main>'

    await expect(rollbackPublication({
      bucket: bucket as unknown as R2Bucket,
      pageId,
      targetRevision: first.revision,
      actor: 'rollback@test',
      now,
    })).rejects.toThrow('Publication body integrity does not match its manifest')
    expect((await storedJson<PublicationState>(bucket, publicationKeys(pageId).state)).published_revision)
      .toBe(second.revision)
  })

  it('prunes revisions outside the retained history without deleting rollback protection', async () => {
    const bucket = new MemoryR2Bucket()
    let previousRevision = 0
    for (let draftVersion = 1; draftVersion <= 12; draftVersion += 1) {
      const candidate = await buildCandidate(buildInput(bucket, {
        page: { version: draftVersion },
        expectedDraftVersion: draftVersion,
      }))
      const result = await publishCandidate(publishInput(bucket, candidate, {
        expectedDraftVersion: draftVersion,
        loadCurrentPage: async () => ({ version: draftVersion }),
      }))
      previousRevision = result.published_revision || 0
    }

    expect(previousRevision).toBe(12)
    expect(bucket.objects.has(publicationKeys(pageId, 1).manifest)).toBe(false)
    expect(bucket.objects.has(publicationKeys(pageId, 2).manifest)).toBe(false)
    expect(bucket.objects.has(publicationKeys(pageId, 3).manifest)).toBe(true)
    expect(bucket.objects.has(publicationKeys(pageId, 12).manifest)).toBe(true)
  })

  it('resolves the canonical production state, manifest, and body metadata', async () => {
    const bucket = new MemoryR2Bucket()
    expect(await getProductionPublication({ bucket: bucket as unknown as R2Bucket, pageId })).toBeNull()
    const candidate = await readyCandidate(bucket)
    await publishCandidate(publishInput(bucket, candidate))

    const production = await getProductionPublication({ bucket: bucket as unknown as R2Bucket, pageId })

    expect(production?.state.published_revision).toBe(candidate.revision)
    expect(production?.manifest.revision).toBe(candidate.revision)
    expect(production?.body.text).toContain('data-oem-publication-body')
    expect(production?.body.key).toBe(publicationKeys(pageId, candidate.revision).body)
    expect(production?.body.contentType).toBe('text/html; charset=utf-8')
    expect(production?.body.etag).toBe(composedCandidate().etag)
  })

  it('resolves only explicitly selected revisions that were previously published', async () => {
    const bucket = new MemoryR2Bucket()
    const first = await readyCandidate(bucket)
    await publishCandidate(publishInput(bucket, first))
    const second = await readyCandidate(bucket)
    await publishCandidate(publishInput(bucket, second))
    const unpublished = await readyCandidate(bucket)

    const historical = await getProductionPublication({
      bucket: bucket as unknown as R2Bucket,
      pageId,
      revision: first.revision,
    })
    const candidate = await getProductionPublication({
      bucket: bucket as unknown as R2Bucket,
      pageId,
      revision: unpublished.revision,
    })

    expect(historical?.manifest.revision).toBe(first.revision)
    expect(historical?.body.key).toBe(publicationKeys(pageId, first.revision).body)
    expect(candidate).toBeNull()
  })

  it('verifies production body integrity before resolving it', async () => {
    const bucket = new MemoryR2Bucket()
    const candidate = await readyCandidate(bucket)
    await publishCandidate(publishInput(bucket, candidate))
    bucket.objects.get(publicationKeys(pageId, candidate.revision).body)!.body = '<main>tampered production</main>'

    await expect(getProductionPublication({ bucket: bucket as unknown as R2Bucket, pageId }))
      .rejects.toThrow('Publication body integrity does not match its manifest')
  })
})
