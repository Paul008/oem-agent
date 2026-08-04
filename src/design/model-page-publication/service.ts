import type { PublicationAuditMetadata } from '../../auth/audit-log'
import { composePublicationCandidate } from './composer'
import {
  PublicationConflictError,
  PublicationRevisionConflictError,
  compareAndSetPublicationState,
  publicationKeys,
  prunePublicationRevisions,
  readPublicationRevisionManifest,
  readPublicationState,
  writeImmutableRevision,
} from './storage'
import type {
  PublicationRevisionManifest,
  PublicationState,
  PublicationStateRecord,
} from './types'
import {
  validatePublicationCandidate,
  validationDigest,
  type PublicationValidationReport,
} from './validator'

export type PublicationPropagation = 'pending' | 'delivered' | 'failed'

export interface PublicationWebhook {
  id: string
  url: string
  events: string[]
}

export interface PublicationWebhookDeliveryInput {
  webhook: PublicationWebhook
  event: 'page.updated'
  timestamp: string
  data: {
    page_id: string
    draft_revision: number
    published_revision: number
    previous_published_revision: number | null
    action: 'publish' | 'rollback'
  }
}

export type DeliverPublicationWebhook = (
  input: PublicationWebhookDeliveryInput,
) => Promise<{ status: number }>

export interface PublicationCandidateResult {
  status: 'ready' | 'failed'
  revision: number
  validation: PublicationValidationReport
  state: PublicationState
  audit: PublicationAuditMetadata
}

export type PublicationTransitionResult = PublicationState & {
  propagation: PublicationPropagation
  audit: PublicationAuditMetadata
}

export interface ProductionPublication {
  state: PublicationState
  manifest: PublicationRevisionManifest
  body: {
    key: string
    text: string
    etag: string
    bytes: number
    contentType: string
  }
}

interface WebhookTransitionInput {
  hooks?: PublicationWebhook[]
  deliverWebhook?: DeliverPublicationWebhook
}

export class PublicationServiceConflictError extends Error {
  readonly status = 409
  readonly code: string

  constructor(message: string, code = 'publication_state_conflict') {
    super(message)
    this.name = 'PublicationServiceConflictError'
    this.code = code
  }
}

export class PublicationServiceNotFoundError extends Error {
  readonly status = 404
  readonly code = 'publication_revision_not_found'

  constructor(message = 'Publication revision is incomplete') {
    super(message)
    this.name = 'PublicationServiceNotFoundError'
  }
}

