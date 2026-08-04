import { z } from 'zod'

export interface PublicationCandidateSummary {
  revision: number
  draft_version: number
  status: 'building' | 'ready' | 'failed'
  validation_digest: string | null
  created_at: string
  created_by: string
}

export interface PublicationState {
  schema_version: 1
  next_revision: number
  published_revision: number | null
  published_at?: string | null
  published_by?: string | null
  candidate: PublicationCandidateSummary | null
  history: number[]
}

export interface PublicationFinding {
  code: string
  message: string
  viewport?: 'desktop' | 'tablet' | 'mobile'
  regionId?: string
}

export interface PublicationInteractionResult {
  regionId: string
  kind: string
  passed: boolean
  detail: string
}

export interface PublicationEvidenceRecord {
  key: string
  byteLength: number
  sha256: string
}

export interface PublicationViewportValidation {
  name: 'desktop' | 'tablet' | 'mobile'
  mismatchPercent: number
  horizontalOverflowPx: number
  bodyHeight: number
  consoleErrors: string[]
  failedRequests: string[]
  interactions: PublicationInteractionResult[]
  screenshotKey?: string
  diffScreenshotKey?: string
  sourceSize?: { width: number, height: number }
  candidateSize?: { width: number, height: number }
  evidence?: {
    source: PublicationEvidenceRecord
    candidate: PublicationEvidenceRecord
    diff: PublicationEvidenceRecord
  }
}

export interface PublicationValidationSummary {
  publishable: boolean
  blocking: PublicationFinding[]
  warnings: PublicationFinding[]
  viewports: PublicationViewportValidation[]
  digest: string
}

export interface PublicationHistoryEntry {
  pageId: string
  revision: number
  draftVersion: number
  format: 'composed-html-body'
  bodyPath: string
  publishedAt: string | null
  publishedBy: string | null
  platformRegions: Array<'hero' | 'variants' | 'inventory'>
  etag: string
  bodyBytes: number
  bodySha256: string
  regionRenderers: Array<{
    regionId: string
    renderer: 'clone' | 'tailwind'
    interactionKind: string
  }>
}

export interface PublicationHistoryResponse {
  state: PublicationState | null
  history: PublicationHistoryEntry[]
  candidateValidation: PublicationValidationSummary | null
}

export interface PublicationCandidateResponse {
  status: 'ready' | 'failed'
  revision: number
  validation: PublicationValidationSummary
  state: PublicationState
}

export type PublicationPropagation = 'pending' | 'delivered' | 'failed'

export type PublicationTransitionResponse = PublicationState & {
  propagation: PublicationPropagation
}

export interface PublishModelPagePublicationInput {
  revision: number
  expectedDraftVersion: number
  validationDigest: string
}

const positiveIntegerSchema = z.number().int().positive()
const optionalNullableStringSchema = z.string().nullable().optional()
const candidateStatusSchema = z.enum(['building', 'ready', 'failed'])
const propagationSchema = z.enum(['pending', 'delivered', 'failed'])
const viewportNameSchema = z.enum(['desktop', 'tablet', 'mobile'])

const candidateSummarySchema = z.object({
  revision: positiveIntegerSchema,
  draft_version: positiveIntegerSchema,
  status: candidateStatusSchema,
  validation_digest: z.string().min(1).nullable(),
  created_at: z.string().min(1),
  created_by: z.string().min(1),
}).superRefine((candidate, context) => {
  const hasDigest = candidate.validation_digest != null
  if ((candidate.status === 'building' && hasDigest)
    || (candidate.status !== 'building' && !hasDigest)) {
    context.addIssue({ code: 'custom', message: 'candidate status and validation digest do not match' })
  }
})

const publicationStateSchema = z.object({
  schema_version: z.literal(1),
  next_revision: positiveIntegerSchema,
  published_revision: positiveIntegerSchema.nullable(),
  published_at: optionalNullableStringSchema,
  published_by: optionalNullableStringSchema,
  candidate: candidateSummarySchema.nullable(),
  history: z.array(positiveIntegerSchema),
})

const findingSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  viewport: viewportNameSchema.optional(),
  regionId: z.string().min(1).optional(),
})

