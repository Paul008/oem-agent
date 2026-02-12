/**
 * Design Agent
 * 
 * Implements Section 12 (Design Agent — OEM Brand Capture & Page Layout Extraction)
 * from spec. Uses Kimi K2.5 Vision API for brand token extraction.
 */

import type {
  OemId,
  BrandTokens,
  PageLayout,
  DesignCapture,
  DesignCaptureTrigger,
  BrandColors,
  BrandTypography,
  BrandSpacing,
  BrandBorders,
  BrandShadows,
  ButtonStyle,
  BrandComponents,
  TypographyEntry,
} from '../oem/types';
import { getOemDefinition } from '../oem/registry';
import { AI_ROUTER_CONFIG } from '../ai/router';

// ============================================================================
// Design Capture Configuration
// ============================================================================

export interface DesignCaptureConfig {
  // Screenshot dimensions
  desktopWidth: number;
  mobileWidth: number;
  tabletWidth: number;
  
  // pHash threshold for triggering re-capture (30% per spec)
  phashChangeThreshold: number;
  
  // Pages to capture per OEM
  pageTypes: Array<'homepage' | 'vehicle_detail' | 'vehicle_range' | 'offers'>;
  
  // Capture schedule
  quarterlyMonthDays: number[]; // e.g., [1, 91, 182, 273] - start of each quarter
}

export const DEFAULT_DESIGN_CONFIG: DesignCaptureConfig = {
  desktopWidth: 1440,
  mobileWidth: 390,
  tabletWidth: 768,
  phashChangeThreshold: 0.30,
  pageTypes: ['homepage', 'vehicle_detail', 'offers'],
  quarterlyMonthDays: [1, 91, 182, 273], // Approximate start of quarters
};

// ============================================================================
// Kimi K2.5 Prompts (Section 12.3)
// ============================================================================

