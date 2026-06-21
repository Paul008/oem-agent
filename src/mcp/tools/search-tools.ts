/**
 * MCP tools for semantic search across PDF embeddings and other indexed content.
 */

import type { RegisteredTool } from '.';
import { createSupabaseClient } from '../../utils/supabase';
import { searchPdfsSemantic } from '../../utils/embeddings';
import { jsonResult, textResult } from '.';

export const searchPdfsTool: RegisteredTool = {
  definition: {
    name: 'search_pdfs',
    description:
      'Semantic search over OEM PDF brochures and guidelines. Returns relevant text chunks with similarity scores.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query, e.g. "towing capacity" or "fuel economy"',
        },
        oem_id: {
          type: 'string',
          description: 'Optional OEM identifier to restrict results',
        },
        source_type: {
          type: 'string',
          description: 'Optional source type filter: "brochure" or "guidelines"',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default 10, max 50)',
        },
        threshold: {
          type: 'number',
          description: 'Minimum similarity threshold 0-1 (default 0.7)',
        },
      },
      required: ['query'],
    },
  },
  handler: async (args, ctx) => {
    const query = String(args.query || '').trim();
    const oemId = args.oem_id ? String(args.oem_id) : undefined;
    const sourceType = args.source_type ? String(args.source_type) : undefined;
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const threshold = Math.min(Math.max(Number(args.threshold) || 0.7, 0), 1);

    if (!query) {
      return textResult('query is required', true);
    }
    if (sourceType && sourceType !== 'brochure' && sourceType !== 'guidelines') {
      return textResult('source_type must be "brochure" or "guidelines"', true);
    }

    if (!ctx.env.GOOGLE_API_KEY) {
      return textResult('GOOGLE_API_KEY is not configured for PDF semantic search', true);
    }

    try {
      const results = await searchPdfsSemantic(query, {
        provider: 'gemini',
        apiKey: ctx.env.GOOGLE_API_KEY,
        model: 'text-embedding-004',
        supabaseUrl: ctx.env.SUPABASE_URL,
        supabaseKey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
      }, {
        matchCount: limit,
        matchThreshold: threshold,
        oemId,
        sourceType: sourceType as 'brochure' | 'guidelines' | undefined,
      });

      return jsonResult({
        query,
        oem_id: oemId,
        source_type: sourceType,
        count: results.length,
        results,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return textResult(`PDF search failed: ${message}`, true);
    }
  },
};

export const searchSpecsTool: RegisteredTool = {
  definition: {
    name: 'search_specs',
    description:
      'Search extracted vehicle specifications for a model. Returns matching spec entries from PDF-extracted specs or product specs_json.',
    inputSchema: {
      type: 'object',
      properties: {
        oem_id: {
          type: 'string',
          description: 'OEM identifier',
        },
        model_slug: {
          type: 'string',
          description: 'Model slug',
        },
        keys: {
          type: 'string',
          description: 'Comma-separated spec keys to filter, e.g. "towing_capacity,fuel_consumption"',
        },
        category: {
          type: 'string',
          description: 'Optional category filter, e.g. "Engine" or "Dimensions"',
        },
      },
      required: ['oem_id', 'model_slug'],
    },
  },
  handler: async (args, ctx) => {
    const oemId = String(args.oem_id || '');
    const modelSlug = String(args.model_slug || '');
    const keysParam = String(args.keys || '').trim();
    const category = String(args.category || '').trim();

    if (!oemId || !modelSlug) {
      return textResult('oem_id and model_slug are required', true);
    }

    const supabase = createSupabaseClient({
      url: ctx.env.SUPABASE_URL,
      serviceRoleKey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    const { data: model, error } = await supabase
      .from('vehicle_models')
      .select('id, name, extracted_specs')
      .eq('oem_id', oemId)
      .eq('slug', modelSlug)
      .maybeSingle();

    if (error) {
      return textResult(`Supabase error: ${error.message}`, true);
    }
    if (!model) {
      return textResult('Model not found', true);
    }

    const extractedSpecs = model.extracted_specs as { categories?: Array<{ name: string; specs: Array<{ key: string; value: string; unit?: string }> }> } | null;

    let categories = extractedSpecs?.categories ?? [];
    if (category) {
      categories = categories.filter((c) => c.name.toLowerCase() === category.toLowerCase());
    }
    if (keysParam) {
      const keys = keysParam.split(',').map((k) => k.trim()).filter(Boolean);
      categories = categories
        .map((c) => ({ ...c, specs: c.specs.filter((s) => keys.includes(s.key)) }))
        .filter((c) => c.specs.length > 0);
    }

    return jsonResult({
      oem_id: oemId,
      model_slug: modelSlug,
      model_name: model.name,
      categories,
    });
  },
};
