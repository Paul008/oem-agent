/**
 * Skill: oem-report — Slack Alerts + Daily Digest
 *
 * Handles:
 * - Immediate Slack alerts for CRITICAL/HIGH severity changes
 * - Hourly batch for MEDIUM severity changes
 * - Daily digest summarising all changes across 13 OEMs
 *
 * Triggered by:
 * - Cron (daily at 7am AEDT for digest)
 * - oem-extract skill (after change events are created)
 * - Manual trigger
 *
 * Slack message format:
 * - Rich blocks with OEM branding colours
 * - Threaded responses for related changes
 * - Action buttons for "View page", "Compare", "Dismiss"
 */

import type { ChangeEvent, Severity } from '../../lib/shared/types';

interface ReportPayload {
  page_type: string;           // 'daily_digest' for digest, or specific event
  trigger: 'cron' | 'change_event' | 'manual';
  change_events?: ChangeEvent[];
}

interface ContainerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GROQ_API_KEY: string;
  SLACK_BOT_TOKEN: string;
}

export async function handler(
  env: ContainerEnv,
  payload: Record<string, unknown>
): Promise<{ messages_sent: number }> {
  const { page_type, trigger, change_events } = payload as unknown as ReportPayload;

  console.log(`[oem-report] Starting (type: ${page_type}, trigger: ${trigger})`);

  if (page_type === 'daily_digest') {
    return sendDailyDigest(env);
  }

  // Immediate alert for specific change events
  if (change_events && change_events.length > 0) {
    return sendChangeAlerts(env, change_events);
  }

  return { messages_sent: 0 };
}

async function sendDailyDigest(env: ContainerEnv): Promise<{ messages_sent: number }> {
  // TODO: Query change_events from last 24h from Supabase
  // TODO: Group by OEM, sort by severity
  // TODO: Generate summary via Groq GPT-OSS 120B
  // TODO: Format as Slack blocks
  // TODO: Send via Slack Bot API (chat.postMessage)
  console.log('[oem-report] Generating daily digest...');
  return { messages_sent: 0 };
}

async function sendChangeAlerts(
  env: ContainerEnv,
  events: ChangeEvent[]
): Promise<{ messages_sent: number }> {
  // TODO: Filter by severity
  // CRITICAL/HIGH → send immediately
  // MEDIUM → batch (add to hourly queue in R2)
  // LOW → skip (included in daily digest only)

  const immediate = events.filter(e => e.severity === 'critical' || e.severity === 'high');

  for (const event of immediate) {
    // TODO: Format Slack message blocks
    // TODO: Send via Slack Bot API
    console.log(`[oem-report] Alert: ${event.oem_id} — ${event.event_type} (${event.severity})`);
  }

  return { messages_sent: immediate.length };
}
