import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { createMockEnv } from '../test-utils';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}));

const MODELS = [
  ['qashqai', 'QASHQAI'],
  ['new-x-trail', 'NEW X-TRAIL'],
  ['patrol', 'Patrol'],
  ['all-new-navara', 'All-New Navara'],
  ['z', 'Z'],
  ['ariya', 'ARIYA'],
] as const;

const modelRows = MODELS.map(([slug, name], index) => ({
  id: `model-${index + 1}`,
  oem_id: 'nissan-au',
  slug,
  name,
  body_type: slug === 'all-new-navara' ? 'Ute' : 'SUV',
  fuel_type: slug === 'ariya' ? 'Electric' : null,
  category: slug === 'ariya' ? 'electric' : 'suv',
  model_year: 2026,
  hero_image_url: null,
  is_active: true,
  source_url: slug === 'all-new-navara'
    ? 'https://navara.nissan.com.au/'
    : `https://www.nissan.com.au/vehicles/browse-range/${slug === 'z' ? 'Z' : slug}.html`,
  brochure_url: null,
  updated_at: '2026-07-21T00:00:00.000Z',
}));

function thenableQuery(table: string, data: unknown[]) {
  const result = { data, error: null, count: data.length };
  const query: Record<string, any> = {
    then(resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  for (const method of ['select', 'eq', 'order', 'limit', 'in', 'ilike', 'range']) {
    query[method] = (...args: unknown[]) => {
      mocks.calls.push({ table, method, args });
      return query;
    };
  }
  return query;
}

vi.mock('../utils/supabase', () => ({
  createSupabaseClient: () => ({
    from(table: string) {
      mocks.calls.push({ table, method: 'from', args: [] });
      if (table === 'vehicle_models') return thenableQuery(table, modelRows);
      if (table === 'products') {
        return thenableQuery(table, modelRows.map((model, index) => ({
          id: `product-${index + 1}`,
          title: `${model.name} ST`,
          model_id: model.id,
        })));
      }
      if (table === 'variant_colors') return thenableQuery(table, []);
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { searchOemModelsTool } from '../mcp/tools/oem-tools';
import { dealerApi } from './dealer-api';

beforeEach(() => {
  mocks.calls.length = 0;
});

describe('Nissan six-model consumer contracts', () => {
  it('returns the exact active six-model set through the public dealer model endpoint', async () => {
    const app = new Hono<AppEnv>();
    app.route('/api/wp/v2', dealerApi);
    const response = await app.request(
      'https://oem-agent.example.test/api/wp/v2/models?oem_id=nissan-au',
      {},
      createMockEnv(),
    );
    const body = await response.json<Array<{ slug: string; name: string }>>();

    expect(response.status).toBe(200);
    expect(body.map(model => model.slug).sort()).toEqual(MODELS.map(([slug]) => slug).sort());
    expect(mocks.calls).toContainEqual({
      table: 'vehicle_models',
      method: 'eq',
      args: ['is_active', true],
    });
  });

  it('returns the same six normalized IDs through MCP model search for review', async () => {
    const result = await searchOemModelsTool.handler(
      { oem_id: 'nissan-au', limit: 20 },
      { sessionId: 'nissan-contract', env: createMockEnv() },
    );
    const parsed = JSON.parse(result.content[0].text) as {
      oem_id: string;
      count: number;
      models: Array<{ oem_id: string; slug: string }>;
    };

    expect(result.isError).not.toBe(true);
    expect(parsed.oem_id).toBe('nissan-au');
    expect(parsed.count).toBe(6);
    expect(parsed.models.map(model => `${model.oem_id}-${model.slug}`).sort()).toEqual(
      MODELS.map(([slug]) => `nissan-au-${slug}`).sort(),
    );
  });
});