export async function buildCandidate(input: {
  bucket: R2Bucket
  browser?: Fetcher
  pageId: string
  page: Record<string, any>
  expectedDraftVersion: number
  actor: string
  origin: string
  now?: () => string
}): Promise<PublicationCandidateResult> {
  assertSavedDraftVersion(input.page, input.expectedDraftVersion)
  const observed = await readPublicationState(input.bucket, input.pageId)
  const current = observed?.value || emptyPublicationState()
  const revision = current.next_revision
  const createdAt = timestamp(input.now)
  const buildingState: PublicationState = {
    ...current,
    next_revision: revision + 1,
    candidate: {
      revision,
      draft_version: input.expectedDraftVersion,
      status: 'building',
      validation_digest: null,
      created_at: createdAt,
      created_by: input.actor,
    },
  }
  const allocated = await updateState(
    input.bucket,
    input.pageId,
    observed?.etag || null,
    buildingState,
  )

  try {
    const candidate = await composePublicationCandidate({
      pageId: input.pageId,
      page: input.page,
      origin: input.origin,
    })
    const keys = publicationKeys(input.pageId, revision)
    const validation = await validatePublicationCandidate(candidate, {
      browser: input.browser,
      evidencePrefix: keys.evidencePrefix,
      writeEvidence: async artifact => {
        if (!artifact.key.startsWith(keys.evidencePrefix)) {
          throw new Error('Publication evidence key is outside its revision')
        }
        const object = await input.bucket.put(artifact.key, artifact.bytes, {
          onlyIf: new Headers({ 'if-none-match': '*' }),
          httpMetadata: { contentType: artifact.contentType },
        })
        if (!object) throw new PublicationRevisionConflictError()
      },
    })
    const manifest: PublicationRevisionManifest = {
      pageId: input.pageId,
      revision,
      draftVersion: input.expectedDraftVersion,
      format: 'composed-html-body',
      bodyPath: keys.body,
      publishedAt: null,
      publishedBy: null,
      platformRegions: ['hero', 'variants', 'inventory'],
      etag: candidate.etag,
      bodyBytes: candidate.bytes,
      bodySha256: candidate.sha256,
      regionRenderers: candidate.regions.map(region => ({
        regionId: region.regionId,
        renderer: region.renderer,
        interactionKind: region.interactionKind,
      })),
    }
    await writeImmutableRevision(input.bucket, input.pageId, {
      manifest,
      body: candidate.body,
      validation,
    })

    const status = await isCanonicalPublishableValidation(validation) ? 'ready' : 'failed'
    const stored = await updateState(input.bucket, input.pageId, allocated.etag, {
      ...allocated.value,
      candidate: {
        ...allocated.value.candidate!,
        status,
        validation_digest: validation.digest,
      },
    })
    return {
      status,
      revision,
      validation,
      state: stored.value,
      audit: publicationAudit(
        input.pageId,
        input.expectedDraftVersion,
        revision,
        stored.value.published_revision,
        `publication.candidate.${status}`,
      ),
    }
  } catch (error) {
    if (!(error instanceof PublicationServiceConflictError)) {
      await markAllocatedCandidateFailed(input.bucket, input.pageId, allocated).catch(() => {})
    }
    throw error
  }
}

export async function publishCandidate(input: {
  bucket: R2Bucket
  pageId: string
  revision: number
  expectedDraftVersion: number
  validationDigest: string
  actor: string
  loadCurrentPage: (pageId: string) => Promise<Record<string, any> | null>
  now?: () => string
} & WebhookTransitionInput): Promise<PublicationTransitionResult> {
  const observed = await requirePublicationState(input.bucket, input.pageId)
  const candidate = observed.value.candidate
  if (!candidate
    || candidate.status !== 'ready'
    || candidate.revision !== input.revision
    || candidate.draft_version !== input.expectedDraftVersion
    || candidate.validation_digest !== input.validationDigest) {
    throw new PublicationServiceConflictError('Ready publication candidate no longer matches', 'candidate_conflict')
  }

  const revision = await loadCompleteRevision(input.bucket, input.pageId, input.revision)
  if (revision.manifest.draftVersion !== input.expectedDraftVersion
    || revision.manifest.publishedAt !== null
    || revision.manifest.publishedBy !== null
    || revision.validation.digest !== input.validationDigest) {
    throw new PublicationServiceConflictError('Immutable publication candidate does not match', 'candidate_conflict')
  }

  const publishedAt = timestamp(input.now)
  const previousPublishedRevision = observed.value.published_revision
  const stored = await updateState(
    input.bucket,
    input.pageId,
    observed.etag,
    {
      ...observed.value,
      published_revision: input.revision,
      published_at: publishedAt,
      published_by: input.actor,
      candidate: null,
      history: [input.revision, ...observed.value.history],
    },
    async () => {
      // This definition-bucket read is the final await before the conditional put.
      const currentPage = await input.loadCurrentPage(input.pageId)
      assertSavedDraftVersion(currentPage, input.expectedDraftVersion)
    },
  )

  await prunePublicationRevisions(input.bucket, input.pageId, {
    retained: stored.value.history,
    publishedRevision: input.revision,
    previousPublishedRevision,
  }).catch(() => {})
  const propagation = await propagatePublication(input, {
    event: 'page.updated',
    timestamp: publishedAt,
    data: {
      page_id: input.pageId,
      draft_revision: input.expectedDraftVersion,
      published_revision: input.revision,
      previous_published_revision: previousPublishedRevision,
      action: 'publish',
    },
  })
  return {
    ...stored.value,
    propagation,
    audit: publicationAudit(
      input.pageId,
      input.expectedDraftVersion,
      input.revision,
      input.revision,
      'publication.publish',
    ),
  }
}

