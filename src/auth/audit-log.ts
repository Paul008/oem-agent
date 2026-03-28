/**
 * Audit logging for admin operations.
 * Appends JSON lines to R2 at audit/YYYY-MM-DD.jsonl.
 */

import type { Context, Next } from 'hono';

export interface AuditEntry {
  timestamp: string;
  user: string;
  method: string;
  path: string;
  oem_id?: string;
  status: number;
  ip: string;
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

export function auditMiddleware() {
  return async (c: Context, next: Next) => {
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
      user: (c.get('user') as any)?.email || 'unknown',
      method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      ip: c.req.header('cf-connecting-ip') || 'unknown',
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
