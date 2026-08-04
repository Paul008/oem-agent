import type {
  PublicationCandidateSummary,
  PublicationPruneOptions,
  PublicationRevisionArtifacts,
  PublicationRevisionManifest,
  PublicationState,
  PublicationStateRecord,
} from './types'

export type {
  PublicationCandidateSummary,
  PublicationPruneOptions,
  PublicationRevisionArtifacts,
  PublicationRevisionManifest,
  PublicationState,
  PublicationStateRecord,
} from './types'

const HISTORY_LIMIT = 10

export class PublicationConflictError extends Error {
  constructor(message = 'Publication state changed') {
    super(message)
    this.name = 'PublicationConflictError'
  }
}

export class PublicationRevisionConflictError extends Error {
  constructor(message = 'Publication revision already exists') {
    super(message)
    this.name = 'PublicationRevisionConflictError'
  }
}

export class PublicationStateValidationError extends Error {
  constructor(message = 'Malformed publication state') {
    super(message)
    this.name = 'PublicationStateValidationError'
  }
}

export interface PublicationBaseKeys {
  root: string
  state: string
  revisionsPrefix: string
}

export interface PublicationRevisionKeys extends PublicationBaseKeys {
  revisionPrefix: string
  manifest: string
  body: string
  validation: string
}

export function publicationKeys(pageId: string): PublicationBaseKeys
export function publicationKeys(pageId: string, revision: number): PublicationRevisionKeys
export function publicationKeys(pageId: string, revision?: number): PublicationBaseKeys | PublicationRevisionKeys {
  assertPageId(pageId)
  const root = `model-pages/${pageId}/publication`
  const base: PublicationBaseKeys = {
    root,
    state: `${root}/state.json`,
    revisionsPrefix: `${root}/revisions/`,
  }
  if (revision === undefined) return base

  assertRevision(revision)
  const revisionPrefix = `${base.revisionsPrefix}${revision}/`
  return {
    ...base,
    revisionPrefix,
    manifest: `${revisionPrefix}manifest.json`,
    body: `${revisionPrefix}body.html`,
    validation: `${revisionPrefix}validation.json`,
  }
}

export async function readPublicationState(
  bucket: R2Bucket,
  pageId: string,
): Promise<PublicationStateRecord | null> {
  const object = await bucket.get(publicationKeys(pageId).state)
  if (!object) return null

  let value: unknown
  try {
    value = await object.json<unknown>()
  } catch {
    throw new PublicationStateValidationError()
  }
  return { value: parsePublicationState(value), etag: object.etag }
}

/**
 * Write all revision artifacts with create-only conditions. A revision is never
 * overwritten; the separate state pointer is the only mutable publication key.
 */
export async function writeImmutableRevision(
  bucket: R2Bucket,
  pageId: string,
  artifacts: PublicationRevisionArtifacts,
): Promise<void> {
  const { manifest, body, validation } = artifacts
  if (manifest.pageId !== pageId) {
    throw new Error('Publication revision manifest pageId does not match storage pageId')
  }
  const keys = publicationKeys(pageId, manifest.revision)
  if (manifest.bodyPath !== keys.body) {
    throw new Error('Publication revision manifest bodyPath does not match storage key')
  }
  if (typeof body !== 'string') throw new Error('Publication revision body must be a string')

  const serializedManifest = JSON.stringify(manifest)
  const serializedValidation = JSON.stringify(validation)
  if (!serializedManifest || serializedValidation === undefined) {
    throw new Error('Publication revision artifacts must be JSON serializable')
  }

  await putImmutable(bucket, keys.body, body, { httpMetadata: { contentType: 'text/html; charset=utf-8' } })
  await putImmutable(bucket, keys.validation, serializedValidation, { httpMetadata: { contentType: 'application/json' } })
  await putImmutable(bucket, keys.manifest, serializedManifest, { httpMetadata: { contentType: 'application/json' } })
}

/**
 * Atomically changes the state pointer using the ETag observed by the caller.
 * The stored history retains the selected revision and the prior production
 * revision, even if an incoming history list would otherwise evict either one.
 */
export async function compareAndSetPublicationState(
  bucket: R2Bucket,
  pageId: string,
  priorEtag: string | null,
  next: PublicationState,
): Promise<PublicationStateRecord> {
  const current = await readPublicationState(bucket, pageId)
  const value = normalizePublicationState(next, current?.value.published_revision ?? null)
  const onlyIf: R2PutOptions['onlyIf'] = priorEtag === null
    ? new Headers({ 'if-none-match': '*' })
    : { etagMatches: priorEtag }
  const object = await bucket.put(
    publicationKeys(pageId).state,
    JSON.stringify(value),
    {
      onlyIf,
      httpMetadata: { contentType: 'application/json' },
    },
  )
  if (!object) throw new PublicationConflictError()
  return { value, etag: object.etag }
}

/** Read all valid immutable revision manifests for one page, newest first. */
export async function listPublicationHistory(
  bucket: R2Bucket,
  pageId: string,
): Promise<PublicationRevisionManifest[]> {
  const keys = publicationKeys(pageId)
  const objects = await listAll(bucket, keys.revisionsPrefix)
  const manifestKeys = objects
    .map(({ key }) => key)
    .filter((key) => /^\d+\/manifest\.json$/.test(key.slice(keys.revisionsPrefix.length)))

  const manifests = await Promise.all(manifestKeys.map(async (manifestKey) => {
    const object = await bucket.get(manifestKey)
    if (!object) throw new Error(`Publication manifest disappeared: ${manifestKey}`)
    let value: unknown
    try {
      value = await object.json<unknown>()
    } catch {
      throw new Error(`Malformed publication revision manifest: ${manifestKey}`)
    }
    return parsePublicationRevisionManifest(value, pageId)
  }))
  return manifests.sort((left, right) => right.revision - left.revision)
}

