/**
 * MCP tools for catalog data: products, variants, colors, and accessories.
 */

import type { RegisteredTool } from '.';
import { createSupabaseClient } from '../../utils/supabase';
import { allOemIds } from '../../oem/registry';
import type { OemId } from '../../oem/types';
import { jsonResult, textResult } from '.';

function validateOemId(value: string): value is OemId {
  return allOemIds.includes(value as OemId);
}

export const searchProductsTool: RegisteredTool = {
  definition: {
    name: 'search_products',
    description:
      'Search vehicle products/variants for an OEM. Supports filtering by model name, body type, fuel type, and drivetrain.',
    inputSchema: {
      type: 'object',
      properties: {
        oem_id: {
          type: 'string',
          description: 'OEM identifier, e.g. "toyota-au"',
        },
        model_name: {
          type: 'string',
          description: 'Optional model name filter, e.g. "Corolla"',
        },
        query: {
          type: 'string',
          description: 'Optional free-text search across title/subtitle',
        },
        body_type: {
          type: 'string',
          description: 'Optional body type filter, e.g. "SUV" or "Ute"',
        },
        fuel_type: {
          type: 'string',
          description: 'Optional fuel type filter, e.g. "Petrol" or "Electric"',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default 20, max 100)',
        },
      },
      required: ['oem_id'],
    },
  },
  handler: async (args, ctx) => {
    const oemId = String(args.oem_id || '');
    const modelName = String(args.model_name || '').trim();
    const query = String(args.query || '').trim();
    const bodyType = String(args.body_type || '').trim();
    const fuelType = String(args.fuel_type || '').trim();
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);

    if (!validateOemId(oemId)) {
      return textResult(`Invalid or unknown oem_id: ${oemId}`, true);
    }

    const supabase = createSupabaseClient({
      url: ctx.env.SUPABASE_URL,
      serviceRoleKey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    let dbQuery = supabase
      .from('products')
      .select(
        'id, model_id, title, subtitle, body_type, fuel_type, drivetrain, transmission, engine_desc, price_amount, price_type, primary_image_r2_key, key_features, availability, source_url',
      )
      .eq('oem_id', oemId)
      .order('title', { ascending: true })
      .limit(limit);

    if (modelName) {
      dbQuery = dbQuery.ilike('title', `%${modelName}%`);
    }
    if (query) {
      dbQuery = dbQuery.or(`title.ilike.%${query}%,subtitle.ilike.%${query}%`);
    }
    if (bodyType) {
      dbQuery = dbQuery.ilike('body_type', `%${bodyType}%`);
    }
    if (fuelType) {
      dbQuery = dbQuery.ilike('fuel_type', `%${fuelType}%`);
    }

    const { data, error } = await dbQuery;
    if (error) {
      return textResult(`Supabase error: ${error.message}`, true);
    }

    return jsonResult({
      oem_id: oemId,
      count: data?.length ?? 0,
      products: data ?? [],
    });
  },
};