const interactionSchema = z.object({
  regionId: z.string().min(1),
  kind: z.string().min(1),
  passed: z.boolean(),
  detail: z.string(),
})

const evidenceRecordSchema = z.object({
  key: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string().min(1),
})

const sizeSchema = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
})

const viewportValidationSchema = z.object({
  name: viewportNameSchema,
  mismatchPercent: z.number().nonnegative(),
  horizontalOverflowPx: z.number().nonnegative(),
  bodyHeight: z.number().nonnegative(),
  consoleErrors: z.array(z.string()),
  failedRequests: z.array(z.string()),
  interactions: z.array(interactionSchema),
  screenshotKey: z.string().min(1).optional(),
  diffScreenshotKey: z.string().min(1).optional(),
  sourceSize: sizeSchema.optional(),
  candidateSize: sizeSchema.optional(),
  evidence: z.object({
    source: evidenceRecordSchema,
    candidate: evidenceRecordSchema,
    diff: evidenceRecordSchema,
  }).optional(),
})

const validationSummarySchema = z.object({
  publishable: z.boolean(),
  blocking: z.array(findingSchema),
  warnings: z.array(findingSchema),
  viewports: z.array(viewportValidationSchema),
  digest: z.string().min(1),
})

const historyEntrySchema = z.object({
  pageId: z.string().min(1),
  revision: positiveIntegerSchema,
  draftVersion: positiveIntegerSchema,
  format: z.literal('composed-html-body'),
  bodyPath: z.string().min(1),
  publishedAt: z.string().nullable(),
  publishedBy: z.string().nullable(),
  platformRegions: z.array(z.enum(['hero', 'variants', 'inventory'])),
  etag: z.string().min(1),
  bodyBytes: z.number().int().nonnegative(),
  bodySha256: z.string().min(1),
  regionRenderers: z.array(z.object({
    regionId: z.string().min(1),
    renderer: z.enum(['clone', 'tailwind']),
    interactionKind: z.string().min(1),
  })),
})

const historyResponseSchema = z.object({
  state: publicationStateSchema.nullable(),
  history: z.array(historyEntrySchema),
  candidateValidation: validationSummarySchema.nullable(),
}).superRefine((response, context) => {
  if (response.candidateValidation) {
    const candidate = response.state?.candidate
    if (!candidate || candidate.validation_digest !== response.candidateValidation.digest) {
      context.addIssue({
        code: 'custom',
        message: 'candidate validation does not match current candidate',
      })
    }
  }
})

const candidateResponseSchema = z.object({
  status: z.enum(['ready', 'failed']),
  revision: positiveIntegerSchema,
  validation: validationSummarySchema,
  state: publicationStateSchema,
}).superRefine((response, context) => {
  const candidate = response.state.candidate
  const statusMatchesValidation = response.status === 'ready'
    ? response.validation.publishable && response.validation.blocking.length === 0
    : !response.validation.publishable || response.validation.blocking.length > 0
  if (!candidate
    || candidate.revision !== response.revision
    || candidate.status !== response.status
    || candidate.validation_digest !== response.validation.digest
    || !statusMatchesValidation) {
    context.addIssue({ code: 'custom', message: 'candidate identity does not match response' })
  }
})

const transitionResponseSchema = publicationStateSchema.extend({
  propagation: propagationSchema,
})

function parsePublicationResponse<T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: string,
): T {
  const result = schema.safeParse(value)
  if (result.success)
    return result.data
  const detail = result.error.issues[0]?.message || 'unknown validation error'
  throw new Error(`Invalid model page publication ${label} response: ${detail}`)
}

export function parsePublicationHistoryResponse(value: unknown): PublicationHistoryResponse {
  return parsePublicationResponse(historyResponseSchema, value, 'history')
}

export function parsePublicationCandidateResponse(value: unknown): PublicationCandidateResponse {
  return parsePublicationResponse(candidateResponseSchema, value, 'candidate')
}

export function parsePublicationTransitionResponse(
  value: unknown,
  action: 'publish' | 'rollback',
): PublicationTransitionResponse {
  return parsePublicationResponse(transitionResponseSchema, value, action)
}
