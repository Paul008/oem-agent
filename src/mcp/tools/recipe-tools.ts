/**
 * MCP tools for browsing OEM design recipes.
 */

import type { RegisteredTool } from '.';
import { createSupabaseClient } from '../../utils/supabase';
import { normalizeRecipeRows } from '../../design/recipe-response';
import { jsonResult, textResult } from '.';

export const listOemRecipesTool: RegisteredTool = {
  definition: {
    name: 'list_oem_recipes',
    description:
      'List reusable design recipes for an OEM. Recipes are extracted UI patterns (hero, tabs, gallery, etc.) that can be composed into model pages.',
    inputSchema: {
      type: 'object',
      properties: {
        oem_id: {
          type: 'string',
          description: 'OEM identifier, e.g. "toyota-au"',
        },
        pattern: {
          type: 'string',
          description: 'Optional pattern/section type filter, e.g. "hero" or "tabs"',
        },
      },
      required: ['oem_id'],
    },
  },
  handler: async (args, ctx) => {
    const oemId = String(args.oem_id || '');
    const pattern = String(args.pattern || '').trim();

    if (!oemId) {
      return textResult('oem_id is required', true);
    }

    const supabase = createSupabaseClient({
      url: ctx.env.SUPABASE_URL,
      serviceRoleKey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    let brandQuery = supabase
      .from('brand_recipes')
      .select('id, oem_id, pattern, variant, label, resolves_to, defaults_json')
      .eq('oem_id', oemId)
      .eq('is_active', true);

    if (pattern) {
      brandQuery = brandQuery.ilike('pattern', `%${pattern}%`);
    }

    const [{ data: brandRecipes }, { data: defaultRecipes }] = await Promise.all([
      brandQuery.order('pattern'),
      supabase
        .from('default_recipes')
        .select('id, pattern, variant, label, resolves_to, defaults_json')
        .order('pattern'),
    ]);

    const recipes = normalizeRecipeRows({
      brandRecipes,
      defaultRecipes,
    });

    return jsonResult({
      oem_id: oemId,
      pattern: pattern || undefined,
      count: recipes.length,
      recipes,
    });
  },
};
