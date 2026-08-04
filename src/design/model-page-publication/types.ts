export interface PublicationState {
  schema_version: 1
  next_revision: number
  published_revision: number | null
  candidate: PublicationCandidateSummary | null
  history: number[]
}

export interface PublicationCandidateSummary {
  revision: number
  draft_version: number
  status: 'building' | 'ready' | 'failed'
  validation_digest: string | null
  created_at: string
  created_by: string
}

export interface PublicationRevisionManifest {
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

/** The three immutable objects stored for one publication revision. */
export interface PublicationRevisionArtifacts {
  manifest: PublicationRevisionManifest
  body: string
  validation: unknown
}

export interface PublicationStateRecord {
  value: PublicationState
  etag: string
}

export interface PublicationPruneOptions {
  retained: number[]
  publishedRevision: number | null
  previousPublishedRevision: number | null
}
