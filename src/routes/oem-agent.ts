/**
 * OEM Agent API Routes
 * 
 * Provides HTTP endpoints for:
 * - Triggering manual crawls
 * - Checking crawl status
 * - Triggering design captures
 * - Getting cost estimates
 * - Sales Rep agent interface
 */

import { Hono } from 'hono';
import type { MoltbotEnv, AccessUser } from '../types';
import { createSupabaseClient } from '../utils/supabase';
import { OemAgentOrchestrator } from '../orchestrator';
import { AiRouter } from '../ai/router';
import { SalesRepAgent } from '../ai/sales-rep';
import { MultiChannelNotifier } from '../notify/slack';
import { allOemIds, getOemDefinition } from '../oem/registry';
import type { OemId } from '../oem/types';

// Extend AppEnv for OEM agent routes
type OemAgentEnv = {
  Bindings: MoltbotEnv;
  Variables: {
    accessUser?: AccessUser;
    orchestrator?: OemAgentOrchestrator;
  };
};

const app = new Hono<OemAgentEnv>();

// ============================================================================
// Middleware
// ============================================================================

// Initialize orchestrator for each request
app.use('*', async (c, next) => {
  const orchestrator = createOrchestratorFromEnv(c.env);
  c.set('orchestrator', orchestrator);
  await next();
});

// Auth check for admin routes
app.use('/admin/*', async (c, next) => {
  // In production, check Cloudflare Access
  // For now, allow if accessUser is set by auth middleware
  const accessUser = c.get('accessUser');
  if (!accessUser && c.env.DEV_MODE !== 'true') {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// ============================================================================
// Public Routes
// ============================================================================

/**
 * GET /api/v1/oem-agent/health
 * Health check endpoint
 */
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/oem-agent/oems
 * List all configured OEMs
 */
app.get('/oems', (c) => {
  const oems = allOemIds.map(id => {
    const def = getOemDefinition(id);
    return {
      id,
      name: def?.name,
      baseUrl: def?.baseUrl,
      isActive: true,
    };
  });

  return c.json({ oems });
});

/**
 * GET /api/v1/oem-agent/oems/:oemId
 * Get details for a specific OEM
 */
app.get('/oems/:oemId', (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const def = getOemDefinition(oemId);

  if (!def) {
    return c.json({ error: 'OEM not found' }, 404);
  }

  return c.json({
    id: def.id,
    name: def.name,
    baseUrl: def.baseUrl,
    config: def.config,
    selectors: def.selectors,
    flags: def.flags,
  });
});

/**
 * GET /api/v1/oem-agent/oems/:oemId/products
 * Get current products for an OEM
 */
app.get('/oems/:oemId/products', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data, error } = await supabase
    .from('products')
    .select('id, title, subtitle, availability, price_amount, price_type, body_type, fuel_type, source_url, last_seen_at')
    .eq('oem_id', oemId)
    .eq('availability', 'available')
    .order('title');

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ products: data || [], count: data?.length || 0 });
});

/**
 * GET /api/v1/oem-agent/oems/:oemId/offers
 * Get current offers for an OEM
 */
app.get('/oems/:oemId/offers', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data, error } = await supabase
    .from('offers')
    .select('id, title, offer_type, price_amount, saving_amount, validity_raw, applicable_models, last_seen_at')
    .eq('oem_id', oemId)
    .or('validity_end.is.null,validity_end.gte.now()')
    .order('created_at', { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ offers: data || [], count: data?.length || 0 });
});

/**
 * GET /api/v1/oem-agent/oems/:oemId/changes
 * Get recent changes for an OEM
 */
app.get('/oems/:oemId/changes', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const days = parseInt(c.req.query('days') || '7');
  
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('change_events')
    .select('id, entity_type, event_type, severity, summary, created_at')
    .eq('oem_id', oemId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // Group by severity
  const bySeverity: Record<string, number> = {};
  data?.forEach((change: any) => {
    bySeverity[change.severity] = (bySeverity[change.severity] || 0) + 1;
  });

  return c.json({ 
    changes: data || [], 
    count: data?.length || 0,
    by_severity: bySeverity,
  });
});

// ============================================================================
// Admin Routes (require authentication)
// ============================================================================

/**
 * POST /api/v1/oem-agent/admin/crawl/:oemId
 * Trigger a manual crawl for an OEM
 */
app.post('/admin/crawl/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const orchestrator = c.get('orchestrator');

  if (!orchestrator) {
    return c.json({ error: 'Orchestrator not initialized' }, 500);
  }

  // Validate OEM
  const def = getOemDefinition(oemId);
  if (!def) {
    return c.json({ error: 'OEM not found' }, 404);
  }

  // Return immediately with job ID
  const jobId = crypto.randomUUID();

  // Trigger crawl in background using waitUntil
  // This keeps the worker alive until the crawl completes
  c.executionCtx.waitUntil(
    orchestrator.crawlOem(oemId).catch(err => {
      console.error(`[Crawl ${jobId}] Error crawling ${oemId}:`, err);
    })
  );

  return c.json({
    success: true,
    message: `Crawl triggered for ${def.name}`,
    jobId,
    oemId,
    status: 'running',
  });
});

