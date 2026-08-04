import { describe, expect, it } from 'vitest'
import {
  PublicationConflictError,
  compareAndSetPublicationState,
  listPublicationHistory,
  publicationKeys,
  prunePublicationRevisions,
  readPublicationState,
  writeImmutableRevision,
} from './storage'
import type {
  PublicationRevisionArtifacts,
  PublicationRevisionManifest,
  PublicationState,
} from './types'

interface StoredObject {
  body: string
  etag: string
  options?: R2PutOptions
}

class MemoryR2Bucket {
  readonly objects = new Map<string, StoredObject>()
  readonly puts: Array<{ key: string; options?: R2PutOptions }> = []
  private etagSequence = 0

  async get(key: string): Promise<any> {
    const stored = this.objects.get(key)
    if (!stored) return null
    return {
      key,
      etag: stored.etag,
      json: async <T>() => JSON.parse(stored.body) as T,
      text: async () => stored.body,
    }
  }

  async put(key: string, value: string, options?: R2PutOptions): Promise<any> {
    this.puts.push({ key, options })
    const current = this.objects.get(key)
    const onlyIf = options?.onlyIf
    if (onlyIf instanceof Headers) {
      if (onlyIf.get('if-none-match') === '*' && current) return null
      if (onlyIf.get('if-match') && onlyIf.get('if-match') !== current?.etag) return null
    } else if (onlyIf?.etagMatches && onlyIf.etagMatches !== current?.etag) {
      return null
    }

    const stored = { body: value, etag: `etag-${++this.etagSequence}`, options }
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

  keys(): string[] {
    return [...this.objects.keys()].sort()
  }

  has(key: string): boolean {
    return this.objects.has(key)
  }
}

function initialPublicationState(overrides: Partial<PublicationState> = {}): PublicationState {
  return {
    schema_version: 1,
    next_revision: 1,
    published_revision: null,
    candidate: null,
    history: [],
    ...overrides,
  }
}

function revisionFixture(
  revision: number,
  pageId = 'nissan-au-ariya',
): PublicationRevisionArtifacts {
  const keys = publicationKeys(pageId, revision)
  const manifest: PublicationRevisionManifest = {
    pageId,
    revision,
    draftVersion: 20,
    format: 'composed-html-body',
    bodyPath: keys.body,
    publishedAt: null,
    publishedBy: null,
    platformRegions: ['hero', 'variants', 'inventory'],
    etag: `body-etag-${revision}`,
    bodyBytes: 15,
    bodySha256: `sha256-${revision}`,
    regionRenderers: [{ regionId: 'features', renderer: 'clone', interactionKind: 'none' }],
  }
  return {
    manifest,
    body: `<main>revision ${revision}</main>`,
    validation: { publishable: true, digest: `validation-${revision}` },
  }
}

async function bucketWithRevisions(first: number, last: number): Promise<MemoryR2Bucket> {
  const bucket = new MemoryR2Bucket()
  for (let revision = first; revision <= last; revision++) {
    await writeImmutableRevision(bucket as unknown as R2Bucket, 'nissan-au-ariya', revisionFixture(revision))
  }
  await writeImmutableRevision(bucket as unknown as R2Bucket, 'toyota-au-rav4', revisionFixture(99, 'toyota-au-rav4'))
  return bucket
}

describe('publication R2 storage', () => {
  it('returns null when a page has no publication state', async () => {
    const state = await readPublicationState(new MemoryR2Bucket() as unknown as R2Bucket, 'nissan-au-ariya')
    expect(state).toBeNull()
  })

  it('preserves old state compatibility and round-trips mutable publish metadata', async () => {
    const bucket = new MemoryR2Bucket()
    const legacy = await compareAndSetPublicationState(
      bucket as unknown as R2Bucket,
      'nissan-au-ariya',
      null,
      initialPublicationState(),
    )
    expect(legacy.value.published_at).toBeUndefined()
    expect(legacy.value.published_by).toBeUndefined()

    const current = await compareAndSetPublicationState(
      bucket as unknown as R2Bucket,
      'nissan-au-ariya',
      legacy.etag,
      initialPublicationState({
        published_revision: 1,
        published_at: '2026-08-04T01:02:03.000Z',
        published_by: 'publisher@test',
      }),
    )
    expect(current.value.published_at).toBe('2026-08-04T01:02:03.000Z')
    expect(current.value.published_by).toBe('publisher@test')
  })

  it('provides an immutable evidence prefix inside each revision', () => {
    expect(publicationKeys('nissan-au-ariya', 21).evidencePrefix).toBe(
      'model-pages/nissan-au-ariya/publication/revisions/21/evidence/',
    )
  })

  it('rejects malformed state objects rather than using them', async () => {
    const bucket = new MemoryR2Bucket()
    await bucket.put(publicationKeys('nissan-au-ariya').state, JSON.stringify({ schema_version: 2 }))

    await expect(readPublicationState(bucket as unknown as R2Bucket, 'nissan-au-ariya'))
      .rejects.toThrow('Malformed publication state')
  })

  it('writes revision objects before atomically selecting the revision', async () => {
    const bucket = new MemoryR2Bucket()
    await writeImmutableRevision(bucket as unknown as R2Bucket, 'nissan-au-ariya', revisionFixture(21))
    const state = await compareAndSetPublicationState(bucket as unknown as R2Bucket, 'nissan-au-ariya', null, {
      schema_version: 1,
      next_revision: 22,
      published_revision: 21,
      candidate: null,
      history: [21],
    })

    expect(state.value.published_revision).toBe(21)
    expect(bucket.keys()).toEqual(expect.arrayContaining([
      'model-pages/nissan-au-ariya/publication/revisions/21/manifest.json',
      'model-pages/nissan-au-ariya/publication/revisions/21/body.html',
      'model-pages/nissan-au-ariya/publication/revisions/21/validation.json',
      'model-pages/nissan-au-ariya/publication/state.json',
    ]))
  })

  it('writes revision objects with create-only conditions', async () => {
    const bucket = new MemoryR2Bucket()
    await writeImmutableRevision(bucket as unknown as R2Bucket, 'nissan-au-ariya', revisionFixture(21))

    expect(bucket.puts.slice(0, 3).every(({ options }) => (
      options?.onlyIf instanceof Headers && options.onlyIf.get('if-none-match') === '*'
    ))).toBe(true)
    await expect(writeImmutableRevision(bucket as unknown as R2Bucket, 'nissan-au-ariya', revisionFixture(21)))
      .rejects.toThrow('Publication revision already exists')
  })

  it('rejects a stale state etag', async () => {
    const bucket = new MemoryR2Bucket()
    const first = await compareAndSetPublicationState(
      bucket as unknown as R2Bucket,
      'nissan-au-ariya',
      null,
      initialPublicationState(),
    )

    await expect(compareAndSetPublicationState(
      bucket as unknown as R2Bucket,
      'nissan-au-ariya',
      'stale-etag',
      first.value,
    )).rejects.toThrow('Publication state changed')
  })

  it('caps history at ten while retaining the selected and previous production revisions', async () => {
    const bucket = new MemoryR2Bucket()
    const first = await compareAndSetPublicationState(
      bucket as unknown as R2Bucket,
      'nissan-au-ariya',
      null,
      initialPublicationState({ next_revision: 13, published_revision: 11, history: [11, 10, 9, 8, 7, 6, 5, 4, 3, 2] }),
    )

    const next = await compareAndSetPublicationState(
      bucket as unknown as R2Bucket,
      'nissan-au-ariya',
      first.etag,
      initialPublicationState({
        next_revision: 14,
        published_revision: 12,
        history: [12, 9, 8, 7, 6, 5, 4, 3, 2, 1],
      }),
    )

    expect(next.value.history).toHaveLength(10)
    expect(next.value.history).toEqual(expect.arrayContaining([12, 11]))
  })

  it('lists revision manifests newest first without reading another page', async () => {
    const bucket = await bucketWithRevisions(1, 3)
    const history = await listPublicationHistory(bucket as unknown as R2Bucket, 'nissan-au-ariya')

    expect(history.map(({ revision }) => revision)).toEqual([3, 2, 1])
    expect(history.every(({ pageId }) => pageId === 'nissan-au-ariya')).toBe(true)
  })

  it('prunes only revisions outside the retained ten and never deletes current or previous production', async () => {
    const bucket = await bucketWithRevisions(1, 14)
    const deleted = await prunePublicationRevisions(bucket as unknown as R2Bucket, 'nissan-au-ariya', {
      retained: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
      publishedRevision: 14,
      previousPublishedRevision: 4,
    })

    expect(deleted).toEqual([1, 2, 3])
    expect(bucket.has(publicationKeys('nissan-au-ariya', 4).manifest)).toBe(true)
    expect(bucket.has(publicationKeys('toyota-au-rav4', 99).manifest)).toBe(true)
  })

  it('keeps an old previous production revision without moving the retention cutoff', async () => {
    const bucket = await bucketWithRevisions(1, 20)
    const deleted = await prunePublicationRevisions(bucket as unknown as R2Bucket, 'nissan-au-ariya', {
      retained: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      publishedRevision: 20,
      previousPublishedRevision: 1,
    })

    expect(deleted).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(bucket.has(publicationKeys('nissan-au-ariya', 1).manifest)).toBe(true)
  })
})
