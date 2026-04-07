/**
 * Specs API Routes
 *
 * Provides HTTP endpoints for vehicle specification data extracted from OEM PDFs.
 *
 * Public:
 *   GET /vehicles/:oemId/:modelSlug/specs  — serve extracted_specs with filtering
 *
 * Admin (protected by Cloudflare Access):
 *   GET  /admin/pdf-catalog               — catalog of models + vectorisation status
 *   POST /admin/extract-specs             — trigger manual spec extraction
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { createSupabaseClient } from '../utils/supabase';
import { AiRouter } from '../ai/router';
import { executePdfSpecExtraction } from '../sync/pdf-spec-extractor';
import type { ExtractedSpecs, SpecCategory, SpecEntry } from '../sync/pdf-spec-extractor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PdfRow {
  model_id: string;
  oem_id: string;
  model_name: string;
  brochure_url: string;
  extracted_at: string | null;
  chunk_count: number;
  has_specs: boolean;
  spec_count: number;
}

interface CatalogStats {
  total_models: number;
  with_brochure: number;
  vectorized: number;
  specs_extracted: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenSpecs(categories: SpecCategory[]): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const cat of categories) {
    for (const entry of cat.specs) {
      flat[entry.key] = entry.unit ? `${entry.value} ${entry.unit}`.trim() : entry.value;
    }
  }
  return flat;
}

function filterCategories(
  categories: SpecCategory[],
  keys?: string[],
  category?: string,
): SpecCategory[] {
  let result = categories;

  if (category) {
    result = result.filter((c) => c.name.toLowerCase() === category.toLowerCase());
  }

  if (keys?.length) {
    result = result
      .map((c) => ({
        ...c,
        specs: c.specs.filter((s) => keys.includes(s.key)),
      }))
      .filter((c) => c.specs.length > 0);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const specsApi = new Hono<AppEnv>();

// ============================================================
// 1. GET /vehicles/:oemId/:modelSlug/specs  (public)
// ============================================================

specsApi.get('/vehicles/:oemId/:modelSlug/specs', async (c) => {
  const { oemId, modelSlug } = c.req.param();
  const keysParam = c.req.query('keys');
  const categoryParam = c.req.query('category');
  const format = c.req.query('format'); // 'flat' → key-value object

  const keys = keysParam ? keysParam.split(',').map((k) => k.trim()).filter(Boolean) : undefined;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // ── Look up the model ──────────────────────────────────────────────────────
  const { data: model, error: modelError } = await supabase
    .from('vehicle_models')
    .select('id, slug, oem_id, extracted_specs, brochure_url')
    .eq('oem_id', oemId)
    .eq('slug', modelSlug)
    .maybeSingle();

  if (modelError) {
    console.error('[specs-api] model lookup error:', modelError.message);
    return c.json({ error: 'Database error', details: modelError.message }, 500);
  }

  if (!model) {
    return c.json({ error: 'Model not found', has_brochure: false }, 404);
  }

  // ── extracted_specs path ───────────────────────────────────────────────────
  if (model.extracted_specs) {
    const specs = model.extracted_specs as ExtractedSpecs;
    const filtered = filterCategories(specs.categories, keys, categoryParam);

    if (format === 'flat') {
      return c.json({ data: flattenSpecs(filtered), _meta: { source: 'extracted_specs', model_id: model.id } });
    }

    return c.json({
      data: { ...specs, categories: filtered },
      _meta: { source: 'extracted_specs', model_id: model.id },
    });
  }

  // ── Fallback: products.specs_json ──────────────────────────────────────────
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, specs_json')
    .eq('oem_id', oemId)
    .not('specs_json', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (productError) {
    console.error('[specs-api] product lookup error:', productError.message);
    return c.json({ error: 'Database error', details: productError.message }, 500);
  }

  if (product?.specs_json) {
    return c.json({
      data: product.specs_json,
      _meta: { source: 'specs_json', product_id: product.id },
    });
  }

  // ── Nothing found ──────────────────────────────────────────────────────────
  return c.json(
    {
      error: 'No spec data available for this model',
      has_brochure: !!model.brochure_url,
    },
    404,
  );
});

// ============================================================
// 2. GET /admin/pdf-catalog  (admin)
// ============================================================

specsApi.get('/admin/pdf-catalog', async (c) => {
  const oemIdFilter = c.req.query('oem_id');

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // ── Fetch vehicle_models with brochure_url ─────────────────────────────────
  let modelsQuery = supabase
    .from('vehicle_models')
    .select('id, name, oem_id, brochure_url, extracted_specs_at, extracted_specs');

  if (oemIdFilter) {
    modelsQuery = modelsQuery.eq('oem_id', oemIdFilter);
  }

  const { data: allModels, error: allModelsError } = await supabase
    .from('vehicle_models')
    .select('id', { count: 'exact', head: true });

  const { data: models, error: modelsError } = await modelsQuery.not('brochure_url', 'is', null);

  if (modelsError) {
    console.error('[specs-api] pdf-catalog models error:', modelsError.message);
    return c.json({ error: 'Database error', details: modelsError.message }, 500);
  }

  if (!models) {
    return c.json({ stats: { total_models: 0, with_brochure: 0, vectorized: 0, specs_extracted: 0 }, pdfs: [] });
  }

  // ── Fetch chunk counts from pdf_embeddings ─────────────────────────────────
  const modelIds = models.map((m) => m.id);

  let chunkCounts: Record<string, number> = {};

  if (modelIds.length > 0) {
    const { data: chunks, error: chunksError } = await supabase
      .from('pdf_embeddings')
      .select('source_id')
      .in('source_id', modelIds);

    if (chunksError) {
      console.error('[specs-api] pdf_embeddings error:', chunksError.message);
      // Non-fatal: continue without chunk counts
    } else if (chunks) {
      for (const row of chunks) {
        chunkCounts[row.source_id] = (chunkCounts[row.source_id] ?? 0) + 1;
      }
    }
  }

  // ── Build response rows ────────────────────────────────────────────────────
  const pdfs: PdfRow[] = models.map((m) => {
    const specs = m.extracted_specs as ExtractedSpecs | null;
    const specCount = specs?.categories?.reduce((sum, cat) => sum + cat.specs.length, 0) ?? 0;
    return {
      model_id: m.id,
      oem_id: m.oem_id,
      model_name: m.name ?? m.id,
      brochure_url: m.brochure_url,
      extracted_at: m.extracted_specs_at ?? null,
      chunk_count: chunkCounts[m.id] ?? 0,
      has_specs: !!m.extracted_specs,
      spec_count: specCount,
    };
  });

  const stats: CatalogStats = {
    total_models: allModelsError ? models.length : (allModels as unknown as { count: number } | null)?.count ?? models.length,
    with_brochure: models.length,
    vectorized: pdfs.filter((p) => p.chunk_count > 0).length,
    specs_extracted: pdfs.filter((p) => p.has_specs).length,
  };

  return c.json({ stats, pdfs });
});

// ============================================================
// 3. POST /admin/extract-specs  (admin)
// ============================================================

specsApi.post('/admin/extract-specs', async (c) => {
  let body: { model_id?: string; oem_id?: string; force?: boolean } = {};

  try {
    body = await c.req.json();
  } catch {
    // empty body is fine — extract all
  }

  const { model_id, oem_id, force = false } = body;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const aiRouter = new AiRouter({
    groq: c.env.GROQ_API_KEY,
    together: c.env.TOGETHER_API_KEY,
    moonshot: c.env.MOONSHOT_API_KEY,
    anthropic: c.env.ANTHROPIC_API_KEY,
    google: c.env.GOOGLE_API_KEY,
  }, supabase);

  // Build modelIds list if filtering by model_id or oem_id
  let modelIds: string[] | undefined;

  if (model_id) {
    modelIds = [model_id];
  } else if (oem_id) {
    const { data: oemModels, error: oemError } = await supabase
      .from('vehicle_models')
      .select('id')
      .eq('oem_id', oem_id)
      .not('brochure_url', 'is', null);

    if (oemError) {
      console.error('[specs-api] oem model lookup error:', oemError.message);
      return c.json({ error: 'Database error', details: oemError.message }, 500);
    }

    modelIds = oemModels?.map((m) => m.id) ?? [];

    if (modelIds.length === 0) {
      return c.json({ error: 'No models with brochure_url found for this OEM', oem_id }, 404);
    }
  }

  // Cast required: pdf-spec-extractor uses a local structural AiRouter interface
  // that doesn't match the exported class's stricter AiTaskType constraint.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await executePdfSpecExtraction(supabase, aiRouter as any, { modelIds, force });

  return c.json(result);
});

// ============================================================
// 4. GET /admin/pdf-specs  (admin) — browse extracted specs
// ============================================================

specsApi.get('/admin/pdf-specs', async (c) => {
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const oemIdFilter = c.req.query('oem_id');

  let query = supabase
    .from('vehicle_models')
    .select('id, name, slug, oem_id, brochure_url, extracted_specs, extracted_specs_at')
    .not('extracted_specs', 'is', null);

  if (oemIdFilter) {
    query = query.eq('oem_id', oemIdFilter);
  }

  const { data: models, error } = await query.order('oem_id').order('name');

  if (error) {
    return c.json({ error: 'Database error', details: error.message }, 500);
  }

  const rows = (models ?? []).map((m) => {
    const specs = m.extracted_specs as ExtractedSpecs | null;
    const categories = specs?.categories ?? [];
    const specCount = categories.reduce((sum: number, cat: SpecCategory) => sum + cat.specs.length, 0);
    return {
      model_id: m.id,
      oem_id: m.oem_id,
      model_name: m.name ?? m.slug,
      slug: m.slug,
      brochure_url: m.brochure_url,
      extracted_at: m.extracted_specs_at,
      category_count: categories.length,
      spec_count: specCount,
      categories: categories.map((cat: SpecCategory) => ({
        name: cat.name,
        specs: cat.specs.map((s: SpecEntry) => ({
          key: s.key,
          label: s.label,
          value: s.value,
          unit: s.unit,
        })),
      })),
    };
  });

  return c.json({ total: rows.length, models: rows });
});

// ============================================================
// 5. POST /admin/upload-brochure/:modelId  (admin)
//    Upload or replace a brochure PDF for a vehicle model.
//    Stores in R2 and updates vehicle_models.brochure_url.
//    Also clears existing embeddings + extracted_specs so
//    the pipeline can re-process from the new PDF.
// ============================================================

specsApi.post('/admin/upload-brochure/:modelId', async (c) => {
  const modelId = c.req.param('modelId');

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Verify model exists
  const { data: model, error: modelError } = await supabase
    .from('vehicle_models')
    .select('id, oem_id, slug, name, brochure_url')
    .eq('id', modelId)
    .single();

  if (modelError || !model) {
    return c.json({ error: 'Model not found', model_id: modelId }, 404);
  }

  // Parse multipart form
  const formData = await c.req.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file uploaded. Send as multipart/form-data with field "file".' }, 400);
  }

  if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
    return c.json({ error: 'Only PDF files are accepted' }, 400);
  }

  if (file.size > 50 * 1024 * 1024) {
    return c.json({ error: 'File too large (max 50MB)' }, 400);
  }

  // Upload to R2
  const r2Key = `brochures/${model.oem_id}/${model.slug}/${file.name}`;
  const buffer = await file.arrayBuffer();

  await c.env.MOLTBOT_BUCKET.put(r2Key, buffer, {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: {
      model_id: modelId,
      oem_id: model.oem_id,
      original_name: file.name,
      uploaded_at: new Date().toISOString(),
    },
  });

  // Build public URL via media serving route
  const workerUrl = new URL(c.req.url).origin;
  const brochureUrl = `${workerUrl}/media/${r2Key}`;

  // Update model with new brochure_url and clear stale extraction data
  const { error: updateError } = await supabase
    .from('vehicle_models')
    .update({
      brochure_url: brochureUrl,
      extracted_specs: null,
      extracted_specs_at: null,
    })
    .eq('id', modelId);

  if (updateError) {
    return c.json({ error: 'Failed to update model', details: updateError.message }, 500);
  }

  // Clear old embeddings so re-vectorization picks this up
  await supabase
    .from('pdf_embeddings')
    .delete()
    .eq('source_id', modelId)
    .eq('source_type', 'brochure');

  return c.json({
    success: true,
    model_id: modelId,
    oem_id: model.oem_id,
    model_name: model.name,
    brochure_url: brochureUrl,
    r2_key: r2Key,
    file_size: file.size,
    replaced: !!model.brochure_url,
    message: model.brochure_url
      ? `Replaced brochure for ${model.name}. Old embeddings cleared — will re-vectorize on next sync.`
      : `Uploaded brochure for ${model.name}. Will vectorize on next sync.`,
  });
});
