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