/**
 * POST /api/v1/oem-agent/admin/crawl
 * Trigger a full crawl for all OEMs
 */
app.post('/admin/crawl', async (c) => {
  const orchestrator = c.get('orchestrator');

  if (!orchestrator) {
    return c.json({ error: 'Orchestrator not initialized' }, 500);
  }

  // Trigger crawl in background using waitUntil
  c.executionCtx.waitUntil(
    orchestrator.runScheduledCrawl().catch(err => {
      console.error('[Full Crawl] Error:', err);
    })
  );

  return c.json({
    success: true,
    message: 'Full crawl triggered for all OEMs',
    status: 'running',
  });
});

/**
 * POST /api/v1/oem-agent/admin/design-capture/:oemId
 * Trigger a design capture for an OEM
 */
app.post('/admin/design-capture/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const body = await c.req.json<{ pageType?: string }>().catch(() => ({ pageType: undefined }));
  const pageType = body.pageType || 'homepage';

  const orchestrator = c.get('orchestrator');

  if (!orchestrator) {
    return c.json({ error: 'Orchestrator not initialized' }, 500);
  }

  const result = await orchestrator.triggerDesignCapture(oemId, pageType);

  return c.json(result);
});

/**
 * GET /api/v1/oem-agent/admin/import-runs
 * List recent import runs
 */
app.get('/admin/import-runs', async (c) => {
  const oemId = c.req.query('oemId') as OemId | undefined;
  const limit = parseInt(c.req.query('limit') || '20');

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  let query = supabase
    .from('import_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (oemId) {
    query = query.eq('oem_id', oemId);
  }

  const { data, error } = await query;

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ importRuns: data || [] });
});

/**
 * GET /api/v1/oem-agent/admin/cost-estimates
 * Get cost estimates for all OEMs
 */
app.get('/admin/cost-estimates', (c) => {
  const orchestrator = c.get('orchestrator');
  const estimates = orchestrator?.getCostEstimates() || [];

  return c.json({ estimates });
});

/**
 * GET /api/v1/oem-agent/admin/source-pages/:oemId
 * View source pages for an OEM (for debugging)
 */
app.get('/admin/source-pages/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data, error } = await supabase
    .from('source_pages')
    .select('*')
    .eq('oem_id', oemId)
    .order('last_checked_at', { ascending: true, nullsFirst: true });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ sourcePages: data || [], count: data?.length || 0 });
});

/**
 * GET /api/v1/oem-agent/admin/discovered-apis/:oemId
 * View discovered APIs for an OEM
 */
app.get('/admin/discovered-apis/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data, error } = await supabase
    .from('discovered_apis')
    .select('*')
    .eq('oem_id', oemId)
    .order('reliability_score', { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ discoveredApis: data || [], count: data?.length || 0 });
});

/**
 * Fetch detailed vehicle data from Ford pricing page
 */
