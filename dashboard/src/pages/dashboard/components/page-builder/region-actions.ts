import type { CloneRegion } from '../../page-builder/page-modes'

export type RegionActionId =
  | 'edit-text' | 'replace-image' | 'alt-text' | 'edit-link' | 'background'
  | 'height' | 'bind-catalog' | 'convert' | 'hide' | 'duplicate' | 'delete'
  | 'next-panel' | 'prev-panel'

export interface RegionAction { id: RegionActionId; label: string; group: 'content' | 'layout' | 'region' }

export interface PatchPayload { regionId: string; kind: 'text' | 'image' | 'link' | 'alt' | 'background' | 'visibility'; value?: string | boolean }

function hasKind(region: CloneRegion, kind: string): boolean {
  return Array.isArray(region.editable_fields) && region.editable_fields.some((f: any) => f.kind === kind)
}

export function getRegionActions(region: CloneRegion): RegionAction[] {
  const out: RegionAction[] = []
  if (hasKind(region, 'text')) out.push({ id: 'edit-text', label: 'Edit text', group: 'content' })
  if (hasKind(region, 'image')) {
    out.push({ id: 'replace-image', label: 'Replace image…', group: 'content' })
    out.push({ id: 'alt-text', label: 'Alt text…', group: 'content' })
  }
  if (hasKind(region, 'link')) out.push({ id: 'edit-link', label: 'Edit link / button…', group: 'content' })
  out.push({ id: 'background', label: 'Background colour…', group: 'content' })
  out.push({ id: 'bind-catalog', label: 'Bind to model catalog data…', group: 'content' })
  if (region.type_hint === 'tabs' || region.type_hint === 'carousel') {
    out.push({ id: 'next-panel', label: 'Next panel', group: 'layout' })
    out.push({ id: 'prev-panel', label: 'Previous panel', group: 'layout' })
  }
  out.push({ id: 'height', label: 'Set visible height…', group: 'layout' })
  out.push({ id: 'convert', label: 'Convert to editable section…', group: 'layout' })
  out.push({ id: 'hide', label: 'Hide region', group: 'region' })
  out.push({ id: 'duplicate', label: 'Duplicate', group: 'region' })
  out.push({ id: 'delete', label: 'Delete region', group: 'region' })
  return out
}

export function buildPatchPayload(action: RegionActionId, region: CloneRegion, value?: string): PatchPayload | null {
  switch (action) {
    case 'hide': return { regionId: region.id, kind: 'visibility', value: false }
    case 'replace-image': return { regionId: region.id, kind: 'image', value }
    case 'edit-link': return { regionId: region.id, kind: 'link', value }
    case 'alt-text': return { regionId: region.id, kind: 'alt', value }
    case 'background': return { regionId: region.id, kind: 'background', value }
    case 'edit-text': return { regionId: region.id, kind: 'text', value }
    default: return null
  }
}
