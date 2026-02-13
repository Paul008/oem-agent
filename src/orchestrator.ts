/**
 * Main Orchestrator
 * 
 * Coordinates the entire Multi-OEM AI Agent pipeline:
 * 1. Scheduling — decides what to crawl and when
 * 2. Crawling — fetches pages (cheap check or browser render)
 * 3. Extraction — extracts structured data
 * 4. AI Routing — uses LLM fallback when needed
 * 5. Change Detection — identifies meaningful changes
 * 6. Notifications — alerts via Slack/email
 * 7. Storage — persists to Supabase and R2
 */

import type {
  OemId,
  SourcePage,
  ImportRun,
  Product,
  Offer,
  Banner,
  CrawlResult,
  ChangeEvent,
  Oem,
  SmartModeResult,
  NetworkRequest,
  NetworkResponse,
  ApiCandidate,
  DiscoveredApi,
} from './oem/types';
import type { PageExtractionResult } from './extract/engine';

import { CrawlScheduler, CrawlPriorityQueue, estimateMonthlyCosts } from './crawl/scheduler';
import { ExtractionEngine, computeHtmlHash, normalizeHtml } from './extract/engine';
import { AiRouter } from './ai/router';
import { ChangeDetector, AlertBatcher } from './notify/change-detector';
import { SlackNotifier, MultiChannelNotifier } from './notify/slack';
import { SalesRepAgent } from './ai/sales-rep';
import { DesignAgent } from './design/agent';
import { getOemDefinition } from './oem/registry';

// ============================================================================
// Configuration
// ============================================================================

export interface OrchestratorConfig {
  supabaseClient: any;
  r2Bucket: R2Bucket;
  browser: Fetcher; // Browser Rendering binding (BrowserWorker)
  aiRouter: AiRouter;
  notifier: MultiChannelNotifier;
  
  // Optional overrides
  scheduler?: CrawlScheduler;
  changeDetector?: ChangeDetector;
  salesRepAgent?: SalesRepAgent;
  designAgent?: DesignAgent;
}

export interface CrawlJob {
  oemId: OemId;
  sourcePage: SourcePage;
  priority: number;
}

// ============================================================================
// Pipeline Result Types
// ============================================================================

export interface CrawlPipelineResult {
  success: boolean;
  sourcePageId: string;
  url: string;
  htmlHash: string;
  wasRendered: boolean;
  smartMode?: boolean;
  extractionResult?: PageExtractionResult;
  discoveredApis?: ApiCandidate[];
  error?: string;
  durationMs: number;
}

export interface ChangePipelineResult {
  productsCreated: number;
  productsUpdated: number;
  offersCreated: number;
  offersUpdated: number;
  bannersUpdated: number;
  changeEvents: ChangeEvent[];
  alertsSent: number;
}

// ============================================================================
// Main Orchestrator
// ============================================================================