export async function rollbackPublication(input: {
  bucket: R2Bucket
  pageId: string
  targetRevision: number
  actor: string
  now?: () => string
} & WebhookTransitionInput): Promise<PublicationTransitionResult> {
  const observed = await requirePublicationState(input.bucket, input.pageId)
  if (!observed.value.history.includes(input.targetRevision)) {
    throw new PublicationServiceConflictError('Rollback target was never published', 'rollback_target_conflict')
  }
  const target = await loadCompleteRevision(input.bucket, input.pageId, input.targetRevision)
  const rolledBackAt = timestamp(input.now)
  const previousPublishedRevision = observed.value.published_revision
  const stored = await updateState(input.bucket, input.pageId, observed.etag, {
    ...observed.value,
    published_revision: input.targetRevision,
    published_at: rolledBackAt,
    published_by: input.actor,
    history: [input.targetRevision, ...observed.value.history],
  })
  const propagation = await propagatePublication(input, {
    event: 'page.updated',
    timestamp: rolledBackAt,
    data: {
      page_id: input.pageId,
      draft_revision: target.manifest.draftVersion,
      published_revision: input.targetRevision,
      previous_published_revision: previousPublishedRevision,
      action: 'rollback',
    },
  })
  return {
    ...stored.value,
    propagation,
    audit: publicationAudit(
      input.pageId,
      target.manifest.draftVersion,
      undefined,
      input.targetRevision,
      'publication.rollback',
    ),
  }
}

export async function getProductionPublication(input: {
  bucket: R2Bucket
  pageId: string
  revision?: number
}): Promise<ProductionPublication | null> {
  const observed = await readPublicationState(input.bucket, input.pageId)
  if (!observed) return null
  const revision = input.revision ?? observed.value.published_revision
  if (revision == null
    || (input.revision !== undefined && !observed.value.history.includes(revision))) return null
  const selected = await loadCompleteRevision(input.bucket, input.pageId, revision)
  return {
    state: observed.value,
    manifest: selected.manifest,
    body: selected.body,
  }
}

async function requirePublicationState(bucket: R2Bucket, pageId: string): Promise<PublicationStateRecord> {
  const state = await readPublicationState(bucket, pageId)
  if (!state) throw new PublicationServiceConflictError('Publication state does not exist', 'publication_not_found')
  return state
}

async function updateState(
  bucket: R2Bucket,
  pageId: string,
  etag: string | null,
  state: PublicationState,
  beforeWrite?: () => void | Promise<void>,
): Promise<PublicationStateRecord> {
  try {
    return await compareAndSetPublicationState(bucket, pageId, etag, state, { beforeWrite })
  } catch (error) {
    if (error instanceof PublicationConflictError) {
      throw new PublicationServiceConflictError('Publication state changed')
    }
    throw error
  }
}

async function markAllocatedCandidateFailed(
  bucket: R2Bucket,
  pageId: string,
  allocated: PublicationStateRecord,
): Promise<void> {
  if (!allocated.value.candidate) return
  await updateState(bucket, pageId, allocated.etag, {
    ...allocated.value,
    candidate: { ...allocated.value.candidate, status: 'failed' },
  })
}