async function fetchFordVehicleDetails(vehicleCode: string, vehicleName: string): Promise<any> {
  try {
    // Try to fetch from the pricing endpoint
    const pricingUrl = `https://www.ford.com.au/content/ford/au/en_au/home/${vehicleCode.toLowerCase().replace(/_/g, '-')}/pricing.data`;
    
    const response = await fetch(pricingUrl, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-AU,en;q=0.9',
        'Referer': 'https://www.ford.com.au/',
        'Origin': 'https://www.ford.com.au',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    
    if (!response.ok) {
      console.log(`[Ford Detail] No pricing data for ${vehicleName}: ${response.status}`);
      return null;
    }
    
    const body = await response.text();
    const data = JSON.parse(body);
    
    // Extract color options, variants, pricing, and gallery images
    const details: any = {
      colors: [],
      variants: [],
      features: [],
      galleryImages: [],
      pricing: {},
    };
    
    // Look for color data in multiple possible locations
    const colorData = data.colors || data.colours || 
                      data.data?.colors || data.data?.colours ||
                      data.paintOptions || data.paintColours ||
                      data.exteriorColors || data.exteriorColours ||
                      data.colorSwatches || data.colourSwatches ||
                      data.vehicleColors || data.availableColors;
    
    if (Array.isArray(colorData)) {
      for (const color of colorData) {
        if (typeof color === 'string') {
          details.colors.push({ name: color, price: 0 });
          continue;
        }
        
        // Extract swatch image - Ford often uses these fields
        const swatchImage = color.swatchImage || color.swatch || color.thumbnail || 
                           color.image || color.colourImage || color.colorImage ||
                           color.previewImage || color.sampleImage ||
                           (color.images?.[0]) ||
                           (color.swatchImages?.[0]);
        
        const fullImage = color.fullImage || color.vehicleImage || color.renderImage ||
                         color.imageUrl || color.imageURL || color.photo ||
                         (color.images?.[1]) || swatchImage;
        
        details.colors.push({
          name: color.name || color.label || color.colourName || color.colorName || color.title,
          code: color.code || color.id || color.colourCode || color.colorCode || color.swatchCode,
          hex: color.hex || color.colourHex || color.colorHex || color.rgb || color.colourRgb,
          type: color.type || color.category || color.colourType || 
                (color.isPremium ? 'premium' : color.isMetallic ? 'metallic' : 'standard'),
          price: color.price || color.cost || color.colourPrice || color.optionPrice || 
                 color.priceAdjustment || color.additionalCost || 0,
          swatchImage: swatchImage,
          fullImage: fullImage,
          image: swatchImage || fullImage,
          fordColorCode: color.fordColourCode || color.fordColorCode,
          paintType: color.paintType || color.finish || color.colourFinish,
          isPremium: color.isPremium || color.premium || false,
          isMetallic: color.isMetallic || color.metallic || false,
        });
      }
    }
    
    // Look for gallery/images data
    const galleryData = data.gallery || data.images || data.imageGallery ||
                        data.vehicleImages || data.carImages ||
                        data.exteriorImages || data.interiorImages ||
                        data.mediaGallery || data.photoGallery ||
                        data.data?.gallery || data.data?.images;
    
    if (Array.isArray(galleryData)) {
      for (const img of galleryData) {
        if (typeof img === 'string') {
          details.galleryImages.push({ url: img, type: 'gallery' });
          continue;
        }
        
        const imageType = img.type || img.imageType || img.category || 'gallery';
        const isInterior = imageType.toLowerCase().includes('interior') ||
                          (img.tags && img.tags.some((t: string) => t.toLowerCase().includes('interior')));
        
        details.galleryImages.push({
          url: img.url || img.src || img.imageUrl || img.path,
          thumbnail: img.thumbnail || img.thumbUrl || img.preview,
          type: isInterior ? 'interior' : imageType,
          category: img.category || img.section,
          alt: img.alt || img.altText || img.description || img.caption,
          tags: img.tags || img.labels || [],
        });
      }
    }
    
    // Also check for separate interior images
    const interiorData = data.interiorImages || data.interiorGallery || data.cockpitImages;
    if (Array.isArray(interiorData)) {
      for (const img of interiorData) {
        const url = typeof img === 'string' ? img : (img.url || img.src);
        if (!details.galleryImages.some((i: any) => i.url === url)) {
          details.galleryImages.push({
            url: url,
            type: 'interior',
            category: typeof img === 'object' ? (img.category || img.view) : 'interior',
            alt: typeof img === 'object' ? (img.alt || img.description) : null,
          });
        }
      }
    }
    
    // Look for variant/trim data
    if (data.variants || data.trims || data.grades) {
      const variantData = data.variants || data.trims || data.grades || [];
      for (const variant of variantData) {
        details.variants.push({
          code: variant.code,
          name: variant.name || variant.label,
          description: variant.description,
          msrp: variant.msrp,
          driveAwayPrice: variant.driveAwayPrice,
          features: variant.features || [],
        });
      }
    }
    
    // Look for feature highlights
    if (data.features || data.highlights) {
      details.features = data.features || data.highlights || [];
    }
    
    // Look for pricing info
    if (data.pricing) {
      details.pricing = data.pricing;
    }
    
    return details;
  } catch (error) {
    console.error(`[Ford Detail] Error fetching ${vehicleName}:`, error);
    return null;
  }
}

/**
 * POST /api/v1/oem-agent/admin/direct-extract/:oemId
 * Directly extract from known APIs and save to database
 */
app.post('/admin/direct-extract/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  
  if (oemId !== 'ford-au') {
    return c.json({ error: 'Only ford-au supported for direct extract' }, 400);
  }
  
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  
  try {
    // Direct fetch Ford API
    const response = await fetch('https://www.ford.com.au/content/ford/au/en_au.vehiclesmenu.data', {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-AU,en;q=0.9',
        'Referer': 'https://www.ford.com.au/',
        'Origin': 'https://www.ford.com.au',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    
    if (!response.ok) {
      return c.json({ error: 'Ford API failed', status: response.status }, 500);
    }
    
    const body = await response.text();
    const data = JSON.parse(body);
    
    // Extract vehicles with detailed sub-variants
    const vehicles: any[] = [];
    let vehiclesWithDetails = 0;
    
    for (const category of data) {
      const catName = category.category || 'Unknown';
      for (const np of category.nameplates || []) {
        // Extract pricing information
        const pricing = np.pricing || {};
        const minPrice = pricing.min || {};
        const priceAmount = minPrice.priceVat || minPrice.price || null;
        
        // Parse price amount (remove $ and commas)
        let parsedPrice: number | null = null;
        if (priceAmount && typeof priceAmount === 'string') {
          const priceMatch = priceAmount.replace(/[$,]/g, '');
          parsedPrice = parseFloat(priceMatch) || null;
        }
        
        // Fetch detailed vehicle data (colors, variants, pricing)
        const vehicleCode = np.code || '';
        const vehicleName = np.name || '';
        const details = await fetchFordVehicleDetails(vehicleCode, vehicleName);
        if (details) {
          vehiclesWithDetails++;
        }
        
        // Merge API data with detailed data
        const colors = details?.colors || [];
        const variants = details?.variants || [];
        const features = details?.features || [];
        const galleryImages = details?.galleryImages || [];
        const detailedPricing = details?.pricing || {};
        
        // If no detailed variants, use basic models from API
        if (variants.length === 0) {
          for (const model of np.models || []) {
            variants.push({
              code: model.code,
              name: model.name,
              description: model.description,
              bodyStyle: model.bodyStyle,
              engine: model.engine,
              transmission: model.transmission,
              drivetrain: model.drivetrain,
              fuelType: model.fuelType,
              pricing: {
                msrp: model.msrp,
                driveAwayPrice: model.driveAwayPrice,
                priceFrom: model.priceFrom,
              },
            });
          }
        }
        
        // Extract basic features from attributeItemModels if no detailed features
        if (features.length === 0) {
          for (const attr of np.attributeItemModels || []) {
            if (attr.attributeId && attr.attributeId.trim()) {
              features.push(attr.attributeId);
            }
          }
        }
        
        // Build comprehensive meta_json with all sub-variant data
        const metaJson: Record<string, any> = {
          category: catName,
          code: np.code,
          vehicleType: np.vehicleType,
          bodyType: np.bodyType,
          group: np.group,
          // Image information
          image: np.image,
          imgUrlHeader: np.imgUrlHeader,
          imgAltText: np.imgAltText,
          // Color information
          colors: colors,
          colorCount: colors.length,
          // Gallery images (exterior, interior, detail shots)
          galleryImages: galleryImages,
          galleryImageCount: galleryImages.length,
          interiorImages: galleryImages.filter((img: any) => img.type === 'interior'),
          exteriorImages: galleryImages.filter((img: any) => img.type === 'exterior'),
          // CTA information
          additionalCTA: np.additionalCTA,
          additionalLabel: np.additionalLabel,
          exploreLabel: np.exploreLabel,
          // Pricing details
          pricing: {
            min: minPrice,
            parsedAmount: parsedPrice,
            rawString: priceAmount,
            detailed: detailedPricing,
          },
          // Sub-variants/models
          variants: variants,
          variantCount: variants.length,
          // Features
          features: features,
          featureCount: features.length,
          // Additional categories (e.g., color options, trim levels)
          additionalCategories: np.additionalCategories || [],
        };
        
        vehicles.push({
          oem_id: oemId,
          source_url: 'https://www.ford.com.au/',
          title: np.name,
          subtitle: null,
          body_type: catName,
          fuel_type: null,
          availability: 'available',
          price_amount: parsedPrice,
          price_currency: 'AUD',
          price_type: parsedPrice ? 'driveaway' : null,
          price_raw_string: priceAmount,
          disclaimer_text: np.blurbMessage || null,
          key_features: features,
          variants: variants,
          cta_links: np.additionalCTA ? [{ label: np.additionalLabel || 'Build & Price', url: np.additionalCTA }] : [],
          meta_json: metaJson,
          last_seen_at: new Date().toISOString(),
        });
      }
    }
    
    // Insert vehicles (workaround for missing unique constraint)
    let inserted = 0;
    let errors = 0;
    let skipped = 0;
    
    const errorDetails: string[] = [];
    
    // Get existing products first
    const { data: existingProducts } = await supabase
      .from('products')
      .select('title')
      .eq('oem_id', oemId);
    
    const existingTitles = new Set((existingProducts || []).map(p => p.title));
    console.log(`[Direct Extract] Existing products: ${existingTitles.size}`);
    
    for (const vehicle of vehicles) {
      // Skip duplicates in this batch
      if (existingTitles.has(vehicle.title)) {
        skipped++;
        continue;
      }
      
      const { error } = await supabase
        .from('products')
        .insert(vehicle);
      
      if (error) {
        console.error(`[Direct Extract] Error inserting ${vehicle.title}:`, error);
        errors++;
        if (errorDetails.length < 5) {
          errorDetails.push(`${vehicle.title}: ${error.message}`);
        }
      } else {
        inserted++;
        existingTitles.add(vehicle.title); // Mark as existing
      }
    }
    
    // Calculate totals
    const totalVariants = vehicles.reduce((sum, v) => sum + (v.variants?.length || 0), 0);
    const totalFeatures = vehicles.reduce((sum, v) => sum + (v.key_features?.length || 0), 0);
    const totalColors = vehicles.reduce((sum, v) => sum + (v.meta_json?.colors?.length || 0), 0);
    const vehiclesWithPricing = vehicles.filter(v => v.price_amount && v.price_amount > 0).length;
    
    return c.json({
      success: true,
      extracted: vehicles.length,
      inserted,
      skipped,
      errors,
      errorDetails,
      summary: {
        totalVehicles: vehicles.length,
        totalVariants,
        totalFeatures,
        totalColors,
        vehiclesWithPricing,
        vehiclesWithDetails,
      },
      vehicles: vehicles.map(v => ({
        title: v.title,
        price: v.price_amount,
        variantCount: v.variants?.length || 0,
        featureCount: v.key_features?.length || 0,
        colorCount: v.meta_json?.colors?.length || 0,
        variants: v.variants?.map((m: any) => m.name) || [],
        colors: v.meta_json?.colors?.map((c: any) => c.name) || [],
      })),
    });
  } catch (error) {
    console.error('[Direct Extract] Error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/v1/oem-agent/admin/force-crawl/:oemId
 * Force crawl all pages for an OEM (bypasses scheduler check)
 */
app.post('/admin/force-crawl/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Reset last_checked_at for all active pages to force them due
  console.log(`[Force Crawl] Resetting pages for ${oemId}...`);
  const { data: resetData, error: resetError } = await supabase
    .from('source_pages')
    .update({
      last_checked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('oem_id', oemId)
    .eq('status', 'active')
    .select();

  if (resetError) {
    console.error(`[Force Crawl] Reset failed:`, resetError);
    return c.json({ error: resetError.message }, 500);
  }
  
  console.log(`[Force Crawl] Reset ${resetData?.length || 0} pages for ${oemId}`);

  // Now trigger the crawl
  const orchestrator = c.get('orchestrator');
  if (!orchestrator) {
    return c.json({ error: 'Orchestrator not initialized' }, 500);
  }

  const jobId = crypto.randomUUID();

  c.executionCtx.waitUntil(
    orchestrator.crawlOem(oemId).catch(err => {
      console.error(`[Force Crawl ${jobId}] Error crawling ${oemId}:`, err);
    })
  );

  return c.json({
    success: true,
    message: `Force crawl triggered for ${oemId} - all pages reset to due`,
    jobId,
    oemId,
    status: 'running',
  });
});

/**
 * POST /api/v1/oem-agent/admin/test-crawl
 * Test network capture for a specific URL (debug endpoint)
 */
app.post('/admin/test-crawl', async (c) => {
  const body = await c.req.json<{ url: string }>().catch(() => ({ url: '' }));
  const url = body.url;

  if (!url) {
    return c.json({ error: 'url is required' }, 400);
  }

  console.log(`[Test Crawl] Starting test crawl for ${url}`);

  const networkRequests: any[] = [];
  const networkResponses: any[] = [];

  try {
    // Dynamic import puppeteer
    const puppeteerModule = await import('@cloudflare/puppeteer');
    const puppeteer = puppeteerModule.default;
    const browser = await puppeteer.launch(c.env.BROWSER as any);
    console.log(`[Test Crawl] Browser launched`);

    try {
      const page = await browser.newPage();

      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
      );

      // Set realistic headers to bypass bot detection
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      });

      // Emulate navigator properties to avoid detection
      await page.evaluateOnNewDocument(() => {
        // Override webdriver property
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });

        // Override plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });

        // Override languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-AU', 'en'],
        });

        // Add chrome property
        (window as any).chrome = { runtime: {} };
      });

      // Enable request interception
      let interceptionEnabled = false;
      try {
        await page.setRequestInterception(true);
        interceptionEnabled = true;
        console.log(`[Test Crawl] Request interception enabled`);
      } catch (err) {
        console.log(`[Test Crawl] Request interception failed: ${err}`);
      }

      // Capture ALL requests
      if (interceptionEnabled) {
        page.on('request', (request) => {
          const reqUrl = request.url();
          const method = request.method();
          const resourceType = request.resourceType();

          networkRequests.push({
            url: reqUrl,
            method,
            resourceType,
          });

          console.log(`[Test Crawl] REQ: ${method} ${resourceType} ${reqUrl.substring(0, 100)}`);
          request.continue();
        });
      }

      // Capture ALL responses
      page.on('response', async (response) => {
        const respUrl = response.url();
        const status = response.status();
        const contentType = response.headers()['content-type'] || '';
        const resourceType = response.request().resourceType();

        const respData: any = {
          url: respUrl,
          status,
          contentType,
          resourceType,
        };

        // Try to capture JSON bodies
        if (contentType.includes('json')) {
          try {
            const body = await response.text();
            respData.bodyLength = body?.length || 0;
            respData.bodyPreview = body?.substring(0, 200);
          } catch (e) {
            respData.bodyError = String(e);
          }
        }

        networkResponses.push(respData);
        console.log(`[Test Crawl] RESP: ${status} ${resourceType} ${contentType} ${respUrl.substring(0, 100)}`);
      });

      // Navigate
      console.log(`[Test Crawl] Navigating to ${url}...`);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      console.log(`[Test Crawl] Navigation complete`);

      // Wait a bit more
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try scrolling
      try {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        console.log(`[Test Crawl] Scroll error: ${e}`);
      }

      const htmlContent = await page.content();
      const htmlLength = htmlContent.length;
      console.log(`[Test Crawl] Page content: ${htmlLength} chars, Requests: ${networkRequests.length}, Responses: ${networkResponses.length}`);

      // Get page title
      const title = await page.title().catch(() => '');

      // Filter for API-like responses
      const apiResponses = networkResponses.filter((r) =>
        r.contentType?.includes('json') ||
        r.url?.includes('/api/') ||
        r.url?.includes('.data') ||
        r.url?.includes('/content/')
      );

      return c.json({
        success: true,
        url,
        htmlLength,
        htmlPreview: htmlContent.substring(0, 1000), // First 1000 chars of HTML
        title,
        totalRequests: networkRequests.length,
        totalResponses: networkResponses.length,
        interceptionEnabled,
        apiResponses: apiResponses.slice(0, 20), // Limit to first 20
        allRequests: networkRequests.slice(0, 50), // Limit to first 50
      });
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error(`[Test Crawl] Error:`, err);
    return c.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      networkRequests: networkRequests.slice(0, 20),
      networkResponses: networkResponses.slice(0, 20),
    }, 500);
  }
});

