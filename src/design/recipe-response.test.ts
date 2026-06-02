import { describe, expect, it, vi } from 'vitest';
import { normalizeRecipeRows } from './recipe-response';

const supabaseResponse = vi.hoisted(() => ({
  brandRows: [{
    id: 'brand-route',
    oem_id: 'ford-au',
    pattern: 'hero',
    variant: 'image-overlay',
    label: 'Ford Hero',
    resolves_to: 'hero',
    defaults_json: null,
  }],
  defaultRows: [{
    id: 'default-route',
    pattern: 'hero',
    variant: 'video',
    label: 'Video Hero',
    resolves_to: 'hero',
    defaults_json: null,
  }],
}));

describe('normalizeRecipeRows', () => {
  it('returns brand recipes first and marks their source', () => {
    const recipes = normalizeRecipeRows({
      brandRecipes: [{
        id: 'brand-1',
        oem_id: 'ford-au',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Ford Hero',
        resolves_to: 'hero',
        defaults_json: { heading_size: '4xl' },
      }],
      defaultRecipes: [{
        id: 'default-1',
        pattern: 'hero',
        variant: 'video',
        label: 'Video Hero',
        resolves_to: 'hero',
        defaults_json: {},
      }],
    });

    expect(recipes).toEqual([
      {
        id: 'brand-1',
        oem_id: 'ford-au',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Ford Hero',
        resolves_to: 'hero',
        defaults_json: { heading_size: '4xl' },
        source: 'brand',
      },
      {
        id: 'default-1',
        oem_id: null,
        pattern: 'hero',
        variant: 'video',
        label: 'Video Hero',
        resolves_to: 'hero',
        defaults_json: {},
        source: 'default',
      },
    ]);
  });

  it('normalizes null defaults_json to an empty object', () => {
    const recipes = normalizeRecipeRows({
      brandRecipes: [{
        id: 'brand-null',
        oem_id: 'ford-au',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Ford Hero',
        resolves_to: 'hero',
        defaults_json: null,
      }],
      defaultRecipes: [{
        id: 'default-null',
        pattern: 'hero',
        variant: 'video',
        label: 'Video Hero',
        resolves_to: 'hero',
        defaults_json: null,
      }],
    });

    expect(recipes[0].defaults_json).toEqual({});
    expect(recipes[1].defaults_json).toEqual({});
  });

  it('lets brand recipes override defaults with the same pattern and variant', () => {
    const recipes = normalizeRecipeRows({
      brandRecipes: [{
        id: 'brand-hero',
        oem_id: 'ford-au',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Ford Hero',
        resolves_to: 'hero',
        defaults_json: {},
      }],
      defaultRecipes: [{
        id: 'default-hero',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Generic Hero',
        resolves_to: 'hero',
        defaults_json: {},
      }],
    });

    expect(recipes).toHaveLength(1);
    expect(recipes[0].id).toBe('brand-hero');
    expect(recipes[0].source).toBe('brand');
  });
});

vi.mock('../utils/supabase', () => ({
  createSupabaseClient: () => ({
    from(table: string) {
      const data = table === 'brand_recipes' ? supabaseResponse.brandRows : supabaseResponse.defaultRows;
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return Promise.resolve({ data });
        },
      };
    },
  }),
}));

describe('oem-agent recipe route', () => {
  it('returns the normalized public recipe payload', async () => {
    const { default: oemAgentApp } = await import('../routes/oem-agent');

    const response = await oemAgentApp.request('/recipes/ford-au', undefined, {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    } as never);

    expect(response.status).toBe(200);

    const body = await response.json() as {
      oem_id: string;
      recipes: Array<{
        id: string;
        oem_id: string | null;
        source: 'brand' | 'default';
        defaults_json: Record<string, unknown>;
      }>;
      brand_recipes?: unknown;
      default_recipes?: unknown;
    };

    expect(body).toEqual({
      oem_id: 'ford-au',
      recipes: [
        {
          id: 'brand-route',
          oem_id: 'ford-au',
          source: 'brand',
          defaults_json: {},
          pattern: 'hero',
          variant: 'image-overlay',
          label: 'Ford Hero',
          resolves_to: 'hero',
        },
        {
          id: 'default-route',
          oem_id: null,
          source: 'default',
          defaults_json: {},
          pattern: 'hero',
          variant: 'video',
          label: 'Video Hero',
          resolves_to: 'hero',
        },
      ],
    });
    expect(body.brand_recipes).toBeUndefined();
    expect(body.default_recipes).toBeUndefined();
  });
});
