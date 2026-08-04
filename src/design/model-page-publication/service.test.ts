import { describe, expect, it } from 'vitest'
import type { ComposedPublicationCandidate } from './composer'
import {
  PublicationServiceConflictError,
  buildCandidate,
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
    sha256: 'candidate-sha256',
    etag: '"sha256-candidate-sha256"',
  }
}

function validationReport(publishable = true, digest = 'validation-ready'): PublicationValidationReport {
  return {
    publishable,
    blocking: publishable ? [] : [{ code: 'visual-mismatch', message: 'Candidate mismatch is blocking' }],
    warnings: [],
    viewports: [],
    digest,
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
    composeCandidate: async () => composedCandidate(),
    validateCandidate: async () => validationReport(),
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

describe('model page publication service', () => {
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
    const result = await buildCandidate(buildInput(bucket, {
      validateCandidate: async () => validationReport(false, 'validation-failed'),
    }))

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

  it('allocates each revision under state CAS and rejects a stale competing state write', async () => {
    const bucket = new MemoryR2Bucket()
    let releaseComposition!: () => void
    const compositionPaused = new Promise<void>(resolve => { releaseComposition = resolve })
    let compositionStarted!: () => void
    const started = new Promise<void>(resolve => { compositionStarted = resolve })
    const firstBuild = buildCandidate(buildInput(bucket, {
      composeCandidate: async () => {
        compositionStarted()
        await compositionPaused
        return composedCandidate()
      },
    }))
    await started

    const second = await readyCandidate(bucket)
    releaseComposition()

    await expect(firstBuild).rejects.toBeInstanceOf(PublicationServiceConflictError)
    expect(second.revision).toBe(2)
    expect(second.state.next_revision).toBe(3)
  })

  it('uses a revision-scoped create-only evidence writer', async () => {
    const bucket = new MemoryR2Bucket()
    const result = await buildCandidate(buildInput(bucket, {
      validateCandidate: async (_candidate: unknown, options: any) => {
        const key = `${publicationKeys(pageId, 1).evidencePrefix}desktop/candidate.png`
        await options.writeEvidence({ key, bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' })
        await expect(options.writeEvidence({ key, bytes: new Uint8Array([4]), contentType: 'image/png' }))
          .rejects.toThrow('Publication revision already exists')
        return validationReport()
      },
    }))

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
    expect(production?.body.etag).toMatch(/^etag-/)
  })
})
