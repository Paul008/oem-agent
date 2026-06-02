/**
 * Apify Client
 *
 * Lightweight client for calling Apify actors from Cloudflare Workers.
 * Handles run initiation, polling, and result fetching.
 */

const APIFY_API_BASE = 'https://api.apify.com/v2';

export interface ApifyRunOptions {
  token: string;
  actorId: string;
  input?: Record<string, unknown>;
  timeoutSecs?: number;
  pollIntervalSecs?: number;
}

export interface ApifyRunResult {
  runId: string;
  status: string;
  datasetId: string;
  items: unknown[];
  error?: string;
}

/**
 * Start an Apify actor run and poll until completion.
 */
export async function runApifyActor(options: ApifyRunOptions): Promise<ApifyRunResult> {
  const { token, actorId, input = {}, timeoutSecs = 300, pollIntervalSecs = 10 } = options;

  // 1. Start the run
  const startRes = await fetch(
    `${APIFY_API_BASE}/acts/${actorId}/runs`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  if (!startRes.ok) {
    const err = await startRes.text();
    throw new Error(`Apify start failed: ${startRes.status} ${err}`);
  }

  const startData = await startRes.json() as any;
  const runId = startData.data.id;
  console.log(`[Apify] Started run ${runId}`);

  // 2. Poll for completion
  const startTime = Date.now();
  const timeoutMs = timeoutSecs * 1000;

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) {
      throw new Error(`Apify run ${runId} timed out after ${timeoutSecs}s`);
    }

    await sleep(pollIntervalSecs * 1000);

    const statusRes = await fetch(
      `${APIFY_API_BASE}/actor-runs/${runId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!statusRes.ok) continue;

    const statusData = await statusRes.json() as any;
    const status = statusData.data.status;

    console.log(`[Apify] Run ${runId} status: ${status}`);

    if (status === 'SUCCEEDED') {
      const datasetId = statusData.data.defaultDatasetId;
      const items = await fetchDatasetItems(token, datasetId);
      return { runId, status, datasetId, items };
    }

    if (status === 'FAILED' || status === 'TIMED_OUT' || status === 'ABORTED') {
      const errorMessage = statusData.data.errorMessage || status;
      throw new Error(`Apify run ${runId} failed: ${errorMessage}`);
    }
  }
}

/**
 * Fetch all items from an Apify dataset.
 */
async function fetchDatasetItems(token: string, datasetId: string): Promise<unknown[]> {
  const items: unknown[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const res = await fetch(
      `${APIFY_API_BASE}/datasets/${datasetId}/items?offset=${offset}&limit=${limit}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch dataset ${datasetId}: ${res.status}`);
    }

    const batch = await res.json() as unknown[];
    if (batch.length === 0) break;

    items.push(...batch);
    offset += batch.length;

    if (batch.length < limit) break;
  }

  return items;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