export function generateBrandTokenExtractionPrompt(
  oemId: OemId,
  pageUrls: string[]
): string {
  const oemDef = getOemDefinition(oemId);
  
  return `Analyse these screenshots from ${oemDef?.name || oemId}'s Australian website. 

Extract the complete brand design system as JSON including:
- Primary/secondary/accent colours (hex)
- Typography (font families, sizes, weights for headings/body/captions)
- Spacing scale (padding/margin values in px)
- Border-radius values
- Button styles (fill, outline, text variants)
- Card component patterns
- Hero component patterns
- Any signature visual treatments (gradients, overlays, shadows)

Source pages: ${pageUrls.join(', ')}

Respond with valid JSON matching this schema:
{
  "oem_id": "${oemId}",
  "version": 1,
  "captured_at": "ISO8601 timestamp",
  "source_pages": ["url1", "url2"],
  "colors": {
    "primary": "#BB162B",
    "secondary": "#000000",
    "accent": "#FFFFFF",
    "background": "#FFFFFF",
    "surface": "#F5F5F5",
    "text_primary": "#000000",
    "text_secondary": "#666666",
    "text_on_primary": "#FFFFFF",
    "border": "#E0E0E0",
    "error": "#DC3545",
    "success": "#28A745",
    "cta_fill": "#BB162B",
    "cta_text": "#FFFFFF",
    "cta_hover": "#990000"
  },
  "typography": {
    "font_primary": "KiaSignature, Helvetica, Arial, sans-serif",
    "font_secondary": null,
    "font_mono": null,
    "font_cdn_urls": [],
    "scale": {
      "display": { "fontSize": "48px", "fontWeight": 700 },
      "h1": { "fontSize": "36px", "fontWeight": 700 },
      "h2": { "fontSize": "28px", "fontWeight": 600 },
      "h3": { "fontSize": "24px", "fontWeight": 600 },
      "h4": { "fontSize": "20px", "fontWeight": 600 },
      "body_large": { "fontSize": "18px", "fontWeight": 400 },
      "body": { "fontSize": "16px", "fontWeight": 400 },
      "body_small": { "fontSize": "14px", "fontWeight": 400 },
      "caption": { "fontSize": "12px", "fontWeight": 400 },
      "price": { "fontSize": "24px", "fontWeight": 700 },
      "disclaimer": { "fontSize": "11px", "fontWeight": 400 },
      "cta": { "fontSize": "16px", "fontWeight": 600 },
      "nav": { "fontSize": "14px", "fontWeight": 500 }
    }
  },
  "spacing": {
    "unit": 8,
    "scale": { "xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32, "2xl": 48, "3xl": 64 },
    "section_gap": 64,
    "container_max_width": 1440,
    "container_padding": 24
  },
  "borders": {
    "radius_sm": "4px",
    "radius_md": "8px",
    "radius_lg": "16px",
    "radius_full": "9999px",
    "width_default": "1px",
    "color_default": "#E0E0E0"
  },
  "shadows": {
    "sm": "0 1px 2px rgba(0,0,0,0.05)",
    "md": "0 4px 6px rgba(0,0,0,0.1)",
    "lg": "0 10px 15px rgba(0,0,0,0.1)"
  },
  "buttons": {
    "primary": {
      "background": "#BB162B",
      "color": "#FFFFFF",
      "border": "none",
      "border_radius": "8px",
      "padding": "12px 24px",
      "font_size": "16px",
      "font_weight": 600,
      "text_transform": null,
      "hover_background": "#990000",
      "hover_color": "#FFFFFF"
    }
  },
  "components": {
    "card": {
      "background": "#FFFFFF",
      "border_radius": "8px",
      "shadow": "0 4px 6px rgba(0,0,0,0.1)",
      "padding": "24px",
      "hover_shadow": "0 10px 15px rgba(0,0,0,0.1)"
    },
    "hero": {
      "min_height_desktop": "600px",
      "min_height_mobile": "400px",
      "overlay": "linear-gradient(to bottom, rgba(0,0,0,0.3), transparent)",
      "text_alignment": "left"
    },
    "nav": {
      "height": "64px",
      "background": "#FFFFFF",
      "text_color": "#000000",
      "sticky": true
    }
  },
  "animations": {
    "transition_default": "all 0.3s ease",
    "carousel_transition": "transform 0.5s ease",
    "hover_scale": "scale(1.02)"
  }
}`;
}

export function generatePageLayoutPrompt(
  oemId: OemId,
  pageType: string,
  pageUrl: string
): string {
  const oemDef = getOemDefinition(oemId);
  
  return `Decompose this ${oemDef?.name || oemId} ${pageType} page into a hierarchical component tree.

Source URL: ${pageUrl}

For each component identify:
- type (hero_banner, vehicle_intro, spec_table, offer_tiles, etc.)
- position/dimensions
- flex/grid layout properties
- background treatment
- content_slots (headline, image, price, cta, etc.)

Return page_layout.v1 JSON with responsive breakpoints for desktop (1440px), tablet (768px), mobile (390px).

{
  "oem_id": "${oemId}",
  "page_type": "${pageType}",
  "source_url": "${pageUrl}",
  "captured_at": "ISO8601 timestamp",
  "version": 1,
  "viewport": {
    "desktop_width": 1440,
    "tablet_width": 768,
    "mobile_width": 390
  },
  "page_meta": {
    "background_color": "#FFFFFF",
    "max_content_width": 1440,
    "uses_full_bleed": true
  },
  "sections": [
    {
      "id": "hero",
      "type": "hero_carousel",
      "layout": {
        "display": "flex",
        "direction": "column",
        "justify": "center",
        "align": "flex-start",
        "gap": "24px",
        "width": "100%",
        "min_height": "600px",
        "padding": "0 24px",
        "full_bleed": true
      },
      "style": {
        "background": "#000000",
        "background_image": "url(...)",
        "overlay": "linear-gradient(...)",
        "border_bottom": null,
        "box_shadow": null
      },
      "responsive": {
        "tablet": { "min_height": "500px" },
        "mobile": { "min_height": "400px" }
      },
      "content_slots": {
        "headline": {
          "slot_type": "text",
          "data_binding": "hero.headline",
          "style": { "color": "#FFFFFF", "fontSize": "48px" },
          "fallback": "Welcome"
        },
        "cta": {
          "slot_type": "cta_button",
          "data_binding": "hero.cta",
          "style": { "variant": "primary" }
        }
      },
      "components": []
    }
  ]
}`;
}