export const getProductTool: RegisteredTool = {
  definition: {
    name: 'get_product',
    description:
      'Get comprehensive details for a single vehicle product/variant including pricing, colors, specs, and applicable offers.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'Product UUID',
        },
      },
      required: ['product_id'],
    },
  },
  handler: async (args, ctx) => {
    const productId = String(args.product_id || '');
    if (!productId) {
      return textResult('product_id is required', true);
    }

    const supabase = createSupabaseClient({
      url: ctx.env.SUPABASE_URL,
      serviceRoleKey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (error || !product) {
      return textResult(`Product not found: ${error?.message || productId}`, true);
    }

    const oemId = product.oem_id as OemId;

    const [{ data: colors }, { data: pricing }, { data: offers }] = await Promise.all([
      supabase
        .from('variant_colors')
        .select('color_name, color_code, swatch_url, hero_image_url, color_type, price_delta, is_standard')
        .eq('product_id', productId)
        .order('is_standard', { ascending: false }),
      supabase
        .from('variant_pricing')
        .select('driveaway_nsw, driveaway_vic, driveaway_qld, driveaway_wa, driveaway_sa, driveaway_tas, driveaway_act, driveaway_nt')
        .eq('product_id', productId)
        .maybeSingle(),
      supabase
        .from('offers')
        .select('id, title, description, price_amount, saving_amount, start_date, end_date')
        .eq('oem_id', oemId)
        .order('updated_at', { ascending: false })
        .limit(20),
    ]);

    return jsonResult({
      product,
      colors: colors ?? [],
      pricing: pricing ?? null,
      offers: offers ?? [],
    });
  },
};

export const listVariantColorsTool: RegisteredTool = {
  definition: {
    name: 'list_variant_colors',
    description: 'List color options for a vehicle product/variant.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'Product UUID',
        },
      },
      required: ['product_id'],
    },
  },
  handler: async (args, ctx) => {
    const productId = String(args.product_id || '');
    if (!productId) {
      return textResult('product_id is required', true);
    }

    const supabase = createSupabaseClient({
      url: ctx.env.SUPABASE_URL,
      serviceRoleKey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, title, oem_id')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return textResult(`Product not found: ${productError?.message || productId}`, true);
    }

    const { data: colors, error } = await supabase
      .from('variant_colors')
      .select(
        'id, color_name, color_code, swatch_url, hero_image_url, color_type, price_delta, is_standard, availability',
      )
      .eq('product_id', productId)
      .order('is_standard', { ascending: false });

    if (error) {
      return textResult(`Supabase error: ${error.message}`, true);
    }

    return jsonResult({
      product_id: productId,
      product_title: product.title,
      oem_id: product.oem_id,
      count: colors?.length ?? 0,
      colors: colors ?? [],
    });
  },
};

export const searchAccessoriesTool: RegisteredTool = {
  definition: {
    name: 'search_accessories',
    description:
      'Search accessory catalog for an OEM. Optionally filter by model name or free-text query.',
    inputSchema: {
      type: 'object',
      properties: {
        oem_id: {
          type: 'string',
          description: 'OEM identifier, e.g. "toyota-au"',
        },
        model_name: {
          type: 'string',
          description: 'Optional model name filter',
        },
        query: {
          type: 'string',
          description: 'Optional free-text search across name/description',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default 20, max 100)',
        },
      },
      required: ['oem_id'],
    },
  },
  handler: async (args, ctx) => {
    const oemId = String(args.oem_id || '');
    const modelName = String(args.model_name || '').trim();
    const query = String(args.query || '').trim();
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);

    if (!validateOemId(oemId)) {
      return textResult(`Invalid or unknown oem_id: ${oemId}`, true);
    }

    const supabase = createSupabaseClient({
      url: ctx.env.SUPABASE_URL,
      serviceRoleKey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    let accessoryQuery = supabase
      .from('accessories')
      .select('id, oem_id, name, description, category, price_amount, price_type, image_url, external_key, inc_fitting')
      .eq('oem_id', oemId)
      .order('name', { ascending: true })
      .limit(limit);

    if (query) {
      accessoryQuery = accessoryQuery.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
    }

    const { data: accessories, error } = await accessoryQuery;
    if (error) {
      return textResult(`Supabase error: ${error.message}`, true);
    }

    let result = accessories ?? [];

    if (modelName) {
      const { data: models } = await supabase
        .from('vehicle_models')
        .select('id')
        .eq('oem_id', oemId)
        .ilike('name', `%${modelName}%`);

      const modelIds = new Set((models ?? []).map((m) => m.id));

      if (modelIds.size > 0) {
        const { data: joins } = await supabase
          .from('accessory_models')
          .select('accessory_id')
          .in('model_id', Array.from(modelIds));

        const accessoryIds = new Set((joins ?? []).map((j) => j.accessory_id));
        result = result.filter((a) => accessoryIds.has(a.id));
      }
    }

    return jsonResult({
      oem_id: oemId,
      count: result.length,
      accessories: result,
    });
  },
};
