/**
 * MCP tools for querying OEM and vehicle model data.
 */

import type { RegisteredTool } from '.';
import { createSupabaseClient } from '../../utils/supabase';
import { allOemIds, getOemDefinition, resolveOemDefinition } from '../../oem/registry';
import type { OemId } from '../../oem/types';
import { jsonResult, textResult } from '.';

export const listOemsTool: RegisteredTool = {
  definition: {
    name: 'list_oems',
    description: 'List all available OEMs (vehicle manufacturers) in the OEM Agent registry.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  handler: async () => {
    const staticOems = allOemIds.map((id) => {
      const def = getOemDefinition(id);
      return {
        id,
        name: def?.name,
        base_url: def?.baseUrl,
        is_active: true,
      };
    });
    return jsonResult({ oems: staticOems });
  },
};

export const searchOemModelsTool: RegisteredTool = {
  definition: {
    name: 'search_oem_models',
    description:
      'Search vehicle models for a given OEM. Returns matching models with basic metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        oem_id: {
          type: 'string',
          description: 'OEM identifier, e.g. "toyota-au" or "ford-au"',
        },
        query: {
          type: 'string',
          description: 'Optional search term to filter by model name',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default 20, max 100)',
        },
      },
      required: ['oem_id'],
    },
  },
  handler: async (args, ctx) => {
    const oemId = String(args.oem_id || '');
    const query = String(args.query || '').trim();
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);

    if (!oemId) {
      return textResult('oem_id is required', true);
    }

    const supabase = createSupabaseClient({
      url: ctx.env.SUPABASE_URL,
      serviceRoleKey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    let dbQuery = supabase
      .from('vehicle_models')
      .select('id, oem_id, slug, name, body_type, fuel_type, source_url, brochure_url, updated_at')
      .eq('oem_id', oemId)
      .order('name', { ascending: true })
      .limit(limit);

    if (query) {
      dbQuery = dbQuery.ilike('name', `%${query}%`);
    }

    const { data, error } = await dbQuery;
    if (error) {
      return textResult(`Supabase error: ${error.message}`, true);
    }

    return jsonResult({
      oem_id: oemId,
      query: query || undefined,
      count: data?.length ?? 0,
      models: data ?? [],
    });
  },
};

export const getOemModelTool: RegisteredTool = {
  definition: {
    name: 'get_oem_model',
    description:
      'Get comprehensive details for a specific vehicle model including variants, colors, pricing, and offers.',
    inputSchema: {
      type: 'object',
      properties: {
        oem_id: {
          type: 'string',
          description: 'OEM identifier, e.g. "toyota-au"',
        },
        model_slug: {
          type: 'string',
          description: 'Model slug, e.g. "corolla"',
        },
        include_variants: {
          type: 'boolean',
          description: 'Include product variants (default true)',
        },
        include_offers: {
          type: 'boolean',
          description: 'Include current offers (default true)',
        },
      },
      required: ['oem_id', 'model_slug'],
    },
  },
  handler: async (args, ctx) => {
    const oemId = String(args.oem_id || '') as OemId;
    const modelSlug = String(args.model_slug || '');
    const includeVariants = args.include_variants !== false;
    const includeOffers = args.include_offers !== false;

    if (!oemId || !modelSlug) {
      return textResult('oem_id and model_slug are required', true);
    }

    const supabase = createSupabaseClient({
      url: ctx.env.SUPABASE_URL,
      serviceRoleKey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    const def = await resolveOemDefinition(oemId, supabase);
    if (!def) {
      return textResult(`OEM not found: ${oemId}`, true);
    }

    const { data: model, error: modelError } = await supabase
      .from('vehicle_models')
      .select('*')
      .eq('oem_id', oemId)
      .eq('slug', modelSlug)
      .single();

    if (modelError || !model) {
      return textResult(`Model not found: ${modelError?.message || `${oemId}/${modelSlug}`}`, true);
    }

    const result: Record<string, unknown> = {
      oem: {
        id: def.id,
        name: def.name,
        base_url: def.baseUrl,
      },
      model,
    };

    if (includeVariants) {
      const { data: products } = await supabase
        .from('products')
        .select('id, title, subtitle, body_type, fuel_type, availability, price_amount, price_type, source_url, key_features')
        .eq('oem_id', oemId)
        .eq('availability', 'available')
        .ilike('title', `%${model.name}%`)
        .order('title');
      result.variants = products ?? [];
    }

    if (includeOffers) {
      const { data: offers } = await supabase
        .from('offers')
        .select('id, title, description, price_amount, saving_amount, start_date, end_date, applicable_models')
        .eq('oem_id', oemId)
        .order('updated_at', { ascending: false })
        .limit(20);
      result.offers = offers ?? [];
    }

    return jsonResult(result);
  },
};