async function loadCompleteRevision(
  bucket: R2Bucket,
  pageId: string,
  revision: number,
): Promise<{
  manifest: PublicationRevisionManifest
  validation: PublicationValidationReport
  body: ProductionPublication['body']
}> {
  const keys = publicationKeys(pageId, revision)
  const [manifest, bodyObject, validationObject] = await Promise.all([
    readPublicationRevisionManifest(bucket, pageId, revision),
    bucket.get(keys.body),
    bucket.get(keys.validation),
  ])
  if (!manifest || !bodyObject || !validationObject) {
    throw new PublicationServiceNotFoundError()
  }
  let validationValue: unknown
  try {
    validationValue = await validationObject.json<unknown>()
  } catch {
    throw new Error('Publication revision validation is malformed')
  }
  const validation = await parseCanonicalPublishableValidation(validationValue)
  const text = await bodyObject.text()
  const bytes = new TextEncoder().encode(text).byteLength
  const sha256 = await sha256Hex(text)
  const etag = `"sha256-${sha256}"`
  if (manifest.bodyBytes !== bytes
    || manifest.bodySha256 !== sha256
    || manifest.etag !== etag) {
    throw new Error('Publication body integrity does not match its manifest')
  }
  return {
    manifest,
    validation,
    body: {
      key: keys.body,
      text,
      etag: manifest.etag,
      bytes,
      contentType: bodyObject.httpMetadata?.contentType || 'text/html; charset=utf-8',
    },
  }
}

async function propagatePublication(
  input: WebhookTransitionInput,
  delivery: Omit<PublicationWebhookDeliveryInput, 'webhook'>,
): Promise<PublicationPropagation> {
  const hooks = (input.hooks || []).filter(hook => hook.events.includes('page.updated'))
  if (hooks.length === 0) return 'delivered'
  if (!input.deliverWebhook) return 'pending'
  const results = await Promise.allSettled(hooks.map(webhook => (
    Promise.resolve().then(() => input.deliverWebhook!({ webhook, ...delivery }))
  )))
  return results.every(result => (
    result.status === 'fulfilled'
    && result.value.status >= 200
    && result.value.status < 300
  )) ? 'delivered' : 'failed'
}

function assertSavedDraftVersion(page: Record<string, any> | null, expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion)
    || expectedVersion <= 0
    || !page
    || !Number.isInteger(page.version)
    || page.version !== expectedVersion) {
    throw new PublicationServiceConflictError(
      `Saved draft version does not match expected version ${expectedVersion}`,
      'draft_version_conflict',
    )
  }
}

function emptyPublicationState(): PublicationState {
  return {
    schema_version: 1,
    next_revision: 1,
    published_revision: null,
    published_at: null,
    published_by: null,
    candidate: null,
    history: [],
  }
}

function publicationAudit(
  pageId: string,
  draftRevision: number,
  candidateRevision: number | undefined,
  publishedRevision: number | null | undefined,
  action: string,
): PublicationAuditMetadata {
  return {
    page_id: pageId,
    draft_revision: draftRevision,
    candidate_revision: candidateRevision,
    published_revision: publishedRevision === null ? undefined : publishedRevision,
    action,
  }
}

function timestamp(now?: () => string): string {
  return now ? now() : new Date().toISOString()
}

async function isCanonicalPublishableValidation(report: PublicationValidationReport): Promise<boolean> {
  try {
    await parseCanonicalPublishableValidation(report)
    return true
  } catch {
    return false
  }
}

async function parseCanonicalPublishableValidation(value: unknown): Promise<PublicationValidationReport> {
  if (!isRecord(value)
    || typeof value.publishable !== 'boolean'
    || !Array.isArray(value.blocking)
    || !Array.isArray(value.warnings)
    || !Array.isArray(value.viewports)
    || typeof value.digest !== 'string') {
    throw new Error('Publication revision validation is malformed')
  }
  const reportWithoutDigest: Omit<PublicationValidationReport, 'digest'> = {
    publishable: value.publishable,
    blocking: value.blocking as PublicationValidationReport['blocking'],
    warnings: value.warnings as PublicationValidationReport['warnings'],
    viewports: value.viewports as PublicationValidationReport['viewports'],
  }
  const digest = await validationDigest(reportWithoutDigest)
  if (value.digest !== digest) {
    throw new Error('Publication validation digest does not match its report')
  }
  if (!value.publishable || value.blocking.length !== 0) {
    throw new Error('Publication validation is not publishable')
  }
  return { ...reportWithoutDigest, digest: value.digest }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