// ============================================================================
// Design Agent Class
// ============================================================================

export interface CaptureJob {
  oemId: OemId;
  pageUrl: string;
  pageType: string;
  trigger: DesignCaptureTrigger;
}

export interface CaptureResult {
  success: boolean;
  designCapture?: DesignCapture;
  brandTokens?: BrandTokens;
  pageLayout?: PageLayout;
  error?: string;
}

export class DesignAgent {
  private config: DesignCaptureConfig;
  private togetherApiKey: string;
  private r2Bucket: R2Bucket;

  constructor(
    togetherApiKey: string,
    r2Bucket: R2Bucket,
    config: Partial<DesignCaptureConfig> = {}
  ) {
    this.togetherApiKey = togetherApiKey;
    this.r2Bucket = r2Bucket;
    this.config = { ...DEFAULT_DESIGN_CONFIG, ...config };
  }

  /**
   * Determine if a design capture should be triggered.
   * 
   * From spec Section 12.5 Capture Schedule & Triggers.
   */
  shouldCapture(
    oemId: OemId,
    pageUrl: string,
    trigger: DesignCaptureTrigger,
    lastCapture: DesignCapture | null,
    currentPhash: string
  ): { shouldCapture: boolean; reason: string } {
    // Always capture on initial or manual trigger
    if (trigger === 'initial' || trigger === 'manual') {
      return { shouldCapture: true, reason: `Trigger: ${trigger}` };
    }

    // Quarterly audit trigger
    if (trigger === 'quarterly_audit') {
      return { shouldCapture: true, reason: 'Quarterly design audit' };
    }

    // Visual change trigger - check pHash distance
    if (trigger === 'visual_change' && lastCapture?.phash_desktop) {
      const distance = this.calculatePhashDistance(lastCapture.phash_desktop, currentPhash);
      
      if (distance > this.config.phashChangeThreshold) {
        return { 
          shouldCapture: true, 
          reason: `Visual change detected (pHash distance: ${(distance * 100).toFixed(1)}%)` 
        };
      }
      
      return { 
        shouldCapture: false, 
        reason: `No significant visual change (pHash distance: ${(distance * 100).toFixed(1)}%)` 
      };
    }

    return { shouldCapture: false, reason: 'No trigger condition met' };
  }

