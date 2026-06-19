import type { CloneRegion } from '../../page-builder/page-modes'

export function sortCloneRegions(regions: CloneRegion[]): CloneRegion[] {
  return [...regions].sort((a, b) => a.top - b.top)
}

export function cloneRegionSelectionPayload(region: CloneRegion): CloneRegion {
  return region
}

export function cloneRegionFieldCount(region: CloneRegion): number {
  return Array.isArray(region.editable_fields) ? region.editable_fields.length : 0
}

export function formatCloneRegionHeight(height: number): string {
  if (!Number.isFinite(height) || height <= 0)
    return '-'

  return `${Math.round(height)}px`
}