export class OemAgentOrchestrator {
  private config: OrchestratorConfig;
  private scheduler: CrawlScheduler;
  private extractionEngine: ExtractionEngine;
  private changeDetector: ChangeDetector;
  private alertBatcher: AlertBatcher;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.scheduler = config.scheduler || new CrawlScheduler();
    this.extractionEngine = new ExtractionEngine();
    this.changeDetector = config.changeDetector || new ChangeDetector();
    this.alertBatcher = new AlertBatcher();
  }

  // ==========================================================================
  // Main Entry Points
  // ==========================================================================

  /**
   * Run a scheduled crawl for all due pages across all OEMs.
   * 
   * This is the main entry point called by the scheduled worker.
   */
  async runScheduledCrawl(): Promise<{
    jobsProcessed: number;
    pagesChanged: number;
    errors: number;
  }> {
    console.log('[Orchestrator] Starting scheduled crawl...');
    
    const startTime = Date.now();
    let jobsProcessed = 0;
    let pagesChanged = 0;
    let errors = 0;

    // Get all active OEMs
    const { data: oems, error: oemsError } = await this.config.supabaseClient
      .from('oems')
      .select('*')
      .eq('is_active', true);

    if (oemsError) {
      console.error('[Orchestrator] Failed to fetch OEMs:', oemsError);
      return { jobsProcessed: 0, pagesChanged: 0, errors: 1 };
    }

    // Process each OEM
    for (const oem of oems) {
      try {
        const result = await this.crawlOem(oem.id as OemId);
        jobsProcessed += result.jobsProcessed;
        pagesChanged += result.pagesChanged;
        errors += result.errors;
      } catch (error) {
        console.error(`[Orchestrator] Error crawling OEM ${oem.id}:`, error);
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Orchestrator] Scheduled crawl complete: ${jobsProcessed} jobs, ${pagesChanged} changed, ${errors} errors in ${duration}ms`);

    return { jobsProcessed, pagesChanged, errors };
  }

  /**
   * Run a full crawl for a specific OEM.
   */
  async crawlOem(oemId: OemId): Promise<{
    jobsProcessed: number;
    pagesChanged: number;
    errors: number;
    importRunId: string | null;
  }> {
    console.log(`[Orchestrator] Crawling OEM: ${oemId}`);

    // Create import run record
    const importRun = {
      id: crypto.randomUUID(),
      oem_id: oemId,
      run_type: 'manual',
      status: 'running',
      started_at: new Date().toISOString(),
    };

    console.log(`[Orchestrator] Creating import run: ${importRun.id}`);
    const { error: insertError } = await this.config.supabaseClient
      .from('import_runs')
      .insert(importRun);

    if (insertError) {
      console.error('[Orchestrator] Failed to create import run:', insertError);
    } else {
      console.log(`[Orchestrator] Import run created: ${importRun.id}`);
    }

    // Get due pages for this OEM
    console.log(`[Orchestrator] Fetching due pages for ${oemId}...`);
    const pages = await this.getDuePages(oemId);
    console.log(`[Orchestrator] Found ${pages.length} due pages for ${oemId}`);
    
    let jobsProcessed = 0;
    let pagesChanged = 0;
    let errors = 0;

    // Process each page
    for (const page of pages) {
      try {
        const result = await this.crawlPage(oemId, page);
        jobsProcessed++;

        if (result.success) {
          if (result.extractionResult?.products?.data?.length || 
              result.extractionResult?.offers?.data?.length) {
            pagesChanged++;
          }
        } else {
          errors++;
        }
      } catch (error) {
        console.error(`[Orchestrator] Error crawling page ${page.url}:`, error);
        errors++;
      }
    }

    // Update import run
    await this.config.supabaseClient
      .from('import_runs')
      .update({
        status: errors > 0 ? (pagesChanged > 0 ? 'partial' : 'failed') : 'completed',
        finished_at: new Date().toISOString(),
        pages_checked: jobsProcessed,
        pages_changed: pagesChanged,
        pages_errored: errors,
      })
      .eq('id', importRun.id);

    // Send batched alerts
    await this.sendBatchedAlerts(oemId);

    return {
      jobsProcessed,
      pagesChanged,
      errors,
      importRunId: importRun.id || null,
    };
  }

  /**
   * Crawl a single page using smart mode (network interception).
   */
  async crawlPage(oemId: OemId, page: SourcePage): Promise<CrawlPipelineResult> {
    const startTime = Date.now();

    try {
      // Step 1: Check schedule
      const scheduleCheck = this.scheduler.shouldCrawl(page);
      if (!scheduleCheck.shouldCrawl) {
        return {
          success: true,
          sourcePageId: page.id,
          url: page.url,
          htmlHash: page.last_hash || '',
          wasRendered: false,
          smartMode: false,
          durationMs: Date.now() - startTime,
        };
      }

      // Step 2: Cheap check (fetch HTML without browser)
      const cheapHtml = await this.fetchHtml(page.url);
      const htmlHash = await computeHtmlHash(cheapHtml);

      // Step 3: Determine if browser rendering (smart mode) is needed
      const renderCheck = this.scheduler.shouldRender(page, htmlHash);
      let finalHtml = cheapHtml;
      let wasRendered = false;
      let smartModeResult: SmartModeResult | null = null;
      let discoveredApis: ApiCandidate[] = [];

      if (renderCheck.shouldRender) {
        // Check budget before rendering
        const budgetCheck = await this.checkRenderBudget(oemId);
        if (budgetCheck.allowed) {
          // Use smart mode to render and capture network traffic
          smartModeResult = await this.renderPageSmartMode(page.url, oemId);
          finalHtml = smartModeResult.html;
          discoveredApis = smartModeResult.apiCandidates;
          wasRendered = true;

          console.log(`[Orchestrator] Smart mode for ${page.url}:`);
          console.log(`  - Discovered ${discoveredApis.length} API candidates`);

          // Log high-confidence APIs
          const highConfidenceApis = discoveredApis.filter((api) => api.confidence >= 0.7);
          if (highConfidenceApis.length > 0) {
            console.log(`  - High confidence APIs:`);
            highConfidenceApis.forEach((api) => {
              console.log(`    * ${api.dataType || 'unknown'}: ${api.url} (${(api.confidence * 100).toFixed(0)}%)`);
            });
          }

          // Store discovered APIs
          if (discoveredApis.length > 0) {
            await this.storeDiscoveredApis(oemId, page.url, discoveredApis);
          }
        }
      }

      // Step 4: Extract data from HTML
      let extractionResult = this.extractionEngine.extract(
        finalHtml,
        oemId,
        page.page_type,
        page.url
      );

      // Step 5: Try to extract from discovered APIs first (smart mode priority)
      if (smartModeResult && discoveredApis.length > 0) {
        const apiExtractionResult = await this.extractFromDiscoveredApis(
          oemId,
          page,
          smartModeResult
        );
        if (apiExtractionResult) {
          extractionResult = this.mergeApiResults(extractionResult, apiExtractionResult);
        }
      }

      // Step 6: LLM fallback if still needed
      if (this.extractionEngine.needsLlmFallback(extractionResult)) {
        const llmResult = await this.runLlmExtraction(finalHtml, oemId, page);
        extractionResult = this.mergeLlmResults(extractionResult, llmResult);
      }

      // Step 7: Process changes
      console.log(`[Orchestrator] About to process changes. Products: ${extractionResult.products?.data?.length || 0}`);
      try {
        await this.processChanges(oemId, page, extractionResult);
        console.log(`[Orchestrator] Process changes completed successfully`);
      } catch (processError) {
        console.error(`[Orchestrator] Process changes FAILED:`, processError);
        throw processError;
      }

      // Step 8: Update source page record
      await this.updateSourcePage(page, htmlHash, wasRendered);

      return {
        success: true,
        sourcePageId: page.id,
        url: page.url,
        htmlHash,
        wasRendered,
        smartMode: wasRendered,
        extractionResult,
        discoveredApis,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      // Update page with error
      await this.updateSourcePageError(
        page,
        error instanceof Error ? error.message : String(error)
      );

      return {
        success: false,
        sourcePageId: page.id,
        url: page.url,
        htmlHash: '',
        wasRendered: false,
        smartMode: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract data directly from discovered API responses.
   */
  private async extractFromDiscoveredApis(
    oemId: OemId,
    page: SourcePage,
    smartModeResult: SmartModeResult
  ): Promise<PageExtractionResult | null> {
    const productApis = smartModeResult.apiCandidates.filter(
      (api) => api.dataType === 'products' && api.confidence >= 0.6
    );
    const offerApis = smartModeResult.apiCandidates.filter(
      (api) => api.dataType === 'offers' && api.confidence >= 0.6
    );

    // Find corresponding responses
    const products: any[] = [];
    const offers: any[] = [];

    console.log(`[Orchestrator] extractFromDiscoveredApis: ${productApis.length} product APIs, ${offerApis.length} offer APIs`);
    console.log(`[Orchestrator] Total networkResponses: ${smartModeResult.networkResponses.length}`);
    
    // Debug: Log all API candidate URLs and response URLs
    if (productApis.length > 0) {
      console.log(`[Orchestrator] API Candidate URLs:`);
      productApis.forEach(api => console.log(`  - ${api.url}`));
    }
    if (smartModeResult.networkResponses.length > 0) {
      const jsonResponses = smartModeResult.networkResponses.filter(r => r.contentType?.includes('json'));
      console.log(`[Orchestrator] JSON Response URLs (${jsonResponses.length}):`);
      jsonResponses.forEach(r => console.log(`  - ${r.url.substring(0, 100)} (body: ${r.body?.length || 0} chars)`));
    }

    // ROBUST EXTRACTION: Try to extract from ALL JSON responses with bodies first
    // This bypasses URL matching issues and extracts from any response that looks like vehicle data
    const jsonResponsesWithBody = smartModeResult.networkResponses.filter(
      (r) => r.contentType?.includes('json') && r.body && r.body.length > 100
    );
    
    console.log(`[Orchestrator] Attempting robust extraction from ${jsonResponsesWithBody.length} JSON responses`);
    
    const seenTitles = new Set<string>();
    for (const response of jsonResponsesWithBody) {
      try {
        const data = JSON.parse(response.body!);
        console.log(`[Orchestrator] Parsing JSON from ${response.url.substring(0, 60)}... (type: ${Array.isArray(data) ? 'array' : typeof data})`);
        const extracted = this.extractProductsFromApiResponse(data);
        console.log(`[Orchestrator] Extraction returned ${extracted.length} items`);
        if (extracted.length > 0) {
          console.log(`[Orchestrator] Extracted ${extracted.length} products from: ${response.url.substring(0, 80)}`);
          // Deduplicate as we go
          let added = 0;
          for (const p of extracted) {
            const title = p.title?.toLowerCase().trim();
            if (title) {
              if (!seenTitles.has(title)) {
                seenTitles.add(title);
                products.push(p);
                added++;
              } else {
                console.log(`[Orchestrator] Duplicate title skipped: ${title}`);
              }
            } else {
              console.log(`[Orchestrator] Item without title: ${JSON.stringify(p).substring(0, 100)}`);
            }
          }
          console.log(`[Orchestrator] Added ${added} unique products from this response`);
        }
      } catch (err) {
        console.error(`[Orchestrator] Error extracting from ${response.url.substring(0, 60)}:`, err);
      }
    }
    
    console.log(`[Orchestrator] Total unique products from JSON responses: ${products.length}`);

    // Fallback: Try direct fetch for any product APIs that weren't captured in network responses
    for (const api of productApis) {
      // Skip if we already have products from this URL (check by path)
      try {
        const apiPath = new URL(api.url).pathname;
        const alreadyCaptured = jsonResponsesWithBody.some(r => {
          try {
            return new URL(r.url).pathname === apiPath;
          } catch {
            return false;
          }
        });
        if (alreadyCaptured) continue;
      } catch {
        continue;
      }
      
      console.log(`[Orchestrator] API not captured, trying direct fetch: ${api.url.substring(0, 80)}`);
      
      try {
        const headers: Record<string, string> = {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };
        
        if (api.url.includes('ford.com')) {
          headers['Referer'] = 'https://www.ford.com.au/';
          headers['Origin'] = 'https://www.ford.com.au';
        } else if (api.url.includes('toyota.com')) {
          headers['Referer'] = 'https://www.toyota.com.au/';
        } else if (api.url.includes('hyundai.com')) {
          headers['Referer'] = 'https://www.hyundai.com/au/';
        }
        
        const directResponse = await fetch(api.url, { headers });
        
        if (directResponse.ok) {
          const body = await directResponse.text();
          if (body.length > 0) {
            const data = JSON.parse(body);
            const extracted = this.extractProductsFromApiResponse(data);
            for (const p of extracted) {
              const title = p.title?.toLowerCase().trim();
              if (title && !seenTitles.has(title)) {
                seenTitles.add(title);
                products.push(p);
              }
            }
            if (extracted.length > 0) {
              console.log(`[Orchestrator] Direct fetch added ${extracted.length} products`);
            }
          }
        }
      } catch (fetchErr) {
        // Ignore fetch errors
      }
    }

    // Also extract offers from all JSON responses
    for (const response of jsonResponsesWithBody) {
      try {
        const data = JSON.parse(response.body!);
        const extracted = this.extractOffersFromApiResponse(data);
        if (extracted.length > 0) {
          console.log(`[Orchestrator] Extracted ${extracted.length} offers from: ${response.url.substring(0, 80)}`);
          offers.push(...extracted);
        }
      } catch (err) {
        // Ignore parse errors
      }
    }

    if (products.length === 0 && offers.length === 0) {
      return null;
    }

    return {
      url: page.url,
      products: {
        data: products,
        confidence: 0.9, // High confidence for direct API extraction
        method: 'api' as any,
        coverage: 1,
      },
      offers: {
        data: offers,
        confidence: 0.9,
        method: 'api' as any,
        coverage: 1,
      },
      bannerSlides: {
        data: [],
        confidence: 0,
        method: 'none' as any,
        coverage: 0,
      },
      discoveredUrls: [],
      metadata: {
        title: '',
        description: '',
        jsonLdSchemas: [],
      },
    };
  }

  /**
   * Extract products from API JSON response.
   * Handles multiple formats: generic APIs, Ford AEM, and OEM-specific structures.
   */
  private extractProductsFromApiResponse(data: any): any[] {
    const products: any[] = [];

    // Try common response shapes
    let items: any[] = [];

    // 1. Ford AEM vehiclesmenu.data format - MUST check first (is an array but with nested nameplates)
    if (this.isAemVehicleMenuData(data)) {
      items = this.extractAemVehicleMenuItems(data);
      console.log(`[Orchestrator] Extracted ${items.length} items from AEM vehiclesmenu.data`);
    }
    // 2. AEM generic content structure (jcr:content, components, etc.)
    else if (this.isAemContentStructure(data)) {
      items = this.extractAemContentItems(data);
      console.log(`[Orchestrator] Extracted ${items.length} items from AEM content structure`);
    }
    // 3. Direct array (generic)
    else if (Array.isArray(data)) {
      items = data;
    }
    // 4. Standard wrapper patterns
    else if (data.data && Array.isArray(data.data)) {
      items = data.data;
    } else if (data.vehicles && Array.isArray(data.vehicles)) {
      items = data.vehicles;
    } else if (data.models && Array.isArray(data.models)) {
      items = data.models;
    } else if (data.products && Array.isArray(data.products)) {
      items = data.products;
    } else if (data.results && Array.isArray(data.results)) {
      items = data.results;
    }

    for (const item of items) {
      // Normalize to our product format
      const product = {
        title: item.name || item.title || item.modelName || item.model || item.vehicleName,
        subtitle: item.subtitle || item.variant || item.trim || item.tagline,
        body_type: item.bodyType || item.body_type || item.type || item.vehicleType || item.category,
        fuel_type: item.fuelType || item.fuel_type || item.fuel || item.powerTrain,
        availability: item.availability || item.status || 'available',
        price: {
          amount: item.price || item.msrp || item.driveaway_price || item.priceAmount ||
                  item.startingPrice || item.fromPrice || this.extractPriceFromString(item.priceText || item.priceDisplay),
          currency: item.currency || 'AUD',
          type: item.priceType || item.price_type || 'driveaway',
          raw_string: item.priceDisplay || item.price_raw || item.priceText,
        },
        key_features: item.features || item.highlights || item.keyFeatures || [],
        variants: item.variants || item.trims || item.grades || [],
        disclaimer_text: item.disclaimer || item.terms || item.legalText,
        // Ford uses imageUrl (built in extraction), fallback to raw image field
        primary_image_url: item.imageUrl || item.image || item.hero_image || item.thumbnailImage || item.vehicleImage,
        // Ford uses 'code' as external key
        external_key: item.code || item.modelCode || item.vehicleCode || item.id,
        // Ford uses sourceUrl (built in extraction), fallback to other URL fields
        source_url: item.sourceUrl || item.link || item.url || item.detailsUrl || item.ctaLink,
      };

      // Only add if we have at least a title
      if (product.title) {
        products.push(product);
      }
    }

    return products;
  }

  /**
   * Check if data is Ford AEM vehiclesmenu.data format.
   */
  private isAemVehicleMenuData(data: any): boolean {
    if (!data) return false;

    // Ford AU format: Array of category objects with nameplates
    // [{ category: "Trucks", nameplates: [...] }, ...]
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      if (first && typeof first === 'object') {
        // Check for Ford's nameplates structure
        if (first.nameplates || first.category || first.vehicleCategories) {
          return true;
        }
      }
    }

    if (typeof data !== 'object') return false;

    // AEM vehiclesmenu typically has categories or navItems with vehicle entries
    const hasCategories = Array.isArray(data.categories) || Array.isArray(data.navItems) ||
                          Array.isArray(data.vehicleCategories) || Array.isArray(data.menuItems);

    // Or nested object with child nodes containing vehicle data
    const hasNestedItems = Object.keys(data).some(key => {
      const child = data[key];
      return child && typeof child === 'object' &&
             (child.vehicles || child.items || child.models || child.nameplates || Array.isArray(child));
    });

    // Check for AEM-specific markers
    const hasAemMarkers = data[':type'] || data['jcr:primaryType'] || data['sling:resourceType'];

    return hasCategories || hasNestedItems || hasAemMarkers;
  }

  /**
   * Extract vehicle items from Ford AEM vehiclesmenu.data format.
   */
  private extractAemVehicleMenuItems(data: any): any[] {
    const items: any[] = [];

    // Ford AU format: Array of category objects with nameplates
    // Structure: [{ category: "Trucks", nameplates: [{ code, name, image, pricing, ... }] }]
    if (Array.isArray(data)) {
      for (const categoryObj of data) {
        if (categoryObj && typeof categoryObj === 'object') {
          const categoryName = categoryObj.category || categoryObj.name || categoryObj.title;
          const nameplates = categoryObj.nameplates || categoryObj.vehicles || categoryObj.items || [];

          for (const np of (Array.isArray(nameplates) ? nameplates : [])) {
            items.push({
              ...np,
              category: categoryName,
              // Normalize Ford-specific fields
              title: np.name,
              bodyType: np.bodyType?.[0] || categoryName,
              vehicleType: np.vehicleType?.[0] || categoryName,
              // Extract price from Ford's nested structure
              priceText: np.pricing?.min?.priceVat || np.pricing?.min?.price,
              // Build full image URL
              imageUrl: np.image?.startsWith('/') ? `https://www.ford.com.au${np.image}` : np.image,
              // Build source URL from path
              sourceUrl: np.path?.startsWith('/') ? `https://www.ford.com.au${np.path.replace('/content/ecomm-img', '')}` : np.path,
              // CTA link for build & price
              ctaLink: np.additionalCTA,
            });
          }
        }
      }
      console.log(`[Orchestrator] Ford nameplates extraction found ${items.length} vehicles`);
      // Log all extracted vehicle names for debugging
      const vehicleNames = items.map((i: any) => i.title).filter(Boolean);
      console.log(`[Orchestrator] Extracted vehicles: ${vehicleNames.join(', ')}`);
      return items;
    }

    // Handle wrapped categories object
    const categories = data.categories || data.navItems || data.vehicleCategories || data.menuItems || [];

    for (const category of (Array.isArray(categories) ? categories : [])) {
      // Each category may have vehicles/items/nameplates
      const categoryItems = category.nameplates || category.vehicles || category.items || category.models ||
                            category.children || category.entries || [];

      for (const item of (Array.isArray(categoryItems) ? categoryItems : [])) {
        items.push({
          ...item,
          category: category.name || category.title || category.label || category.category,
          bodyType: item.bodyType?.[0] || category.type || category.bodyType,
        });
      }
    }

    // Handle nested object structure (common in AEM)
    if (items.length === 0 && typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith(':') || key.startsWith('jcr:') || key.startsWith('sling:')) continue;

        if (Array.isArray(value)) {
          // Direct array of items
          for (const item of value) {
            if (item && typeof item === 'object' && (item.name || item.title || item.model)) {
              items.push(item);
            }
          }
        } else if (value && typeof value === 'object') {
          // Nested object - could be a category or a single vehicle
          const nestedItems = (value as any).nameplates || (value as any).vehicles || (value as any).items || (value as any).models;
          if (Array.isArray(nestedItems)) {
            for (const item of nestedItems) {
              items.push({
                ...item,
                category: key,
              });
            }
          } else if ((value as any).name || (value as any).title || (value as any).model) {
            // It's a single vehicle entry
            items.push({
              ...value,
              category: key,
            });
          }
        }
      }
    }

    console.log(`[Orchestrator] AEM vehicle menu extraction found ${items.length} vehicles`);
    return items;
  }

  /**
   * Check if data is AEM content structure.
   */
  private isAemContentStructure(data: any): boolean {
    if (!data || typeof data !== 'object') return false;

    // Check for jcr:content or similar AEM patterns
    return !!(data['jcr:content'] || data['cq:template'] || data['sling:resourceType'] ||
              data.root || data.container || data.responsivegrid);
  }

  /**
   * Extract items from AEM content structure.
   */
  private extractAemContentItems(data: any): any[] {
    const items: any[] = [];

    // Recursively search for vehicle/product data in AEM structure
    this.recursiveAemExtract(data, items, 0);

    return items;
  }

  /**
   * Recursively extract vehicle data from AEM content structure.
   */
  private recursiveAemExtract(obj: any, items: any[], depth: number): void {
    if (!obj || typeof obj !== 'object' || depth > 10) return;

    // Check if this object looks like a vehicle/product
    const hasVehicleData = obj.name || obj.title || obj.modelName || obj.vehicleName;
    const hasPrice = obj.price || obj.msrp || obj.priceText || obj.startingPrice;
    const hasImage = obj.image || obj.imageUrl || obj.thumbnailImage;

    if (hasVehicleData && (hasPrice || hasImage)) {
      items.push(obj);
      return; // Don't recurse into already-captured items
    }

    // Recurse into arrays
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.recursiveAemExtract(item, items, depth + 1);
      }
      return;
    }

    // Recurse into object properties
    for (const [key, value] of Object.entries(obj)) {
      // Skip AEM metadata keys
      if (key.startsWith(':') || key.startsWith('jcr:') || key.startsWith('sling:') || key.startsWith('cq:')) {
        continue;
      }
      this.recursiveAemExtract(value, items, depth + 1);
    }
  }

  /**
   * Extract numeric price from string (e.g., "From $45,990" -> 45990)
   */
  private extractPriceFromString(priceStr: string | undefined): number | undefined {
    if (!priceStr) return undefined;

    // Remove currency symbols, commas, and extract number
    const match = priceStr.replace(/[,$]/g, '').match(/(\d+(?:\.\d{2})?)/);
    if (match) {
      return parseFloat(match[1]);
    }
    return undefined;
  }

  /**
   * Extract offers from API JSON response.
   */
  private extractOffersFromApiResponse(data: any): any[] {
    const offers: any[] = [];

    let items: any[] = [];

    if (Array.isArray(data)) {
      items = data;
    } else if (data.data && Array.isArray(data.data)) {
      items = data.data;
    } else if (data.offers && Array.isArray(data.offers)) {
      items = data.offers;
    } else if (data.promotions && Array.isArray(data.promotions)) {
      items = data.promotions;
    } else if (data.deals && Array.isArray(data.deals)) {
      items = data.deals;
    }

    for (const item of items) {
      const offer = {
        title: item.name || item.title || item.headline,
        description: item.description || item.details,
        offer_type: item.type || item.offer_type,
        applicable_models: item.models || item.applicable_models || [],
        price: {
          amount: item.price || item.amount,
          saving_amount: item.saving || item.discount || item.savings,
          raw_string: item.priceDisplay,
        },
        validity: {
          start_date: item.startDate || item.start_date,
          end_date: item.endDate || item.end_date,
          raw_string: item.validityText || item.terms,
        },
        cta_text: item.ctaText || item.cta_text || 'View Offer',
        cta_url: item.ctaUrl || item.cta_url || item.url,
        disclaimer_text: item.disclaimer || item.terms,
      };

      if (offer.title) {
        offers.push(offer);
      }
    }

    return offers;
  }

  /**
   * Merge API extraction results with HTML extraction results.
   */
  private mergeApiResults(
    htmlResult: PageExtractionResult,
    apiResult: PageExtractionResult
  ): PageExtractionResult {
    // API results take precedence when available
    const apiProducts = apiResult.products.data || [];
    const apiOffers = apiResult.offers.data || [];

    return {
      ...htmlResult,
      products: apiProducts.length > 0 ? apiResult.products : htmlResult.products,
      offers: apiOffers.length > 0 ? apiResult.offers : htmlResult.offers,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async getDuePages(oemId: OemId): Promise<SourcePage[]> {
    console.log(`[Orchestrator] Querying source_pages for ${oemId}...`);
    const { data, error } = await this.config.supabaseClient
      .from('source_pages')
      .select('*')
      .eq('oem_id', oemId)
      .eq('status', 'active')
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .limit(100);

    if (error) {
      console.error(`[Orchestrator] Source pages query error:`, error);
      throw new Error(`Failed to fetch source pages: ${error.message}`);
    }

    console.log(`[Orchestrator] Found ${data?.length || 0} active pages for ${oemId}`);

    // Filter to only pages that are due
    const duePages = (data || []).filter((page: SourcePage) => {
      const check = this.scheduler.shouldCrawl(page);
      return check.shouldCrawl;
    });
    console.log(`[Orchestrator] ${duePages.length} pages are due for crawl`);
    return duePages;
  }

  private async fetchHtml(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Render a page with smart mode network interception.
   * Captures all network requests to discover internal APIs.
   */
  private async renderPageSmartMode(url: string, oemId: OemId): Promise<SmartModeResult> {
    console.log(`[Orchestrator] Smart mode: Launching browser for ${url}`);

    let browser;
    try {
      // Dynamic import to avoid initialization issues
      const puppeteerModule = await import('@cloudflare/puppeteer');
      const puppeteer = puppeteerModule.default;
      browser = await puppeteer.launch(this.config.browser as any);
      console.log(`[Orchestrator] Browser launched successfully`);
    } catch (launchError) {
      console.error(`[Orchestrator] Browser launch failed:`, launchError);
      // Return basic result without network capture
      return this.renderPageBasic(url);
    }

    const networkRequests: NetworkRequest[] = [];
    const networkResponses: NetworkResponse[] = [];
    let pendingResponseHandlers = 0;
    const responsePromises: Promise<void>[] = [];

    try {
      console.log(`[Orchestrator] Creating new page...`);
      const page = await browser.newPage();
      console.log(`[Orchestrator] Page created successfully`);

      // Set viewport and user agent with stealth mode to bypass bot detection
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
      );

      // Set realistic headers to bypass bot detection (Akamai, etc.)
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

      // Emulate navigator properties to avoid bot detection
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

      // Known cross-origin API domains for OEMs (Ford uses imgservices.ford.com)
      const knownApiDomains = [
        'imgservices.ford.com',
        'api.ford.com',
        'ford-api.com',
        'api.toyota.com',
        'api.hyundai.com',
        'api.kia.com',
        'api.mazda.com',
      ];

      // Try to enable request interception to capture network traffic
      let interceptionEnabled = false;
      try {
        await page.setRequestInterception(true);
        interceptionEnabled = true;
        console.log(`[Orchestrator] Request interception enabled`);
      } catch (interceptError) {
        console.warn(`[Orchestrator] Request interception not supported:`, interceptError);
      }

      // Capture all requests (only if interception is enabled)
      if (interceptionEnabled) {
        page.on('request', (request) => {
          const requestUrl = request.url();
          const resourceType = request.resourceType();
          const method = request.method();

          // Check if this is a cross-origin API request
          const isCrossOriginApi = knownApiDomains.some(domain => requestUrl.includes(domain));
          const isApiPath = requestUrl.includes('/api/') || requestUrl.includes('/v1/') || requestUrl.includes('/v2/');
          // AEM (Adobe Experience Manager) patterns - Ford uses .data endpoints
          const isAemDataEndpoint = requestUrl.endsWith('.data') || requestUrl.includes('.data?');
          const isAemContentPath = requestUrl.includes('/content/') && !requestUrl.match(/\.(js|css|png|jpg|gif|svg|woff|woff2)$/);
          const isDataRequest = ['POST', 'PUT', 'PATCH'].includes(method) ||
                                (method === 'GET' && (isApiPath || isAemDataEndpoint || isAemContentPath));

          // Log ALL requests for debugging
          if (isCrossOriginApi || isApiPath || isAemDataEndpoint || isAemContentPath || ['xhr', 'fetch'].includes(resourceType)) {
            console.log(`[SmartMode] REQUEST: ${method} ${resourceType} ${requestUrl.substring(0, 120)}`);
            if (isAemDataEndpoint) {
              console.log(`[SmartMode]   ^ AEM .data endpoint`);
            }
            if (isAemContentPath) {
              console.log(`[SmartMode]   ^ AEM content path`);
            }
            if (request.postData()) {
              console.log(`[SmartMode]   POST body: ${request.postData()?.substring(0, 200)}...`);
            }
          }

          // Track XHR, fetch, document requests AND cross-origin API requests AND AEM endpoints
          if (['xhr', 'fetch', 'document', 'script'].includes(resourceType) || isCrossOriginApi || isDataRequest || isAemDataEndpoint || isAemContentPath) {
            networkRequests.push({
              url: requestUrl,
              method: method,
              headers: request.headers(),
              postData: request.postData(),
              resourceType,
              timestamp: Date.now(),
            });
          }
          request.continue();
        });
      }

      // Capture all responses (response events work even without interception)
      page.on('response', (response) => {
        // Track this handler as pending
        pendingResponseHandlers++;
        const handlerPromise = (async () => {
          try {
          const request = response.request();
          const resourceType = request.resourceType();
          const responseUrl = response.url();
          const method = request.method();
          const contentType = response.headers()['content-type'] || null;

          // Check if this is a cross-origin API response
          const isCrossOriginApi = knownApiDomains.some(domain => responseUrl.includes(domain));
          const isApiPath = responseUrl.includes('/api/') || responseUrl.includes('/v1/') || responseUrl.includes('/v2/');
          // AEM (Adobe Experience Manager) patterns - Ford uses .data endpoints
          const isAemDataEndpoint = responseUrl.endsWith('.data') || responseUrl.includes('.data?');
          const isAemContentPath = responseUrl.includes('/content/') && !responseUrl.match(/\.(js|css|png|jpg|gif|svg|woff|woff2)$/);
          const isJsonResponse = contentType?.includes('application/json') || contentType?.includes('text/json');
          const isDataMethod = ['POST', 'PUT', 'PATCH'].includes(method);

          // Track responses for XHR/fetch requests AND cross-origin API responses
          const shouldTrack = ['xhr', 'fetch'].includes(resourceType) ||
                              isCrossOriginApi ||
                              isAemDataEndpoint ||
                              (isAemContentPath && isJsonResponse) ||
                              (isApiPath && isJsonResponse) ||
                              (isDataMethod && isJsonResponse);

          if (shouldTrack) {
            let body: string | undefined;

            // Log the response for debugging
            console.log(`[SmartMode] RESPONSE: ${response.status()} ${method} ${resourceType} ${responseUrl.substring(0, 100)}`);
            if (isCrossOriginApi) {
              console.log(`[SmartMode]   ^ Cross-origin API detected!`);
            }
            if (isAemDataEndpoint) {
              console.log(`[SmartMode]   ^ AEM .data endpoint detected!`);
            }
            if (isAemContentPath) {
              console.log(`[SmartMode]   ^ AEM content path detected!`);
            }

            // Try to get response body for JSON responses
            if (isJsonResponse) {
              try {
                body = await response.text();
                console.log(`[SmartMode]   Body captured: ${body?.length || 0} chars`);
                // Log first 200 chars of body for debugging
                if (body && body.length > 0) {
                  console.log(`[SmartMode]   Preview: ${body.substring(0, 200)}...`);
                }
              } catch (e) {
                // Cross-origin responses may fail to get body - log but continue
                console.log(`[SmartMode]   Failed to get body (likely CORS): ${e}`);
                // For cross-origin APIs, we still want to track the URL even without body
              }
            }

            networkResponses.push({
              url: responseUrl,
              status: response.status(),
              statusText: response.statusText(),
              headers: response.headers(),
              contentType,
              body,
              bodySize: parseInt(response.headers()['content-length'] || '0', 10),
              timestamp: Date.now(),
            });
          }
        } catch (responseError) {
          console.warn(`[SmartMode] Error processing response:`, responseError);
        } finally {
          pendingResponseHandlers--;
        }
        })();
        responsePromises.push(handlerPromise);
      });

      // Track performance metrics
      let domContentLoaded = 0;
      let loadComplete = 0;

      page.on('domcontentloaded', () => {
        domContentLoaded = Date.now();
      });

      page.on('load', () => {
        loadComplete = Date.now();
      });

      const startTime = Date.now();

      // Navigate with timeout
      console.log(`[Orchestrator] Navigating to ${url}...`);
      try {
        await page.goto(url, {
          waitUntil: 'networkidle0',
          timeout: 30000,
        });
        console.log(`[Orchestrator] Initial navigation complete`);

        // Wait a bit more for any delayed API calls (some OEM sites lazy-load data)
        console.log(`[Orchestrator] Waiting for delayed API calls...`);
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Try to scroll down to trigger lazy-loaded content and API calls
        try {
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight / 2);
          });
          await new Promise(resolve => setTimeout(resolve, 1000));
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          await new Promise(resolve => setTimeout(resolve, 1000));
          console.log(`[Orchestrator] Scroll triggers complete`);
        } catch (scrollErr) {
          console.warn(`[Orchestrator] Scroll failed:`, scrollErr);
        }

        console.log(`[Orchestrator] Navigation and scroll complete`);
      } catch (navError) {
        console.warn(`[Orchestrator] Navigation warning:`, navError);
        // Try to get content anyway
      }

      // Get the full HTML content
      const html = await page.content();
      console.log(`[Orchestrator] Got page content: ${html.length} chars`);

      // Wait for all response handlers to complete (important for async body reading)
      console.log(`[Orchestrator] Waiting for ${pendingResponseHandlers} pending response handlers...`);
      await Promise.all(responsePromises);
      console.log(`[Orchestrator] All response handlers complete, ${networkResponses.length} responses captured`);

      // Analyze captured responses to identify API candidates
      const apiCandidates = this.analyzeApiCandidates(networkResponses, oemId);

      console.log(`[Orchestrator] Smart mode complete for ${url}:`);
      console.log(`  - HTML: ${html.length} chars`);
      console.log(`  - Network requests: ${networkRequests.length}`);
      console.log(`  - Network responses: ${networkResponses.length}`);
      console.log(`  - API candidates: ${apiCandidates.length}`);

      // Log all requests for debugging (including POST/PUT to cross-origin)
      const postPutRequests = networkRequests.filter((r) => ['POST', 'PUT', 'PATCH'].includes(r.method));
      if (postPutRequests.length > 0) {
        console.log(`  - POST/PUT/PATCH requests found:`);
        postPutRequests.forEach((r) => {
          console.log(`    * ${r.method} ${r.url.substring(0, 100)}`);
          if (r.postData) {
            console.log(`      Body: ${r.postData.substring(0, 150)}...`);
          }
        });
      } else {
        console.log(`  - No POST/PUT/PATCH requests captured`);
      }

      // Log cross-origin requests specifically
      const crossOriginRequests = networkRequests.filter((r) =>
        r.url.includes('imgservices.ford.com') ||
        r.url.includes('api.ford.com')
      );
      if (crossOriginRequests.length > 0) {
        console.log(`  - Cross-origin Ford API requests:`);
        crossOriginRequests.forEach((r) => {
          console.log(`    * ${r.method} ${r.url}`);
        });
      } else {
        console.log(`  - No cross-origin Ford API requests captured`);
      }

      // Log AEM .data endpoint requests
      const aemDataRequests = networkRequests.filter((r) =>
        r.url.endsWith('.data') || r.url.includes('.data?')
      );
      if (aemDataRequests.length > 0) {
        console.log(`  - AEM .data endpoint requests:`);
        aemDataRequests.forEach((r) => {
          console.log(`    * ${r.method} ${r.url}`);
        });
      } else {
        console.log(`  - No AEM .data endpoint requests captured`);
      }

      // Log all JSON responses for debugging
      const jsonResponses = networkResponses.filter((r) => r.contentType?.includes('json'));
      if (jsonResponses.length > 0) {
        console.log(`  - JSON responses found:`);
        jsonResponses.forEach((r) => {
          console.log(`    * ${r.url} (${r.bodySize || r.body?.length || 0} bytes)`);
        });
      } else {
        console.log(`  - No JSON responses captured`);
      }

      // Log all captured URLs
      console.log(`  - All captured network responses (${networkResponses.length}):`);
      networkResponses.forEach((r) => {
        console.log(`    * [${r.status}] ${r.contentType || 'no-type'}: ${r.url.substring(0, 120)}`);
      });

      return {
        html,
        networkRequests,
        networkResponses,
        apiCandidates,
        performanceMetrics: {
          domContentLoaded: domContentLoaded - startTime,
          loadComplete: loadComplete - startTime,
          firstPaint: null, // Would require additional CDP calls
        },
      };
    } finally {
      await browser.close();
    }
  }

  /**
   * Fallback: Render page without network interception.
   * Used when smart mode fails (e.g., browser launch issues).
   */
  private async renderPageBasic(url: string): Promise<SmartModeResult> {
    console.log(`[Orchestrator] Falling back to basic render for ${url}`);

    try {
      // Dynamic import to avoid initialization issues
      const puppeteerModule = await import('@cloudflare/puppeteer');
      const puppeteer = puppeteerModule.default;
      const browser = await puppeteer.launch(this.config.browser as any);
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        await page.goto(url, {
          waitUntil: 'networkidle0',
          timeout: 30000,
        });

        const html = await page.content();
        console.log(`[Orchestrator] Basic render complete: ${html.length} chars`);

        return {
          html,
          networkRequests: [],
          networkResponses: [],
          apiCandidates: [],
          performanceMetrics: {
            domContentLoaded: 0,
            loadComplete: 0,
            firstPaint: null,
          },
        };
      } finally {
        await browser.close();
      }
    } catch (error) {
      console.error(`[Orchestrator] Basic render also failed:`, error);
      // Return minimal result with fetched HTML
      const html = await this.fetchHtml(url);
      return {
        html,
        networkRequests: [],
        networkResponses: [],
        apiCandidates: [],
        performanceMetrics: {
          domContentLoaded: 0,
          loadComplete: 0,
          firstPaint: null,
        },
      };
    }
  }

  /**
   * Analyze network responses to identify potential API endpoints.
   */
  private analyzeApiCandidates(responses: NetworkResponse[], oemId: OemId): ApiCandidate[] {
    const candidates: ApiCandidate[] = [];

    for (const response of responses) {
      // Skip non-successful responses
      if (response.status < 200 || response.status >= 300) continue;

      const isJson = response.contentType?.includes('application/json') || false;
      const url = response.url;

      // Skip known non-API endpoints
      if (this.isKnownNonApi(url)) continue;

      // Determine if this looks like a data API
      const isPotentialDataApi = this.isPotentialDataApi(url, response.body, isJson);
      const dataType = isPotentialDataApi ? this.classifyDataType(url, response.body) : null;

      // Calculate confidence score
      const confidence = this.calculateApiConfidence(url, response, isJson, isPotentialDataApi);

      // Include all JSON responses with any confidence > 0.1
      if (isJson || confidence > 0.3) {
        const finalConfidence = Math.max(confidence, isJson ? 0.3 : 0);
        candidates.push({
          url,
          method: 'GET', // Inferred from response
          contentType: response.contentType,
          responseSize: response.bodySize || (response.body?.length ?? 0),
          isJson,
          isPotentialDataApi,
          dataType,
          confidence: finalConfidence,
        });
        console.log(`[Orchestrator] API candidate: ${url.substring(0, 80)} (json=${isJson}, conf=${finalConfidence.toFixed(2)})`);
      }
    }

    // Sort by confidence descending
    candidates.sort((a, b) => b.confidence - a.confidence);

    return candidates;
  }

  /**
   * Check if URL is a known non-API endpoint (analytics, tracking, etc.)
   */
  private isKnownNonApi(url: string): boolean {
    const nonApiPatterns = [
      /google-analytics\.com/,
      /googletagmanager\.com/,
      /facebook\.com\/tr/,
      /doubleclick\.net/,
      /hotjar\.com/,
      /newrelic\.com/,
      /sentry\.io/,
      /cloudflare\.com/,
      /cdn\./,
      /fonts\./,
      /\.woff2?$/,
      /\.css$/,
      /\.js$/,
      /\.png$/,
      /\.jpg$/,
      /\.gif$/,
      /\.svg$/,
      /\.ico$/,
    ];

    return nonApiPatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Determine if a response looks like a data API.
   */
  private isPotentialDataApi(url: string, body: string | undefined, isJson: boolean): boolean {
    if (!isJson || !body) return false;

    try {
      const data = JSON.parse(body);

      // Check for array of objects (common API pattern)
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        return true;
      }

      // Check for object with data array property
      if (typeof data === 'object' && data !== null) {
        const keys = Object.keys(data);
        const dataKeys = ['data', 'items', 'results', 'vehicles', 'models', 'offers', 'products'];
        if (keys.some((k) => dataKeys.includes(k.toLowerCase()))) {
          return true;
        }
      }

      // Check URL patterns that suggest data APIs
      const apiUrlPatterns = [
        /\/api\//,
        /\/v[0-9]+\//,
        /\/vehicles/,
        /\/models/,
        /\/offers/,
        /\/products/,
        /\/inventory/,
        /\/pricing/,
        /\/stock/,
        /graphql/,
      ];

      if (apiUrlPatterns.some((p) => p.test(url))) {
        return true;
      }
    } catch {
      // Invalid JSON
    }

    return false;
  }

  /**
   * Classify the type of data returned by an API.
   */
  private classifyDataType(
    url: string,
    body: string | undefined
  ): 'products' | 'offers' | 'inventory' | 'pricing' | 'config' | 'other' | null {
    const urlLower = url.toLowerCase();

    // URL-based classification
    if (/vehicles|models|cars|range/.test(urlLower)) return 'products';
    if (/offers|deals|promotions|specials/.test(urlLower)) return 'offers';
    if (/inventory|stock|available/.test(urlLower)) return 'inventory';
    if (/price|pricing|quote|summary/.test(urlLower)) return 'pricing';
    if (/config|settings|feature/.test(urlLower)) return 'config';

    // Ford-specific patterns
    if (/vehicle-features|accessories|nukleus/.test(urlLower)) return 'products';
    if (/polk\/update|configurator/.test(urlLower)) return 'pricing';

    // AEM patterns
    if (/vehiclesmenu\.data|vehicles\.data|models\.data|range\.data/.test(urlLower)) return 'products';
    if (/buildandprice|build-and-price/.test(urlLower)) return 'pricing';

    // Body-based classification
    if (body) {
      try {
        const data = JSON.parse(body);
        const jsonStr = JSON.stringify(data).toLowerCase();

        if (/price|msrp|driveaway/.test(jsonStr) && /vehicle|model|car/.test(jsonStr)) {
          return 'products';
        }
        if (/discount|saving|offer|deal/.test(jsonStr)) {
          return 'offers';
        }
        // Ford-specific: accessories, features, variant data
        if (/accessory|feature|variant|trim|series/.test(jsonStr)) {
          return 'products';
        }
        // Ford pricing data patterns
        if (/totalprice|baseprice|driveway|rrp/.test(jsonStr.replace(/_/g, ''))) {
          return 'pricing';
        }
      } catch {
        // Invalid JSON
      }
    }

    return 'other';
  }

  /**
   * Calculate confidence score for an API candidate.
   */
  private calculateApiConfidence(
    url: string,
    response: NetworkResponse,
    isJson: boolean,
    isPotentialDataApi: boolean
  ): number {
    let confidence = 0;

    // Base score for JSON responses
    if (isJson) confidence += 0.3;

    // Boost for data API patterns
    if (isPotentialDataApi) confidence += 0.4;

    // URL pattern scoring
    if (/\/api\//.test(url)) confidence += 0.2;
    if (/\/v[0-9]+\//.test(url)) confidence += 0.1;
    if (/graphql/.test(url)) confidence += 0.3;

    // Known cross-origin API domains get a big boost
    const knownApiDomains = [
      'imgservices.ford.com',
      'api.ford.com',
      'ford-api.com',
    ];
    if (knownApiDomains.some(domain => url.includes(domain))) {
      confidence += 0.5;
    }

    // Ford-specific API patterns (vehicle-features, polk/update, price/summary)
    if (/vehicle-features|accessories|polk|nukleus|price\/.*summary/.test(url)) {
      confidence += 0.4;
    }

    // AEM (Adobe Experience Manager) .data endpoints - very high confidence
    if (/\.data$|\.data\?/.test(url)) {
      confidence += 0.5;
    }

    // AEM content paths with vehicle/model data
    if (/\/content\/.*\/(vehicles|models|range|buildandprice|vehiclesmenu)/.test(url.toLowerCase())) {
      confidence += 0.4;
    }

    // OEM pricing/configurator patterns
    if (/price|pricing|configurator|build.*price|summary/.test(url.toLowerCase())) {
      confidence += 0.3;
    }

    // Response size scoring (larger responses more likely to be data)
    const size = response.bodySize || (response.body?.length ?? 0);
    if (size > 10000) confidence += 0.1;
    if (size > 50000) confidence += 0.1;

    // Penalize if URL looks like a tracking/analytics endpoint
    if (/track|log|analytics|event|metric/.test(url.toLowerCase())) {
      confidence -= 0.3;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Legacy renderPage method - now uses smart mode internally.
   */
  private async renderPage(url: string, oemId: OemId): Promise<string> {
    const result = await this.renderPageSmartMode(url, oemId);

    // Store discovered APIs asynchronously
    if (result.apiCandidates.length > 0) {
      this.storeDiscoveredApis(oemId, url, result.apiCandidates).catch((err) => {
        console.error(`[Orchestrator] Failed to store discovered APIs:`, err);
      });
    }

    return result.html;
  }

  /**
   * Store discovered APIs in the database.
   */
  private async storeDiscoveredApis(
    oemId: OemId,
    sourceUrl: string,
    candidates: ApiCandidate[]
  ): Promise<void> {
    console.log(`[Orchestrator] Storing ${candidates.length} discovered APIs for ${oemId}`);

    // Get source page ID
    const { data: sourcePage } = await this.config.supabaseClient
      .from('source_pages')
      .select('id')
      .eq('url', sourceUrl)
      .eq('oem_id', oemId)
      .maybeSingle();

    for (const candidate of candidates) {
      // Store candidates with confidence >= 0.3
      if (candidate.confidence < 0.3) continue;

      console.log(`[Orchestrator] Storing API: ${candidate.url} (confidence: ${candidate.confidence.toFixed(2)}, type: ${candidate.dataType})`);

      const api: Partial<DiscoveredApi> = {
        id: crypto.randomUUID(),
        oem_id: oemId,
        source_page_id: sourcePage?.id || null,
        url: candidate.url,
        method: candidate.method as any,
        content_type: candidate.contentType,
        response_type: candidate.isJson ? 'json' : 'text',
        data_type: candidate.dataType,
        reliability_score: candidate.confidence,
        status: 'discovered',
        call_count: 1,
        error_count: 0,
        discovered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Upsert (update if URL already exists)
      const { error } = await this.config.supabaseClient
        .from('discovered_apis')
        .upsert(api, { onConflict: 'oem_id,url' });

      if (error) {
        console.error(`[Orchestrator] Failed to store API ${candidate.url}:`, error);
      }
    }
  }

  private async checkRenderBudget(oemId: OemId): Promise<{ allowed: boolean; reason?: string }> {
    // Get current month's render count for this OEM
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count, error } = await this.config.supabaseClient
      .from('design_captures')
      .select('*', { count: 'exact', head: true })
      .eq('oem_id', oemId)
      .gte('created_at', startOfMonth.toISOString());

    if (error) {
      console.warn('[Orchestrator] Failed to check render budget:', error);
      return { allowed: true }; // Allow on error
    }

    return this.scheduler.checkRenderBudget(oemId, count || 0, count || 0);
  }

  private async runLlmExtraction(
    html: string,
    oemId: OemId,
    page: SourcePage
  ): Promise<Partial<CrawlResult>> {
    const prompt = `
Extract structured automotive data from this HTML page.

OEM: ${oemId}
Page Type: ${page.page_type}
URL: ${page.url}

Return JSON with:
- products: Array of {title, price, availability, body_type, fuel_type}
- offers: Array of {title, description, validity}
- banner_slides: Array of {position, headline, cta_text, image_url}

HTML (truncated):
${html.substring(0, 50000)}
`;

    const response = await this.config.aiRouter.route({
      taskType: 'llm_extraction',
      prompt,
      oemId,
      requireJson: true,
    });

    try {
      return JSON.parse(response.content);
    } catch {
      return {};
    }
  }

  private mergeLlmResults(
    extractionResult: PageExtractionResult,
    llmResult: Partial<CrawlResult>
  ): PageExtractionResult {
    return {
      ...extractionResult,
      products: {
        data: llmResult.products || extractionResult.products.data,
        confidence: extractionResult.products.confidence,
        method: 'llm' as const,
        coverage: extractionResult.products.coverage,
      },
      offers: {
        data: llmResult.offers || extractionResult.offers.data,
        confidence: extractionResult.offers.confidence,
        method: 'llm' as const,
        coverage: extractionResult.offers.coverage,
      },
      bannerSlides: {
        data: llmResult.banner_slides || extractionResult.bannerSlides.data,
        confidence: extractionResult.bannerSlides.confidence,
        method: 'llm' as const,
        coverage: extractionResult.bannerSlides.coverage,
      },
    };
  }

  private async processChanges(
    oemId: OemId,
    page: SourcePage,
    extractionResult: PageExtractionResult
  ): Promise<void> {
    // Process products
    if (extractionResult.products?.data) {
      console.log(`[Orchestrator] Processing ${extractionResult.products.data.length} products for ${page.url}`);
      for (const extractedProduct of extractionResult.products.data) {
        try {
          await this.upsertProduct(oemId, page.url, extractedProduct);
          console.log(`[Orchestrator] Upserted product: ${extractedProduct.title}`);
        } catch (error) {
          console.error(`[Orchestrator] Failed to upsert product ${extractedProduct.title}:`, error);
        }
      }
    }

    // Process offers
    if (extractionResult.offers?.data) {
      for (const extractedOffer of extractionResult.offers.data) {
        await this.upsertOffer(oemId, page.url, extractedOffer);
      }
    }

    // Process banners
    if (extractionResult.bannerSlides?.data) {
      for (const slide of extractionResult.bannerSlides.data) {
        await this.upsertBanner(oemId, page.url, slide);
      }
    }
  }

  private async upsertProduct(
    oemId: OemId,
    sourceUrl: string,
    productData: any
  ): Promise<void> {
    // Check for existing product
    // Match by oem_id + title (multiple products can come from same source_url)
    const { data: existing } = await this.config.supabaseClient
      .from('products')
      .select('*')
      .eq('oem_id', oemId)
      .eq('title', productData.title)
      .maybeSingle();

    // Use database column names (meta_json, not meta)
    const product: Record<string, any> = {
      oem_id: oemId,
      source_url: sourceUrl,
      title: productData.title,
      subtitle: productData.subtitle,
      body_type: productData.body_type,
      fuel_type: productData.fuel_type,
      availability: productData.availability || 'available',
      price_amount: productData.price?.amount,
      price_currency: productData.price?.currency || 'AUD',
      price_type: productData.price?.type,
      price_raw_string: productData.price?.raw_string,
      disclaimer_text: productData.disclaimer_text,
      key_features: productData.key_features || [],
      variants: productData.variants || [],
      cta_links: productData.cta_links || [],
      meta_json: productData.meta || {}, // Database column is meta_json
      last_seen_at: new Date().toISOString(),
    };

    if (existing) {
      // Detect changes
      const analysis = this.changeDetector.detectProductChanges(existing, product as Product);
      
      if (analysis) {
        // Update product
        await this.config.supabaseClient
          .from('products')
          .update(product)
          .eq('id', existing.id);

        // Create version record
        await this.config.supabaseClient
          .from('product_versions')
          .insert({
            product_id: existing.id,
            oem_id: oemId,
            snapshot_json: product,
            content_hash: '', // Would compute proper hash
          });

        // Create change event
        await this.createChangeEvent(oemId, analysis);

        // Queue alert
        this.alertBatcher.add(analysis, oemId);
      }
    } else {
      // New product
      product.id = crypto.randomUUID();
      // Note: first_seen_at doesn't exist in schema, using created_at (auto-set by DB)

      const { error } = await this.config.supabaseClient
        .from('products')
        .insert(product);

      if (error) {
        console.error(`[Orchestrator] Failed to insert product ${product.title}:`, error);
        throw error;
      }
      console.log(`[Orchestrator] Inserted new product: ${product.title} (${product.id})`);

      // Create change event for new product
      const analysis = this.changeDetector.detectProductChanges(null, product as Product);
      if (analysis) {
        await this.createChangeEvent(oemId, analysis);
        this.alertBatcher.add(analysis, oemId);
      }
    }
  }

  private async upsertOffer(
    oemId: OemId,
    sourceUrl: string,
    offerData: any
  ): Promise<void> {
    // Similar to upsertProduct
    // ... implementation
  }

  private async upsertBanner(
    oemId: OemId,
    pageUrl: string,
    slideData: any
  ): Promise<void> {
    // ... implementation
  }

  private async createChangeEvent(
    oemId: OemId,
    analysis: any
  ): Promise<void> {
    const event: Partial<ChangeEvent> = {
      id: crypto.randomUUID(),
      oem_id: oemId,
      entity_type: analysis.entityType,
      entity_id: analysis.entityId,
      event_type: analysis.eventType,
      severity: analysis.severity,
      summary: analysis.summary,
      diff_json: analysis.fieldChanges,
      created_at: new Date().toISOString(),
    };

    await this.config.supabaseClient
      .from('change_events')
      .insert(event);
  }

  private async sendBatchedAlerts(oemId: OemId): Promise<void> {
    // Send hourly batch
    const hourlyBatch = this.alertBatcher.getHourlyBatch(oemId);
    if (hourlyBatch.length > 0) {
      // TODO: Send Slack batch message
      this.alertBatcher.clearHourly(oemId);
    }
  }

  private async updateSourcePage(
    page: SourcePage,
    htmlHash: string,
    wasRendered: boolean
  ): Promise<void> {
    const updates = this.scheduler.updateAfterCrawl(
      page,
      htmlHash !== page.last_hash,
      wasRendered
    );

    await this.config.supabaseClient
      .from('source_pages')
      .update(updates)
      .eq('id', page.id);
  }

  private async updateSourcePageError(page: SourcePage, error: string): Promise<void> {
    await this.config.supabaseClient
      .from('source_pages')
      .update({
        status: 'error',
        error_message: error,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', page.id);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get cost estimates for all OEMs.
   */
  getCostEstimates(): Array<{
    oemId: OemId;
    pagesMonitored: number;
    estimatedMonthlyCost: number;
  }> {
    const estimates: Array<{ oemId: OemId; pagesMonitored: number; estimatedMonthlyCost: number }> = [];
    // Would fetch actual page counts and calculate
    return estimates;
  }

  /**
   * Trigger a manual crawl for a specific OEM.
   */
  async triggerManualCrawl(oemId: OemId): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.crawlOem(oemId);
      return {
        success: true,
        message: `Crawled ${result.jobsProcessed} pages, ${result.pagesChanged} changed, ${result.errors} errors`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Trigger a design capture for an OEM.
   */
  async triggerDesignCapture(
    oemId: OemId,
    pageType: string
  ): Promise<{ success: boolean; message: string }> {
    // Implementation would use DesignAgent
    return { success: true, message: 'Design capture triggered' };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createOrchestrator(config: {
  supabaseUrl: string;
  supabaseKey: string;
  r2Bucket: R2Bucket;
  browser: Fetcher;
  slackWebhookUrl?: string;
  groqApiKey?: string;
  togetherApiKey?: string;
  anthropicApiKey?: string;
}): OemAgentOrchestrator {
  // Create Supabase client
  const supabaseClient = {
    from: (table: string) => ({
      select: (columns: string, options?: any) => ({
        eq: (col: string, val: any) => ({
          order: (col: string, opts?: any) => ({
            limit: (n: number) => Promise.resolve({ data: [], error: null }),
          }),
          single: () => Promise.resolve({ data: null, error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
        order: (col: string, opts?: any) => ({
          limit: (n: number) => Promise.resolve({ data: [], error: null }),
        }),
      }),
      insert: (data: any) => Promise.resolve({ data: null, error: null }),
      update: (data: any) => ({
        eq: (col: string, val: any) => Promise.resolve({ data: null, error: null }),
      }),
    }),
  };

  // Create AI router
  const aiRouter = new AiRouter({
    groq: config.groqApiKey,
    together: config.togetherApiKey,
    anthropic: config.anthropicApiKey,
  });

  // Create notifier
  const notifier = config.slackWebhookUrl
    ? new MultiChannelNotifier({ slackWebhookUrl: config.slackWebhookUrl })
    : new MultiChannelNotifier({ slackWebhookUrl: '' });

  return new OemAgentOrchestrator({
    supabaseClient,
    r2Bucket: config.r2Bucket,
    browser: config.browser,
    aiRouter,
    notifier,
  });
}