/**
 * GET /api/v1/oem-agent/admin/test-ford-api
 * Direct test of Ford API from worker
 */
app.get('/admin/test-ford-api', async (c) => {
  try {
    console.log('[Test Ford API] Starting direct fetch');
    
    const response = await fetch('https://www.ford.com.au/content/ford/au/en_au.vehiclesmenu.data', {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-AU,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.ford.com.au/',
        'Origin': 'https://www.ford.com.au',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    
    console.log(`[Test Ford API] Response status: ${response.status}`);
    
    if (!response.ok) {
      return c.json({ 
        error: 'Ford API request failed', 
        status: response.status,
        statusText: response.statusText 
      }, 500);
    }
    
    const body = await response.text();
    console.log(`[Test Ford API] Body length: ${body.length}`);
    
    let data;
    try {
      data = JSON.parse(body);
    } catch (e) {
      return c.json({ 
        error: 'Failed to parse JSON', 
        bodyPreview: body.substring(0, 500) 
      }, 500);
    }
    
    // Count vehicles
    let totalVehicles = 0;
    const categories: Record<string, number> = {};
    
    if (Array.isArray(data)) {
      for (const cat of data) {
        const catName = cat.category || 'Unknown';
        const count = cat.nameplates?.length || 0;
        categories[catName] = count;
        totalVehicles += count;
      }
    }
    
    return c.json({
      success: true,
      bodyLength: body.length,
      totalVehicles,
      categories,
      sample: data?.[0]?.nameplates?.[0] || null,
    });
  } catch (error) {
    console.error('[Test Ford API] Error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});

/**
 * POST /api/v1/oem-agent/admin/debug-crawl/:oemId
 * Debug crawl a single page using orchestrator logic and return full results
 */
app.post('/admin/debug-crawl/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const body = await c.req.json<{ url?: string }>().catch(() => ({ url: undefined }));

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Get source pages for this OEM
  const { data: pages, error: pagesError } = await supabase
    .from('source_pages')
    .select('*')
    .eq('oem_id', oemId)
    .eq('status', 'active')
    .limit(1);

  if (pagesError) {
    return c.json({ error: pagesError.message }, 500);
  }

  const page = body.url
    ? { id: 'debug', oem_id: oemId, url: body.url, page_type: 'homepage', status: 'active' }
    : pages?.[0];

  if (!page) {
    return c.json({ error: 'No source pages found' }, 404);
  }

  // Use orchestrator to crawl
  const orchestrator = c.get('orchestrator');
  if (!orchestrator) {
    return c.json({ error: 'Orchestrator not initialized' }, 500);
  }

  try {
    const result = await orchestrator.crawlPage(oemId, page as any);

    // Also check what's in discovered_apis and products now
    const { data: apis } = await supabase
      .from('discovered_apis')
      .select('*')
      .eq('oem_id', oemId);

    // Check if products were saved
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, title, source_url')
      .eq('oem_id', oemId)
      .limit(5);

    // Test direct insert to verify database connection
    let testInsertResult = null;
    try {
      const testProduct = {
        id: crypto.randomUUID(),
        oem_id: oemId,
        source_url: 'https://test.example.com/' + Date.now(),
        title: 'Test Product ' + Date.now(),
        availability: 'available',
        price_currency: 'AUD',
        key_features: [],
        variants: [],
        cta_links: [],
        meta_json: {},
        last_seen_at: new Date().toISOString(),
        // Note: created_at is auto-set by the database
      };
      const { error: insertError } = await supabase.from('products').insert(testProduct);
      testInsertResult = insertError ? { error: insertError.message } : { success: true, productId: testProduct.id };
      // Clean up test product
      if (!insertError) {
        await supabase.from('products').delete().eq('id', testProduct.id);
      }
    } catch (e: any) {
      testInsertResult = { exception: e.message };
    }

    return c.json({
      crawlResult: {
        success: result.success,
        url: result.url,
        wasRendered: result.wasRendered,
        smartMode: result.smartMode,
        discoveredApisCount: result.discoveredApis?.length || 0,
        discoveredApis: result.discoveredApis?.slice(0, 10) || [],
        durationMs: result.durationMs,
        error: result.error,
        // Include extraction results for debugging
        extractionResult: result.extractionResult ? {
          productsCount: result.extractionResult.products?.data?.length || 0,
          offersCount: result.extractionResult.offers?.data?.length || 0,
          bannersCount: result.extractionResult.bannerSlides?.data?.length || 0,
          productsMethod: result.extractionResult.products?.method,
          productsConfidence: result.extractionResult.products?.confidence,
          sampleProducts: result.extractionResult.products?.data?.slice(0, 3)?.map((p: any) => ({
            title: p.title,
            body_type: p.body_type,
            source_url: p.source_url,
          })) || [],
        } : null,
        // Page info for debugging
        pageUsed: { id: page.id, url: page.url, page_type: page.page_type },
        // Ford API debug info
        fordApiDebug: (result.extractionResult as any)?.fordApiDebug || null,
      },
      storedApis: apis || [],
      storedApisCount: apis?.length || 0,
      // Products in database after crawl
      productsInDb: products || [],
      productsInDbCount: products?.length || 0,
      productsDbError: productsError?.message || null,
      // Test insert result
      testInsertResult,
    });
  } catch (err) {
    return c.json({
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }, 500);
  }
});

/**
 * GET /api/v1/oem-agent/admin/ai-usage
 * Get AI inference usage statistics
 */
app.get('/admin/ai-usage', async (c) => {
  const days = parseInt(c.req.query('days') || '30');
  
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('ai_inference_log')
    .select('provider, model, task_type, prompt_tokens, completion_tokens, cost_usd, status')
    .gte('request_timestamp', since.toISOString());

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // Aggregate by provider
  const byProvider: Record<string, { calls: number; cost: number; tokens: number }> = {};
  const byTask: Record<string, { calls: number; cost: number }> = {};

  data?.forEach((row: any) => {
    const provider = row.provider;
    if (!byProvider[provider]) {
      byProvider[provider] = { calls: 0, cost: 0, tokens: 0 };
    }
    byProvider[provider].calls++;
    byProvider[provider].cost += row.cost_usd || 0;
    byProvider[provider].tokens += row.prompt_tokens + row.completion_tokens || 0;

    const task = row.task_type;
    if (!byTask[task]) {
      byTask[task] = { calls: 0, cost: 0 };
    }
    byTask[task].calls++;
    byTask[task].cost += row.cost_usd || 0;
  });

  return c.json({
    period: `${days} days`,
    totalCalls: data?.length || 0,
    totalCost: data?.reduce((sum: number, row: any) => sum + (row.cost_usd || 0), 0) || 0,
    byProvider,
    byTask,
  });
});

/**
 * GET /api/v1/oem-agent/admin/products/:oemId
 * View products for an OEM
 */
app.get('/admin/products/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', oemId)
    .order('updated_at', { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ products: data || [], count: data?.length || 0 });
});

/**
 * GET /api/v1/oem-agent/admin/offers/:oemId
 * View offers for an OEM
 */
app.get('/admin/offers/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('oem_id', oemId)
    .order('updated_at', { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ offers: data || [], count: data?.length || 0 });
});

// ============================================================================
// Sales Rep Agent Routes
// ============================================================================

/**
 * POST /api/v1/oem-agent/sales-rep/chat
 * Chat with the Sales Rep agent
 */
app.post('/sales-rep/chat', async (c) => {
  const body = await c.req.json<{ oemId: OemId; message: string }>();
  
  if (!body.oemId || !body.message) {
    return c.json({ error: 'oemId and message are required' }, 400);
  }

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const salesRep = new SalesRepAgent(supabase);

  // Simple command parsing
  const message = body.message.toLowerCase();
  
  if (message.includes('product') || message.includes('vehicle')) {
    const result = await salesRep.getCurrentProducts({ oem_id: body.oemId });
    return c.json(result);
  }

  if (message.includes('offer') || message.includes('deal')) {
    const result = await salesRep.getCurrentOffers({ oem_id: body.oemId });
    return c.json(result);
  }

  if (message.includes('change') || message.includes('update')) {
    const result = await salesRep.getRecentChanges({ oem_id: body.oemId, days: 7 });
    return c.json(result);
  }

  // Default: return available commands
  return c.json({
    response: 'I can help you with: products, offers, recent changes, or generating content. What would you like to know?',
    availableCommands: [
      'products - List current vehicles',
      'offers - Show active promotions',
      'changes - Recent updates',
      'social post - Generate social media content',
      'email - Generate email copy',
    ],
  });
});

/**
 * POST /api/v1/oem-agent/sales-rep/generate
 * Generate content (social post or email)
 */
app.post('/sales-rep/generate', async (c) => {
  const body = await c.req.json<{
    oemId: OemId;
    type: 'social' | 'email';
    platform?: 'facebook' | 'instagram' | 'linkedin' | 'twitter';
    campaignType?: 'new_model' | 'offer' | 'event' | 'clearance';
    topic?: string;
  }>();

  if (!body.oemId || !body.type) {
    return c.json({ error: 'oemId and type are required' }, 400);
  }

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const salesRep = new SalesRepAgent(supabase);

  if (body.type === 'social') {
    const result = await salesRep.draftSocialPost({
      oem_id: body.oemId,
      platform: body.platform || 'facebook',
      topic: body.topic || 'latest offers',
    });
    return c.json(result);
  }

  if (body.type === 'email') {
    const result = await salesRep.draftEdmCopy({
      oem_id: body.oemId,
      campaign_type: body.campaignType || 'offer',
    });
    return c.json(result);
  }

  return c.json({ error: 'Invalid type. Use "social" or "email"' }, 400);
});

/**
 * POST /api/v1/oem-agent/admin/enrich-ford/:oemId
 * Enrich Ford products with variants, colors, and gallery using browser capture.
 * Uses headless browser to intercept pricing API responses.
 */
app.post('/admin/enrich-ford/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  
  if (oemId !== 'ford-au') {
    return c.json({ error: 'This endpoint only supports ford-au' }, 400);
  }

  const body = await c.req.json<{ maxVehicles?: number }>().catch(() => ({ maxVehicles: 5 }));
  const maxVehicles = body.maxVehicles || 5;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Get existing Ford products
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', oemId)
    .order('title');

  if (productsError) {
    return c.json({ error: 'Failed to fetch products', details: productsError.message }, 500);
  }

  if (!products || products.length === 0) {
    return c.json({ error: 'No Ford products found in database' }, 404);
  }

  console.log(`[Enrich Ford] Starting enrichment for ${products.length} products, max ${maxVehicles} to process`);

  // Create orchestrator and run enrichment
  const orchestrator = createOrchestratorFromEnv(c.env);
  
  try {
    const { enriched, captureResults } = await orchestrator.enrichFordProductsWithBrowserCapture(
      products.slice(0, maxVehicles)
    );

    // Count variants created
    const baseCount = products.filter(p => 
      enriched.some(e => e.id === p.id)
    ).length;
    const variantCount = enriched.length - baseCount;

    return c.json({
      success: true,
      summary: {
        baseProducts: baseCount,
        variantProducts: variantCount,
        totalProducts: enriched.length,
        vehiclesProcessed: captureResults.length,
        successfulCaptures: captureResults.filter(r => r.success).length,
      },
      captureResults,
      enrichedProducts: enriched.map(p => ({
        title: p.title,
        external_key: p.external_key,
        isVariant: !!p.parent_nameplate,
        parent: p.parent_nameplate,
        variants: p.variants?.length || 0,
        colors: p.meta?.colorCount || 0,
        images: p.meta?.galleryImageCount || 0,
      })),
    });
  } catch (error: any) {
    console.error('[Enrich Ford] Error:', error);
    return c.json({
      error: 'Enrichment failed',
      details: error?.message || 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/v1/oem-agent/admin/capture-ford-pricing
 * Capture Ford pricing API for a specific vehicle using browser.
 */
app.post('/admin/capture-ford-pricing', async (c) => {
  const body = await c.req.json<{
    vehicleCode: string;
    vehicleName: string;
  }>();

  if (!body.vehicleCode || !body.vehicleName) {
    return c.json({ error: 'vehicleCode and vehicleName are required' }, 400);
  }

  const orchestrator = createOrchestratorFromEnv(c.env);

  try {
    const result = await orchestrator['captureFordPricingApiWithBrowser'](
      body.vehicleCode,
      body.vehicleName
    );

    if (!result) {
      return c.json({
        success: false,
        message: 'No pricing data captured',
      });
    }

    // Extract data using existing methods
    const variants = orchestrator['extractVariantsFromPricingData'](result.data, body.vehicleName);
    const colors = orchestrator['extractColorsFromPricingData'](result.data);
    const galleryImages = orchestrator['extractGalleryImagesFromPricingData'](result.data);

    return c.json({
      success: true,
      source: result.source,
      extracted: {
        variants: variants.length,
        colors: colors.length,
        galleryImages: galleryImages.length,
      },
      variants: variants.slice(0, 10), // Limit response size
      colors: colors.slice(0, 10),
      galleryImages: galleryImages.slice(0, 5),
      rawDataKeys: Object.keys(result.data),
    });
  } catch (error: any) {
    console.error('[Capture Ford Pricing] Error:', error);
    return c.json({
      error: 'Capture failed',
      details: error?.message || 'Unknown error',
    }, 500);
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function createOrchestratorFromEnv(env: MoltbotEnv): OemAgentOrchestrator {
  const supabaseClient = createSupabaseClient({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const aiRouter = new AiRouter({
    groq: env.GROQ_API_KEY,
    together: env.TOGETHER_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
  });

  const notifier = env.SLACK_WEBHOOK_URL
    ? new MultiChannelNotifier({ slackWebhookUrl: env.SLACK_WEBHOOK_URL })
    : new MultiChannelNotifier({ slackWebhookUrl: '' });

  return new OemAgentOrchestrator({
    supabaseClient,
    r2Bucket: env.MOLTBOT_BUCKET,
    browser: env.BROWSER!,
    aiRouter,
    notifier,
  });
}

export default app;
