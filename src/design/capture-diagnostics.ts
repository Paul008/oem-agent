/**
 * Capture Diagnostics — persist why a clone capture succeeded or failed.
 *
 * A failed capture is intentionally NOT written to pages/definitions (that
 * would overwrite a good clone with a challenge page). Without a separate
 * record the failure is invisible. This module persists capture outcomes under
 * `pages/diagnostics/{oemId}/{modelSlug}/` so the dashboard can surface backend,
 * status, source/final URLs, timing, and the failure reason for troubleshooting.
 */

import type { OemId } from '../oem/types';
import type { PageCaptureResult, CaptureBackend } from './page-capturer';

export const CAPTURE_DIAGNOSTICS_PREFIX = 'pages/diagnostics';
const HISTORY_LIMIT = 20;

export type CaptureStatus = 'ok' | 'blocked' | 'error';

export interface CaptureDiagnosticsRecord {
  oem_id: string;
  model_slug: string;
  captured_at: string;
  status: CaptureStatus;
  success: boolean;
  bot_blocked: boolean;
  backend?: CaptureBackend | string;
  source_url: string;
  final_url?: string;
  capture_time_ms: number;
  html_size_kb?: number;
  elements_captured?: number;
  images_uploaded?: number;
  /** Failure / blocked reason. Absent on success. */
  reason?: string;
}

export interface CaptureDiagnostics {
  latest: CaptureDiagnosticsRecord;
  history: CaptureDiagnosticsRecord[];
}

export function diagnosticsKey(oemId: OemId | string, modelSlug: string): string {
  return `${CAPTURE_DIAGNOSTICS_PREFIX}/${oemId}/${modelSlug}/latest.json`;
}

export interface BuildDiagnosticsInput {
  oemId: OemId | string;
  modelSlug: string;
  sourceUrl: string;
  capturedAt: string;
  result: PageCaptureResult;
}

/** Derive a structured diagnostics record from a capture result. */
export function buildDiagnosticsRecord(input: BuildDiagnosticsInput): CaptureDiagnosticsRecord {
  const { result } = input;
  const botBlocked = result.bot_blocked === true;

  let status: CaptureStatus;
  let reason: string | undefined;
  if (result.success) {
    status = 'ok';
  } else if (botBlocked) {
    status = 'blocked';
    reason = 'Security/challenge page detected (bot challenge blocked capture)';
  } else {
    status = 'error';
    reason = result.error || 'Unknown capture error';
  }

  return {
    oem_id: String(input.oemId),
    model_slug: input.modelSlug,
    captured_at: input.capturedAt,
    status,
    success: result.success,
    bot_blocked: botBlocked,
    backend: result.capture_backend,
    source_url: input.sourceUrl,
    final_url: result.page?.source_url,
    capture_time_ms: result.capture_time_ms,
    html_size_kb: result.html_size_kb,
    elements_captured: result.elements_captured,
    images_uploaded: result.images_uploaded,
    reason,
  };
}

/** Persist a diagnostics record (latest + bounded newest-first history). */
export async function recordCaptureDiagnostics(
  r2Bucket: R2Bucket,
  record: CaptureDiagnosticsRecord,
): Promise<void> {
  const existing = await readCaptureDiagnostics(r2Bucket, record.oem_id, record.model_slug);
  const history = [record, ...(existing?.history ?? [])].slice(0, HISTORY_LIMIT);
  const payload: CaptureDiagnostics = { latest: record, history };

  const key = diagnosticsKey(record.oem_id, record.model_slug);
  await r2Bucket.put(key, JSON.stringify(payload), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { kind: 'capture-diagnostics', oem_id: record.oem_id, model_slug: record.model_slug },
  });
}

export async function readCaptureDiagnostics(
  r2Bucket: R2Bucket,
  oemId: OemId | string,
  modelSlug: string,
): Promise<CaptureDiagnostics | null> {
  const obj = await r2Bucket.get(diagnosticsKey(oemId, modelSlug));
  if (!obj) return null;
  try {
    const data = (await obj.json()) as CaptureDiagnostics;
    if (!data?.latest) return null;
    return { latest: data.latest, history: Array.isArray(data.history) ? data.history : [data.latest] };
  } catch {
    return null;
  }
}