  /**
   * Execute a design capture job.
   * 
   * This would:
   * 1. Take screenshots (desktop + mobile)
   * 2. Extract computed CSS
   * 3. Call Kimi K2.5 for brand token extraction
   * 4. Call Kimi K2.5 for page layout decomposition
   * 5. Store results in R2 and Supabase
   */
  async executeCapture(job: CaptureJob): Promise<CaptureResult> {
    try {
      // Step 1: Capture screenshots and DOM
      const screenshots = await this.captureScreenshots(job.pageUrl);
      
      // Step 2: Upload to R2
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const r2Prefix = `oem/${job.oemId}/design_captures/${job.pageType}/${timestamp}`;
      
      const screenshotDesktopKey = `${r2Prefix}/screenshot_desktop.png`;
      const screenshotMobileKey = `${r2Prefix}/screenshot_mobile.png`;
      
      await this.r2Bucket.put(screenshotDesktopKey, screenshots.desktop);
      await this.r2Bucket.put(screenshotMobileKey, screenshots.mobile);

      // Step 3: Extract brand tokens (Pass 1)
      const brandTokens = await this.extractBrandTokens(
        job.oemId,
        [job.pageUrl],
        screenshots.desktop
      );

      // Step 4: Extract page layout (Pass 2)
      const pageLayout = await this.extractPageLayout(
        job.oemId,
        job.pageType,
        job.pageUrl,
        screenshots.desktop,
        screenshots.mobile
      );

      // Step 5: Create design capture record
      const designCapture: DesignCapture = {
        id: crypto.randomUUID(),
        oem_id: job.oemId,
        page_url: job.pageUrl,
        page_type: job.pageType,
        trigger_type: job.trigger,
        screenshot_desktop_r2_key: screenshotDesktopKey,
        screenshot_mobile_r2_key: screenshotMobileKey,
        dom_snapshot_r2_key: null,
        computed_styles_r2_key: null,
        phash_desktop: screenshots.phashDesktop,
        phash_mobile: screenshots.phashMobile,
        phash_distance_from_previous: null,
        kimi_request_tokens: null,
        kimi_response_tokens: null,
        kimi_cost_usd: null,
        brand_tokens_id: null,
        page_layout_id: null,
        status: 'completed',
        error_message: null,
        captured_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      return {
        success: true,
        designCapture,
        brandTokens,
        pageLayout,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract brand tokens using Kimi K2.5 Vision.
   * 
   * Pass 1 from spec Section 12.3.
   */
  private async extractBrandTokens(
    oemId: OemId,
    pageUrls: string[],
    screenshot: Uint8Array
  ): Promise<BrandTokens> {
    const prompt = generateBrandTokenExtractionPrompt(oemId, pageUrls);
    
    // Convert screenshot to base64
    const base64Image = btoa(String.fromCharCode(...screenshot));

    const response = await fetch(`${AI_ROUTER_CONFIG.kimi_k2_5.api_base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.togetherApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_ROUTER_CONFIG.kimi_k2_5.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        ...AI_ROUTER_CONFIG.kimi_k2_5.thinking_mode_params,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`Kimi K2.5 API error: ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('Empty response from Kimi K2.5');
    }

    return JSON.parse(content) as BrandTokens;
  }

  /**
   * Extract page layout using Kimi K2.5 Vision.
   * 
   * Pass 2 from spec Section 12.3.
   */
  private async extractPageLayout(
    oemId: OemId,
    pageType: string,
    pageUrl: string,
    desktopScreenshot: Uint8Array,
    mobileScreenshot: Uint8Array
  ): Promise<PageLayout> {
    const prompt = generatePageLayoutPrompt(oemId, pageType, pageUrl);
    
    // Convert screenshots to base64
    const base64Desktop = btoa(String.fromCharCode(...desktopScreenshot));
    const base64Mobile = btoa(String.fromCharCode(...mobileScreenshot));

    const response = await fetch(`${AI_ROUTER_CONFIG.kimi_k2_5.api_base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.togetherApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_ROUTER_CONFIG.kimi_k2_5.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${base64Desktop}` },
              },
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${base64Mobile}` },
              },
            ],
          },
        ],
        ...AI_ROUTER_CONFIG.kimi_k2_5.default_params,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`Kimi K2.5 API error: ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('Empty response from Kimi K2.5');
    }

    return JSON.parse(content) as PageLayout;
  }

  /**
   * Capture screenshots of a page.
   * 
   * In production, this would use Browser Rendering or Playwright.
   */
  private async captureScreenshots(pageUrl: string): Promise<{
    desktop: Uint8Array;
    mobile: Uint8Array;
    phashDesktop: string;
    phashMobile: string;
  }> {
    // Placeholder - would integrate with Browser Rendering API
    // For now, return empty buffers
    return {
      desktop: new Uint8Array(),
      mobile: new Uint8Array(),
      phashDesktop: '',
      phashMobile: '',
    };
  }

  /**
   * Calculate perceptual hash distance between two images.
   * 
   * Uses simplified pHash comparison. In production, use a proper
   * perceptual hashing library.
   */
  private calculatePhashDistance(hash1: string, hash2: string): number {
    if (!hash1 || !hash2) return 0;
    if (hash1.length !== hash2.length) return 1;

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) {
        distance++;
      }
    }

    return distance / hash1.length;
  }

