/**
 * Audit logging for admin operations.
 * Appends JSON lines to R2 at audit/YYYY-MM-DD.jsonl.
 */

import type { Context, Next } from 'hono';
import type { AppEnv } from '../types';

export interface PublicationAuditMetadata {
  page_id?: string;
  draft_revision?: number;
  candidate_revision?: number;
  published_revision?: number;
  action?: string;
}

export interface PublicationTransitionAuditRecord {
  schema_version: 1;
  intent_id: string;
  phase: 'intent' | 'outcome';
  timestamp: string;
  actor: string;
  page_id: string;
  target_revision: number;
  expected_published_revision: number;
  current_published_revision: number;
  outcome?: 'applied' | 'conflict' | 'failed';
  resulting_published_revision?: number;
  error?: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    publicationAudit?: PublicationAuditMetadata;
  }
}

export interface AuditEntry {
  timestamp: string;
  user: string;
  method: string;
  path: string;
  oem_id?: string;
  status: number;
  ip: string;
  page_id?: string;
  draft_revision?: number;
  candidate_revision?: number;
  published_revision?: number;
  action?: string;
}

/** Attach publication details for the single audit middleware write. */
export function setPublicationAuditMetadata(
  context: Context,
  metadata: PublicationAuditMetadata,
): void {
  context.set('publicationAudit', { ...metadata });
}

export async function logAudit(bucket: R2Bucket, entry: AuditEntry): Promise<void> {
  const date = entry.timestamp.slice(0, 10); // YYYY-MM-DD
  const key = `audit/${date}.jsonl`;

  // Read existing log
  let existing = '';
  try {
    const obj = await bucket.get(key);
    if (obj) existing = await obj.text();
  } catch {}

  // Append new entry
  const line = JSON.stringify(entry);
  const content = existing ? `${existing}\n${line}` : line;

  await bucket.put(key, content, {
    httpMetadata: { contentType: 'application/x-ndjson' },
  });
}

/** Store a publication transition phase as a write-once object. */
export async function writeImmutablePublicationTransitionAudit(
  bucket: R2Bucket,
  entry: PublicationTransitionAuditRecord,
): Promise<void> {
  const date = entry.timestamp.slice(0, 10);
  const key = `audit/publication-transitions/${date}/${entry.intent_id}-${entry.phase}.json`;
  const stored = await bucket.put(key, JSON.stringify(entry), {
    onlyIf: new Headers({ 'if-none-match': '*' }),
    httpMetadata: { contentType: 'application/json' },
  });
  if (!stored) throw new Error('Publication transition audit record already exists');
}

export function auditMiddleware() {
  return async (c: Context<AppEnv>, next: Next) => {
    const method = c.req.method;

    // Only log state-changing operations
    if (!['POST', 'PUT', 'DELETE'].includes(method)) {
      await next();
      return;
    }

    await next();

    // Log after response (non-blocking via waitUntil if available)
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      user: c.get('accessUser')?.email || 'unknown',
      method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      ip: c.req.header('cf-connecting-ip') || 'unknown',
      ...(c.get('publicationAudit') || {}),
    };

    // Extract oem_id from path if present
    const oemMatch = entry.path.match(/\/((?:kia|nissan|ford|volkswagen|mitsubishi|ldv|isuzu|mazda|kgm|gwm|suzuki|hyundai|toyota|subaru|gmsv|foton|gac|chery)-au)/);
    if (oemMatch) entry.oem_id = oemMatch[1];

    const bucket = (c.env as any).MOLTBOT_BUCKET as R2Bucket | undefined;
    if (bucket) {
      // Fire and forget — don't block the response
      logAudit(bucket, entry).catch(() => {});
    }
  };
}
