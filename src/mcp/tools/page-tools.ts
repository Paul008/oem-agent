/**
 * MCP tools for model page generation and management.
 */

import type { RegisteredTool } from '.';
import { createSupabaseClient } from '../../utils/supabase';
import { AiRouter } from '../../ai/router';
import { DesignAgent } from '../../design/agent';
import { allOemIds } from '../../oem/registry';
import type { OemId } from '../../oem/types';
import { jsonResult, textResult } from '.';

function isValidOemId(value: string): value is OemId {
  return allOemIds.includes(value as OemId);
}

export const generateModelPageTool: RegisteredTool = {
  definition: {
    name: 'generate_model_page',
    description:
      'Generate an AI-powered model page for a specific OEM vehicle. The page is stored in R2 and can be previewed via the production HTML endpoint.',
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
      },
      required: ['oem_id', 'model_slug'],
    },
  },
  handler: async (args, ctx) => {
    const oemId = String(args.oem_id || '') as OemId;
    const modelSlug = String(args.model_slug || '');

    if (!oemId || !isValidOemId(oemId)) {
      return textResult(`Invalid or missing oem_id`, true);
    }
    if (!modelSlug) {
      return textResult('model_slug is required', true);
    }

    const supabase = createSupabaseClient({
      url: ctx.env.SUPABASE_URL,
      serviceRoleKey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    const aiRouter = new AiRouter(
      {
        groq: ctx.env.GROQ_API_KEY,
        together: ctx.env.TOGETHER_API_KEY,
        moonshot: ctx.env.MOONSHOT_API_KEY,
        anthropic: ctx.env.ANTHROPIC_API_KEY,
        google: ctx.env.GOOGLE_API_KEY,
      },
      supabase,
    );

    const designAgent = new DesignAgent(ctx.env.TOGETHER_API_KEY, ctx.env.MOLTBOT_BUCKET);

    const { PageGenerator } = await import('../../design/page-generator');
    const generator = new PageGenerator({
      supabase,
      aiRouter,
      designAgent,
      r2Bucket: ctx.env.MOLTBOT_BUCKET,
      browser: ctx.env.BROWSER!,
    });

    const workerBaseUrl = ctx.env.WORKER_URL || `https://mcp.oem-agent.workers.dev`;
    const result = await generator.generateModelPage(oemId, modelSlug, workerBaseUrl);

    return jsonResult({
      ...result,
      oem_id: oemId,
      model_slug: modelSlug,
      preview_url: result.success
        ? `/api/v1/oem-agent/pages/${oemId}-${modelSlug}/production-html`
        : undefined,
    });
  },
};

export const createModelSubpageTool: RegisteredTool = {
  definition: {
    name: 'create_model_subpage',
    description:
      'Create a subpage under an existing model page (e.g., specs, design, performance, safety, gallery).',
    inputSchema: {
      type: 'object',
      properties: {
        oem_id: {
          type: 'string',
          description: 'OEM identifier',
        },
        model_slug: {
          type: 'string',
          description: 'Parent model slug',
        },
        subpage_slug: {
          type: 'string',
          description: 'Subpage slug (lowercase alphanumeric with hyphens)',
        },
        name: {
          type: 'string',
          description: 'Human-readable subpage name',
        },
        subpage_type: {
          type: 'string',
          description: 'One of: specs, design, performance, safety, gallery, pricing, lifestyle, accessories, colours, custom',
        },
      },
      required: ['oem_id', 'model_slug', 'subpage_slug', 'name'],
    },
  },
  handler: async (args, ctx) => {
    const oemId = String(args.oem_id || '');
    const modelSlug = String(args.model_slug || '');
    const subpageSlug = String(args.subpage_slug || '');
    const name = String(args.name || '').trim().replace(/[<>]/g, '').substring(0, 100);
    const subpageType = String(args.subpage_type || 'custom');

    if (!oemId || !modelSlug || !subpageSlug || !name) {
      return textResult('oem_id, model_slug, subpage_slug, and name are required', true);
    }

    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(subpageSlug) && !/^[a-z0-9]$/.test(subpageSlug)) {
      return textResult('subpage_slug must be lowercase alphanumeric with hyphens', true);
    }

    const bucket = ctx.env.MOLTBOT_BUCKET;
    const parentKey = `pages/definitions/${oemId}/${modelSlug}/latest.json`;
    const parentExists = await bucket.head(parentKey);
    if (!parentExists) {
      return textResult('Parent model page not found. Generate it first with generate_model_page.', true);
    }

    const compositeSlug = `${modelSlug}--${subpageSlug}`;
    const key = `pages/definitions/${oemId}/${compositeSlug}/latest.json`;

    const existing = await bucket.head(key);
    if (existing) {
      return textResult(`Subpage ${compositeSlug} already exists`, true);
    }

    const page = {
      id: crypto.randomUUID(),
      slug: compositeSlug,
      name,
      oem_id: oemId,
      header: { slides: [] },
      content: { rendered: '', sections: [] },
      form: false,
      variant_link: '',
      generated_at: new Date().toISOString(),
      source_url: '',
      version: 1,
      page_type: 'subpage' as const,
      parent_slug: modelSlug,
      subpage_type: subpageType,
      subpage_name: name,
    };

    await bucket.put(key, JSON.stringify(page), {
      httpMetadata: { contentType: 'application/json' },
    });

    return jsonResult({
      success: true,
      slug: compositeSlug,
      oem_id: oemId,
      parent_slug: modelSlug,
      subpage_type: subpageType,
      page,
    });
  },
};

export const getPageStatusTool: RegisteredTool = {
  definition: {
    name: 'get_page_status',
    description:
      'Check whether an AI-generated model page exists and return its metadata (version, mode, URLs).',
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
      },
      required: ['oem_id', 'model_slug'],
    },
  },
  handler: async (args, ctx) => {
    const oemId = String(args.oem_id || '');
    const modelSlug = String(args.model_slug || '');

    if (!oemId || !modelSlug) {
      return textResult('oem_id and model_slug are required', true);
    }

    const bucket = ctx.env.MOLTBOT_BUCKET;
    const key = `pages/definitions/${oemId}/${modelSlug}/latest.json`;
    const obj = await bucket.head(key);

    if (!obj) {
      return jsonResult({
        exists: false,
        oem_id: oemId,
        model_slug: modelSlug,
      });
    }

    const fullObj = await bucket.get(key);
    const page = fullObj ? await fullObj.json<{ active_mode?: string; version?: number; generated_at?: string }>() : {};

    return jsonResult({
      exists: true,
      oem_id: oemId,
      model_slug: modelSlug,
      active_mode: page.active_mode ?? null,
      version: page.version ?? null,
      generated_at: page.generated_at ?? null,
      production_html_url: `/api/v1/oem-agent/pages/${oemId}-${modelSlug}/production-html`,
      production_manifest_url: `/api/v1/oem-agent/pages/${oemId}-${modelSlug}/production-manifest`,
    });
  },
};
