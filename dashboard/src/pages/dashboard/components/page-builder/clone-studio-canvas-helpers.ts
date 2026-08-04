import { getCloneRegions, getCloneStudioHtml, getCloneStylesheetUrls } from '../../page-builder/page-modes'
import { buildCloneStudioHtml } from './clone-studio-html'

export interface CloneStudioFrameHtmlForCanvasOptions {
  page: any
  title: string
  baseHref: string
  workerBase: string
  selectedRegionId: string | null
  bridgeToken: string
  oemId?: string
  modelSlug?: string
  editable?: boolean
}

/**
 * Scale a fixed device-width clone frame to fit the editor panel. Never upscales past 1:1, so a
 * panel wider than the frame renders it at native size.
 */
export function computeCloneFrameScale(containerWidth: number, frameWidth: number): number {
  if (!containerWidth || !frameWidth || frameWidth <= 0)
    return 1
  return Math.min(1, containerWidth / frameWidth)
}

/**
 * Clamp a region's cropped height from a pointer position. `pointerY`/`regionTop` are in the same
 * coordinate space (the region's top edge); the result is bounded to `[min, naturalHeight]` so a
 * drag can never shrink below `min` or grow past the region's natural (uncropped) height.
 */
export function clampRegionHeight(pointerY: number, regionTop: number, naturalHeight: number, min = 40): number {
  const raw = pointerY - regionTop
  const max = naturalHeight > 0 ? naturalHeight : raw
  return Math.max(min, Math.min(raw, max))
}

export function cloneStudioIframeSandbox(allowSameOrigin = false): string {
  return allowSameOrigin ? 'allow-scripts allow-same-origin' : 'allow-scripts'
}

/**
 * Translate an iframe-relative point into parent-viewport coordinates by scaling the point by the
 * frame scale and offsetting by the iframe's origin (its top-left in the parent viewport).
 */
export function translateFramePoint(p: { x: number, y: number }, originRect: { left: number, top: number }, scale: number): { x: number, y: number } {
  return { x: originRect.left + p.x * scale, y: originRect.top + p.y * scale }
}

/**
 * Place the quick-edit toolbar just inside the visible top edge of its selected iframe region.
 * This keeps tall or partially scrolled regions visually connected to the toolbar instead of
 * deriving the anchor from an off-screen bottom edge.
 */
export function computeCloneToolbarAnchor(
  region: { left: number, top: number, width: number, height: number },
  viewport: { width: number, height: number },
  inset = 12,
): { x: number, y: number } {
  const regionCenter = region.left + region.width / 2
  const visibleTop = Math.max(0, Math.min(viewport.height, region.top))
  return {
    x: Math.max(0, Math.min(viewport.width, regionCenter)),
    y: Math.max(inset, Math.min(viewport.height, visibleTop + inset)),
  }
}

export function formatCloneToolbarRegionLabel(region: { id?: string, label?: string } | null | undefined): string {
  const label = String(region?.label || '').trim()
  if (label)
    return label
  return String(region?.id || '').trim() || 'Selected section'
}

export function buildCloneStudioFrameHtmlForCanvas(options: CloneStudioFrameHtmlForCanvasOptions): string {
  // Saved per-region height crops live in section_index (not the rendered HTML), so re-apply them to
  // the iframe on load — otherwise persisted crops would not render until the user re-set them.
  const regionOverrides = getCloneRegions(options.page)
    .filter(region => typeof region.height_override === 'number')
    .map(region => ({ id: region.id, height_override: region.height_override }))

  const runtimeJs = options.page?.content?.modes?.clone?.runtime_js
  return buildCloneStudioHtml({
    rendered: getCloneStudioHtml(options.page),
    title: options.title,
    baseHref: options.baseHref || options.workerBase || '/',
    mediaBase: options.workerBase,
    stylesheetUrls: getCloneStylesheetUrls(options.page),
    selectedRegionId: null,
    bridgeToken: options.bridgeToken,
    regionOverrides,
    oemId: options.oemId,
    modelSlug: options.modelSlug,
    editable: options.editable !== false,
    runtimeJs: typeof runtimeJs === 'string' && runtimeJs.length > 0 ? runtimeJs : undefined,
  })
}
