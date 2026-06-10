import { describe, expect, it, vi } from 'vitest';

const brandTokens = {
  oem_id: 'mitsubishi-au',
  version: 1,
  captured_at: '2026-06-10T00:00:00.000Z',
  source_pages: [],
  colors: {},
  typography: {
    font_primary: 'MMC, sans-serif',
    font_secondary: null,
    font_mono: null,
    font_cdn_urls: [],
    scale: {},
  },
  spacing: {},
  borders: {},
  shadows: {},
  buttons: {},
  components: {},
  animations: null,
};

class SupabaseQuery {
  constructor(private readonly table: string) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  async single() {
    if (this.table === 'brand_tokens')
      return { data: { tokens_json: brandTokens } };
    if (this.table === 'oems')
      return { data: { id: 'mitsubishi-au', name: 'Mitsubishi' } };
    return { data: null };
  }

  then(resolve: (value: { data: unknown[] }) => void) {
    if (this.table === 'brand_recipes')
      return Promise.resolve(resolve({ data: [] }));
    if (this.table === 'default_recipes')
      return Promise.resolve(resolve({ data: [] }));
    return Promise.resolve(resolve({ data: [] }));
  }
}

vi.mock('../utils/supabase', () => ({
  createSupabaseClient: () => ({
    from(table: string) {
      return new SupabaseQuery(table);
    },
  }),
}));

describe('oem-agent style guide route', () => {
  it('enriches missing typography font_faces from hosted OEM fonts', async () => {
    const { default: oemAgentApp } = await import('./oem-agent');

    const response = await oemAgentApp.request('/admin/style-guide/mitsubishi-au', undefined, {
      DEV_MODE: 'true',
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    } as never);

    expect(response.status).toBe(200);

    const body = await response.json() as any;
    const typography = body.brand_tokens.typography;

    expect(body.oem_name).toBe('Mitsubishi');
    expect(typography.font_primary).toBe('MMC, sans-serif');
    expect(typography.font_faces).toEqual([
      {
        family: 'MMC',
        weight: '400',
        url: 'http://localhost/media/fonts/mitsubishi-au/MMC-Regular.woff2',
      },
      {
        family: 'MMC',
        weight: '500',
        url: 'http://localhost/media/fonts/mitsubishi-au/MMC-Medium.woff2',
      },
      {
        family: 'MMC',
        weight: '700',
        url: 'http://localhost/media/fonts/mitsubishi-au/MMC-Bold.woff2',
      },
    ]);
    expect(typography.font_cdn_urls).toContain('http://localhost/media/fonts/mitsubishi-au/MMC-Regular.woff2');
  });
});