/**
 * Delete every object in complete old revision directories. The listing is
 * constrained to this page's revision prefix, and production pointers are
 * protected even when callers omit them from `retained`.
 */
export async function prunePublicationRevisions(
  bucket: R2Bucket,
  pageId: string,
  options: PublicationPruneOptions,
): Promise<number[]> {
  const keys = publicationKeys(pageId)
  const retained = new Set(options.retained.filter(isRevision))
  if (isRevision(options.publishedRevision)) retained.add(options.publishedRevision)
  if (isRevision(options.previousPublishedRevision)) retained.add(options.previousPublishedRevision)
  if (retained.size === 0) return []

  const oldestRetained = Math.min(...retained)
  const byRevision = new Map<number, string[]>()
  for (const object of await listAll(bucket, keys.revisionsPrefix)) {
    const suffix = object.key.slice(keys.revisionsPrefix.length)
    const match = /^(\d+)\//.exec(suffix)
    if (!match) continue
    const revision = Number(match[1])
    if (!isRevision(revision)) continue
    const revisionKeys = byRevision.get(revision) || []
    revisionKeys.push(object.key)
    byRevision.set(revision, revisionKeys)
  }

  const deleted: number[] = []
  for (const [revision, revisionKeys] of byRevision) {
    if (revision >= oldestRetained || retained.has(revision)) continue
    await bucket.delete(revisionKeys)
    deleted.push(revision)
  }
  return deleted.sort((left, right) => left - right)
}

async function putImmutable(
  bucket: R2Bucket,
  key: string,
  value: string,
  options: Omit<R2PutOptions, 'onlyIf'>,
): Promise<void> {
  const object = await bucket.put(key, value, {
    ...options,
    onlyIf: new Headers({ 'if-none-match': '*' }),
  })
  if (!object) throw new PublicationRevisionConflictError()
}

async function listAll(bucket: R2Bucket, prefix: string): Promise<R2Object[]> {
  const objects: R2Object[] = []
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix, cursor })
    objects.push(...page.objects)
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return objects
}

function normalizePublicationState(value: PublicationState, previousPublishedRevision: number | null): PublicationState {
  const parsed = parsePublicationState(value)
  const protectedRevisions = [parsed.published_revision, previousPublishedRevision].filter(isRevision)
  const history = uniqueRevisions([...protectedRevisions, ...parsed.history]).slice(0, HISTORY_LIMIT)
  return { ...parsed, history }
}

function parsePublicationState(value: unknown): PublicationState {
  if (!isRecord(value)
    || value.schema_version !== 1
    || !isRevision(value.next_revision)
    || !(value.published_revision === null || isRevision(value.published_revision))
    || !Array.isArray(value.history)
    || !value.history.every(isRevision)
    || !(value.candidate === null || isPublicationCandidate(value.candidate))) {
    throw new PublicationStateValidationError()
  }
  return {
    schema_version: 1,
    next_revision: value.next_revision,
    published_revision: value.published_revision,
    candidate: value.candidate === null ? null : { ...value.candidate },
    history: [...value.history],
  }
}

function parsePublicationRevisionManifest(value: unknown, pageId: string): PublicationRevisionManifest {
  if (!isRecord(value)
    || value.pageId !== pageId
    || !isRevision(value.revision)
    || !isRevision(value.draftVersion)
    || value.format !== 'composed-html-body'
    || !isString(value.bodyPath)
    || !(value.publishedAt === null || isString(value.publishedAt))
    || !(value.publishedBy === null || isString(value.publishedBy))
    || !Array.isArray(value.platformRegions)
    || !value.platformRegions.every((region) => region === 'hero' || region === 'variants' || region === 'inventory')
    || !isString(value.etag)
    || !isNonnegativeInteger(value.bodyBytes)
    || !isString(value.bodySha256)
    || !Array.isArray(value.regionRenderers)
    || !value.regionRenderers.every(isRegionRenderer)) {
    throw new Error('Malformed publication revision manifest')
  }
  return {
    pageId: value.pageId,
    revision: value.revision,
    draftVersion: value.draftVersion,
    format: value.format,
    bodyPath: value.bodyPath,
    publishedAt: value.publishedAt,
    publishedBy: value.publishedBy,
    platformRegions: [...value.platformRegions],
    etag: value.etag,
    bodyBytes: value.bodyBytes,
    bodySha256: value.bodySha256,
    regionRenderers: value.regionRenderers.map((renderer) => ({ ...renderer })),
  }
}

function isPublicationCandidate(value: unknown): value is PublicationCandidateSummary {
  return isRecord(value)
    && isRevision(value.revision)
    && isRevision(value.draft_version)
    && (value.status === 'building' || value.status === 'ready' || value.status === 'failed')
    && (value.validation_digest === null || isString(value.validation_digest))
    && isString(value.created_at)
    && isString(value.created_by)
}

function isRegionRenderer(value: unknown): value is PublicationRevisionManifest['regionRenderers'][number] {
  return isRecord(value)
    && isString(value.regionId)
    && (value.renderer === 'clone' || value.renderer === 'tailwind')
    && isString(value.interactionKind)
}

function uniqueRevisions(revisions: number[]): number[] {
  return [...new Set(revisions)]
}

function assertPageId(pageId: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(pageId)) {
    throw new Error('pageId must be lowercase alphanumeric segments separated by hyphens')
  }
}

function assertRevision(revision: number): void {
  if (!isRevision(revision)) throw new Error('revision must be a positive integer')
}

function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