  /**
   * Estimate cost for a full OEM capture.
   * 
   * From spec Section 12.5:
   * - ~$0.17 per OEM for full capture
   */
  estimateCaptureCost(pageCount: number = 5): number {
    // Kimi K2.5: $0.60/M input, $2.50/M output
    // Average ~5K input tokens + ~3K output tokens per call
    // 3 passes × ~5 pages = ~15 API calls
    
    const callsPerPage = 3; // brand tokens, layout, component details
    const totalCalls = pageCount * callsPerPage;
    
    const inputTokens = 5000 * totalCalls;
    const outputTokens = 3000 * totalCalls;
    
    const inputCost = (inputTokens / 1_000_000) * AI_ROUTER_CONFIG.kimi_k2_5.cost_per_m_input;
    const outputCost = (outputTokens / 1_000_000) * AI_ROUTER_CONFIG.kimi_k2_5.cost_per_m_output;
    
    return inputCost + outputCost;
  }
}

// ============================================================================
// pHash Utilities
// ============================================================================

/**
 * Generate a simple perceptual hash for an image.
 * 
 * In production, use a proper pHash implementation like:
 * - phash-wasm
 * - blockhash-js
 * - sharp with resize + grayscale
 */
export async function generatePhash(imageData: Uint8Array): Promise<string> {
  // Placeholder - return a random hash
  // In production, implement proper pHash
  const hash = new Uint8Array(16);
  crypto.getRandomValues(hash);
  return Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// Per-OEM Brand Identity Notes (Section 12.6)
// ============================================================================

export const OEM_BRAND_NOTES: Record<OemId, { colors: string[]; notes: string }> = {
  'kia-au': {
    colors: ['#BB162B'], // Kia red
    notes: 'Custom "KiaSignature" font, clean high-contrast design, full-bleed hero images',
  },
  'nissan-au': {
    colors: ['#C3002F'], // Nissan red
    notes: 'NissanBrand custom font, bold vehicle imagery, postcode-gated pricing',
  },
  'ford-au': {
    colors: ['#003478'], // Ford blue
    notes: 'FordAntenna font, billboard-style hero, blue CTAs, "Important Info" disclaimer pattern',
  },
  'volkswagen-au': {
    colors: ['#001E50'], // VW blue
    notes: 'VWHead/VWText fonts, minimal design, SVG placeholder pattern, SPA-heavy',
  },
  'mitsubishi-au': {
    colors: ['#ED0000'], // Mitsubishi red
    notes: 'MMC custom font, Diamond Advantage green branding, horizontal scrollable carousel',
  },
  'ldv-au': {
    colors: ['#003DA5'], // LDV blue
    notes: 'System fonts, strong commercial vehicle focus, structured price guide',
  },
  'isuzu-au': {
    colors: ['#C00000'], // Isuzu red
    notes: 'Deep page structure per model, spec PDF downloads, I-Venture Club branding',
  },
  'mazda-au': {
    colors: ['#910A2A'], // Mazda deep red
    notes: 'MazdaType font, elegant premium feel, blurred placeholder images, 50/50 blocks',
  },
  'kgm-au': {
    colors: ['#00263A', '#F26522'], // KGM teal + orange
    notes: 'Modern Next.js site, factory bonus text overlays, extensive disclaimers, 7-year warranty',
  },
  'gwm-au': {
    colors: ['#1A1E2E', '#E41D1A'], // GWM navy + red
    notes: 'Multi-sub-brand (Haval, Tank, Cannon, Ora, Wey), Storyblok CMS, category-based grids',
  },
  'suzuki-au': {
    colors: ['#003DA5'], // Suzuki blue
    notes: 'Compact efficient design, /vehicles/future/ page, Jimny distinct adventurous styling',
  },
  'hyundai-au': {
    colors: ['#002C5F'], // Hyundai dark blue
    notes: 'HyundaiSans font, three design sub-systems (mainstream, N performance, IONIQ EV)',
  },
  'toyota-au': {
    colors: ['#EB0A1E'], // Toyota red
    notes: 'ToyotaType font, pragmatic information-dense, GR performance sub-brand, hybrid badges',
  },
};
