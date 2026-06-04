import type { CaptureDiagnosticsRecord } from './worker-api'

export type CaptureStatusTone = 'success' | 'warning' | 'error' | 'neutral'

export interface CaptureStatusDescription {
  tone: CaptureStatusTone
  label: string
  /** Human-readable detail: backend + reason/timing, for surfacing in the UI. */
  detail: string
}

/**
 * Turn a persisted capture diagnostics record into a UI-ready badge
 * description. Keeps backend and challenge/failure metadata visible for
 * troubleshooting (see HANDOFF-model-pages-next.md §5).
 */
export function describeCaptureStatus(
  record: CaptureDiagnosticsRecord | null | undefined,
): CaptureStatusDescription {
  if (!record) {
    return { tone: 'neutral', label: 'No capture diagnostics', detail: 'This page has not been captured yet.' }
  }

  const backend = record.backend ? `via ${record.backend}` : 'backend unknown'

  switch (record.status) {
    case 'ok':
      return {
        tone: 'success',
        label: 'Captured',
        detail: `${backend} · ${record.capture_time_ms}ms${record.images_uploaded != null ? ` · ${record.images_uploaded} images` : ''}`,
      }
    case 'blocked':
      return {
        tone: 'warning',
        label: 'Capture blocked',
        detail: record.reason || `Bot challenge detected ${backend}`,
      }
    case 'error':
    default:
      return {
        tone: 'error',
        label: 'Capture failed',
        detail: `${record.reason || 'Unknown error'} (${backend})`,
      }
  }
}
