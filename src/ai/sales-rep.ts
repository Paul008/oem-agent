/**
 * Sales Rep Agent Tools
 * 
 * Implements Section 9 (Agent Sales Rep — Tool Definitions) from spec.
 * Provides tools for OEM sales representatives to access current data.
 */

import type {
  OemId,
  Product,
  Offer,
  ChangeEvent,
  BrandTokens,
  PageLayout,
  DesignCapture,
  ProductVersion,
  OfferVersion,
} from '../oem/types';

// ============================================================================
// Tool Input/Output Types
// ============================================================================

export interface GetProductsInput {
  oem_id: OemId;
  availability?: string;
  body_type?: string;
  fuel_type?: string;
}

export interface GetProductDetailInput {
  oem_id: OemId;
  product_id?: string;
  external_key?: string;
}

export interface GetOffersInput {
  oem_id: OemId;
  active_only?: boolean;
}

export interface GetOfferDetailInput {
  oem_id: OemId;
  offer_id: string;
}

export interface GetRecentChangesInput {
  oem_id: OemId;
  days?: number;
  severity?: string;
}

export interface CompareVersionsInput {
  oem_id: OemId;
  product_id: string;
  version_a: string;
  version_b: string;
}

export interface GenerateSummaryInput {
  oem_id: OemId;
  date_range: { start: string; end: string };
}

export interface DraftSocialPostInput {
  oem_id: OemId;
  topic: string;
  platform: 'facebook' | 'instagram' | 'linkedin' | 'twitter';
}

export interface DraftEdmInput {
  oem_id: OemId;
  campaign_type: 'new_model' | 'offer' | 'event' | 'clearance';
}

// ============================================================================
// Tool Results
// ============================================================================

export interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ProductListResult {
  products: Array<{
    id: string;
    title: string;
    subtitle: string | null;
    availability: string;
    price_amount: number | null;
    price_type: string | null;
    body_type: string | null;
    fuel_type: string | null;
    source_url: string;
  }>;
  count: number;
}

export interface ProductDetailResult {
  product: Product;
  images: Array<{
    r2_key: string;
    sha256: string;
    width: number | null;
    height: number | null;
  }>;
  versions: Array<{
    id: string;
    created_at: string;
    content_hash: string;
  }>;
}

export interface OfferListResult {
  offers: Array<{
    id: string;
    title: string;
    offer_type: string | null;
    price_amount: number | null;
    saving_amount: number | null;
    validity_raw_string: string | null;
    applicable_models: string[];
  }>;
  count: number;
}

export interface OfferDetailResult {
  offer: Offer;
  assets: Array<{
    r2_key: string;
    asset_type: string | null;
    sha256: string;
  }>;
  related_products: Array<{
    id: string;
    title: string;
  }>;
}

export interface RecentChangesResult {
  changes: Array<{
    id: string;
    entity_type: string;
    event_type: string;
    severity: string;
    summary: string;
    created_at: string;
  }>;
  count: number;
  by_severity: Record<string, number>;
}

export interface VersionComparisonResult {
  product_id: string;
  version_a: {
    id: string;
    captured_at: string;
    snapshot: object;
  };
  version_b: {
    id: string;
    captured_at: string;
    snapshot: object;
  };
  differences: Array<{
    field: string;
    old_value: unknown;
    new_value: unknown;
  }>;
}

export interface ChangeSummaryResult {
  summary: string;
  highlights: string[];
  price_changes: Array<{
    product: string;
    old_price: number | null;
    new_price: number | null;
  }>;
  new_products: string[];
  new_offers: string[];
}

export interface SocialPostResult {
  platform: string;
  content: string;
  hashtags: string[];
  image_suggestion: string;
}

export interface EdmResult {
  subject_line: string;
  preheader: string;
  body_html: string;
  body_text: string;
  cta_text: string;
  cta_url: string;
}

// ============================================================================
// Sales Rep Agent
// ============================================================================

export class SalesRepAgent {
  private supabaseClient: any; // Would be typed SupabaseClient

  constructor(supabaseClient: any) {
    this.supabaseClient = supabaseClient;
  }

  /**
   * Get current products for an OEM.
   * 
   * Tool: get_current_products
   */
  async getCurrentProducts(input: GetProductsInput): Promise<ToolResult<ProductListResult>> {
    try {
      // Validate oem_id scope
      this.validateOemScope(input.oem_id);

      let query = this.supabaseClient
        .from('products')
        .select('id, title, subtitle, availability, price_amount, price_type, body_type, fuel_type, source_url')
        .eq('oem_id', input.oem_id)
        .order('title');

      if (input.availability) {
        query = query.eq('availability', input.availability);
      }
      if (input.body_type) {
        query = query.eq('body_type', input.body_type);
      }
      if (input.fuel_type) {
        query = query.eq('fuel_type', input.fuel_type);
      }

      const { data, error } = await query;

      if (error) throw error;

      return {
        success: true,
        data: {
          products: data || [],
          count: data?.length || 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get detailed product information.
   * 
   * Tool: get_product_detail
   */
  async getProductDetail(input: GetProductDetailInput): Promise<ToolResult<ProductDetailResult>> {
    try {
      this.validateOemScope(input.oem_id);

      let query = this.supabaseClient
        .from('products')
        .select('*')
        .eq('oem_id', input.oem_id);

      if (input.product_id) {
        query = query.eq('id', input.product_id);
      } else if (input.external_key) {
        query = query.eq('external_key', input.external_key);
      } else {
        return { success: false, error: 'Must provide product_id or external_key' };
      }

      const { data: product, error } = await query.single();
      if (error) throw error;

      // Get images
      const { data: images } = await this.supabaseClient
        .from('product_images')
        .select('r2_key, sha256, width, height')
        .eq('product_id', product.id);

      // Get versions
      const { data: versions } = await this.supabaseClient
        .from('product_versions')
        .select('id, created_at, content_hash')
        .eq('product_id', product.id)
        .order('created_at', { ascending: false })
        .limit(5);

      return {
        success: true,
        data: {
          product,
          images: images || [],
          versions: versions || [],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get current offers for an OEM.
   * 
   * Tool: get_current_offers
   */
  async getCurrentOffers(input: GetOffersInput): Promise<ToolResult<OfferListResult>> {
    try {
      this.validateOemScope(input.oem_id);

      let query = this.supabaseClient
        .from('offers')
        .select('id, title, offer_type, price_amount, saving_amount, validity_raw_string, applicable_models')
        .eq('oem_id', input.oem_id)
        .order('created_at', { ascending: false });

      if (input.active_only !== false) {
        // Filter for active offers (no end_date or end_date in future)
        query = query.or('end_date.is.null,end_date.gte.now()');
      }

      const { data, error } = await query;

      if (error) throw error;

      return {
        success: true,
        data: {
          offers: data || [],
          count: data?.length || 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get detailed offer information.
   * 
   * Tool: get_offer_detail
   */
  async getOfferDetail(input: GetOfferDetailInput): Promise<ToolResult<OfferDetailResult>> {
    try {
      this.validateOemScope(input.oem_id);

      const { data: offer, error } = await this.supabaseClient
        .from('offers')
        .select('*')
        .eq('oem_id', input.oem_id)
        .eq('id', input.offer_id)
        .single();

      if (error) throw error;

      // Get assets
      const { data: assets } = await this.supabaseClient
        .from('offer_assets')
        .select('r2_key, asset_type, sha256')
        .eq('offer_id', offer.id);

      // Get related products
      const { data: relatedProducts } = await this.supabaseClient
        .from('offer_products')
        .select('products(id, title)')
        .eq('offer_id', offer.id);

      return {
        success: true,
        data: {
          offer,
          assets: assets || [],
          related_products: relatedProducts?.map((r: any) => r.products) || [],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get recent changes for an OEM.
   * 
   * Tool: get_recent_changes
   */
  async getRecentChanges(input: GetRecentChangesInput): Promise<ToolResult<RecentChangesResult>> {
    try {
      this.validateOemScope(input.oem_id);

      const days = input.days || 7;
      const since = new Date();
      since.setDate(since.getDate() - days);

      let query = this.supabaseClient
        .from('change_events')
        .select('id, entity_type, event_type, severity, summary, created_at')
        .eq('oem_id', input.oem_id)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false });

      if (input.severity) {
        query = query.eq('severity', input.severity);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Group by severity
      const bySeverity: Record<string, number> = {};
      data?.forEach((change: ChangeEvent) => {
        bySeverity[change.severity] = (bySeverity[change.severity] || 0) + 1;
      });

      return {
        success: true,
        data: {
          changes: data || [],
          count: data?.length || 0,
          by_severity: bySeverity,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Compare two product versions.
   * 
   * Tool: compare_product_versions
   */
  async compareProductVersions(input: CompareVersionsInput): Promise<ToolResult<VersionComparisonResult>> {
    try {
      this.validateOemScope(input.oem_id);

      const { data: versionA, error: errorA } = await this.supabaseClient
        .from('product_versions')
        .select('id, created_at, json_snapshot')
        .eq('id', input.version_a)
        .single();

      if (errorA) throw errorA;

      const { data: versionB, error: errorB } = await this.supabaseClient
        .from('product_versions')
        .select('id, created_at, json_snapshot')
        .eq('id', input.version_b)
        .single();

      if (errorB) throw errorB;

      // Calculate differences
      const differences = this.calculateDifferences(
        versionA.json_snapshot,
        versionB.json_snapshot
      );

      return {
        success: true,
        data: {
          product_id: input.product_id,
          version_a: {
            id: versionA.id,
            captured_at: versionA.created_at,
            snapshot: versionA.json_snapshot,
          },
          version_b: {
            id: versionB.id,
            captured_at: versionB.created_at,
            snapshot: versionB.json_snapshot,
          },
          differences,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate a summary of changes using LLM.
   * 
   * Tool: generate_change_summary
   */
  async generateChangeSummary(input: GenerateSummaryInput): Promise<ToolResult<ChangeSummaryResult>> {
    try {
      this.validateOemScope(input.oem_id);

      // Fetch changes in the date range
      const { data: changes, error } = await this.supabaseClient
        .from('change_events')
        .select('*')
        .eq('oem_id', input.oem_id)
        .gte('created_at', input.date_range.start)
        .lte('created_at', input.date_range.end)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Extract highlights
      const priceChanges = changes
        ?.filter((c: ChangeEvent) => c.event_type === 'price_changed')
        .map((c: ChangeEvent) => ({
          product: c.summary?.split('—')[1]?.trim() || 'Unknown',
          old_price: null, // Would parse from diff_json
          new_price: null,
        })) || [];

      const newProducts = changes
        ?.filter((c: ChangeEvent) => c.entity_type === 'product' && c.event_type === 'created')
        .map((c: ChangeEvent) => c.summary) || [];

      const newOffers = changes
        ?.filter((c: ChangeEvent) => c.entity_type === 'offer' && c.event_type === 'created')
        .map((c: ChangeEvent) => c.summary) || [];

      return {
        success: true,
        data: {
          summary: `Found ${changes?.length || 0} changes between ${input.date_range.start} and ${input.date_range.end}`,
          highlights: changes?.slice(0, 5).map((c: ChangeEvent) => c.summary || '').filter(Boolean) || [],
          price_changes: priceChanges,
          new_products: newProducts,
          new_offers: newOffers,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Draft a social media post.
   * 
   * Tool: draft_social_post
   */
  async draftSocialPost(input: DraftSocialPostInput): Promise<ToolResult<SocialPostResult>> {
    try {
      this.validateOemScope(input.oem_id);

      // Get current offers to base the post on
      const { data: offers } = await this.supabaseClient
        .from('offers')
        .select('*')
        .eq('oem_id', input.oem_id)
        .limit(3);

      const offer = offers?.[0];

      // Platform-specific formatting
      let content = '';
      const hashtags: string[] = [];

      switch (input.platform) {
        case 'facebook':
          content = offer 
            ? `🚗 ${offer.title}\n\n${offer.description || ''}\n\nLearn more: ${offer.cta_url || ''}`
            : `Check out the latest from our showroom! 🚗`;
          break;
        case 'instagram':
          content = offer
            ? `${offer.title} ✨\n\nTap the link in bio to learn more!`
            : `New arrivals in showroom 🚗✨`;
          hashtags.push('#cars', '#automotive', '#newcar');
          break;
        case 'linkedin':
          content = offer
            ? `We're excited to announce ${offer.title}. ${offer.description || ''}`
            : `Discover our latest vehicle lineup.`;
          break;
        case 'twitter':
          content = offer
            ? `${offer.title} 🚗 ${offer.cta_url || ''}`
            : `New cars in stock! 🚗`;
          break;
      }

      return {
        success: true,
        data: {
          platform: input.platform,
          content,
          hashtags,
          image_suggestion: offer?.hero_image_r2_key || 'Showroom hero image',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Draft email marketing copy.
   * 
   * Tool: draft_edm_copy
   */
  async draftEdmCopy(input: DraftEdmInput): Promise<ToolResult<EdmResult>> {
    try {
      this.validateOemScope(input.oem_id);

      // Get relevant data based on campaign type
      let subjectLine = '';
      let preheader = '';
      let bodyHtml = '';
      let ctaText = 'Learn More';
      let ctaUrl = '';

      switch (input.campaign_type) {
        case 'new_model':
          subjectLine = 'Introducing the All-New [Model Name]';
          preheader = 'Be the first to experience the future of driving';
          bodyHtml = '<h1>Meet the All-New [Model]</h1><p>We are thrilled to announce...</p>';
          ctaText = 'Explore [Model]';
          break;
        case 'offer':
          subjectLine = 'Exclusive Offer: Save on Your Next Vehicle';
          preheader = 'Limited time savings on select models';
          bodyHtml = '<h1>Special Offer</h1><p>Don\'t miss out on these incredible savings...</p>';
          ctaText = 'View Offers';
          break;
        case 'clearance':
          subjectLine = 'End of Financial Year Clearance';
          preheader = 'Massive savings on 2025 plate vehicles';
          bodyHtml = '<h1>EOFY Clearance</h1><p>Last chance for huge savings...</p>';
          ctaText = 'Shop Clearance';
          break;
        case 'event':
          subjectLine = 'You\'re Invited: Exclusive Test Drive Event';
          preheader = 'Experience our latest models firsthand';
          bodyHtml = '<h1>Test Drive Event</h1><p>Join us for an exclusive event...</p>';
          ctaText = 'RSVP Now';
          break;
      }

      return {
        success: true,
        data: {
          subject_line: subjectLine,
          preheader,
          body_html: bodyHtml,
          body_text: bodyHtml.replace(/<[^>]+>/g, ''), // Strip HTML
          cta_text: ctaText,
          cta_url: ctaUrl,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================================================
  // Design Agent Tools (Section 12.9)
  // ============================================================================

  async getBrandTokens(oemId: OemId): Promise<ToolResult<BrandTokens>> {
    try {
      this.validateOemScope(oemId);

      const { data, error } = await this.supabaseClient
        .from('brand_tokens')
        .select('tokens_json')
        .eq('oem_id', oemId)
        .eq('is_active', true)
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data.tokens_json,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getPageLayout(oemId: OemId, pageType: string): Promise<ToolResult<PageLayout>> {
    try {
      this.validateOemScope(oemId);

      const { data, error } = await this.supabaseClient
        .from('page_layouts')
        .select('layout_json')
        .eq('oem_id', oemId)
        .eq('page_type', pageType)
        .eq('is_active', true)
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data.layout_json,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private validateOemScope(oemId: OemId): void {
    // In production, this would verify the user's access to this OEM
    // based on the oem_members table
    if (!oemId) {
      throw new Error('oem_id is required');
    }
  }

  private calculateDifferences(objA: Record<string, unknown>, objB: Record<string, unknown>): Array<{ field: string; old_value: unknown; new_value: unknown }> {
    const differences: Array<{ field: string; old_value: unknown; new_value: unknown }> = [];
    const allKeys = new Set([...Object.keys(objA), ...Object.keys(objB)]);

    for (const key of allKeys) {
      const valA = objA[key];
      const valB = objB[key];

      if (JSON.stringify(valA) !== JSON.stringify(valB)) {
        differences.push({
          field: key,
          old_value: valA,
          new_value: valB,
        });
      }
    }

    return differences;
  }
}

// ============================================================================
// Tool Definitions for LLM
// ============================================================================

export const SALES_REP_TOOL_DEFINITIONS = [
  {
    name: 'get_current_products',
    description: 'Get all active products for the OEM with current pricing',
    parameters: {
      type: 'object',
      properties: {
        oem_id: { type: 'string', description: 'OEM identifier' },
        availability: { type: 'string', enum: ['available', 'coming_soon', 'limited_stock', 'run_out', 'discontinued'] },
        body_type: { type: 'string', enum: ['suv', 'sedan', 'hatch', 'ute', 'van', 'bus', 'people_mover', 'sports'] },
        fuel_type: { type: 'string', enum: ['petrol', 'diesel', 'hybrid', 'phev', 'electric'] },
      },
      required: ['oem_id'],
    },
  },
  {
    name: 'get_product_detail',
    description: 'Get full product record with variants, images, disclaimers',
    parameters: {
      type: 'object',
      properties: {
        oem_id: { type: 'string', description: 'OEM identifier' },
        product_id: { type: 'string', description: 'Product UUID' },
        external_key: { type: 'string', description: 'OEM model code/slug' },
      },
      required: ['oem_id'],
    },
  },
  {
    name: 'get_current_offers',
    description: 'Get all active offers for the OEM',
    parameters: {
      type: 'object',
      properties: {
        oem_id: { type: 'string', description: 'OEM identifier' },
        active_only: { type: 'boolean', default: true },
      },
      required: ['oem_id'],
    },
  },
  {
    name: 'get_offer_detail',
    description: 'Get full offer record with assets, disclaimers, eligibility',
    parameters: {
      type: 'object',
      properties: {
        oem_id: { type: 'string', description: 'OEM identifier' },
        offer_id: { type: 'string', description: 'Offer UUID' },
      },
      required: ['oem_id', 'offer_id'],
    },
  },
  {
    name: 'get_recent_changes',
    description: 'Get change events for the last N days',
    parameters: {
      type: 'object',
      properties: {
        oem_id: { type: 'string', description: 'OEM identifier' },
        days: { type: 'number', default: 7 },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
      },
      required: ['oem_id'],
    },
  },
  {
    name: 'compare_product_versions',
    description: 'Returns diff between two product versions',
    parameters: {
      type: 'object',
      properties: {
        oem_id: { type: 'string', description: 'OEM identifier' },
        product_id: { type: 'string', description: 'Product UUID' },
        version_a: { type: 'string', description: 'First version UUID' },
        version_b: { type: 'string', description: 'Second version UUID' },
      },
      required: ['oem_id', 'product_id', 'version_a', 'version_b'],
    },
  },
  {
    name: 'generate_change_summary',
    description: 'LLM-generated summary of what changed',
    parameters: {
      type: 'object',
      properties: {
        oem_id: { type: 'string', description: 'OEM identifier' },
        date_range: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date' },
            end: { type: 'string', format: 'date' },
          },
        },
      },
      required: ['oem_id', 'date_range'],
    },
  },
  {
    name: 'draft_social_post',
    description: 'Generates draft social media content based on current offers/products',
    parameters: {
      type: 'object',
      properties: {
        oem_id: { type: 'string', description: 'OEM identifier' },
        topic: { type: 'string', description: 'Topic or focus of the post' },
        platform: { type: 'string', enum: ['facebook', 'instagram', 'linkedin', 'twitter'] },
      },
      required: ['oem_id', 'topic', 'platform'],
    },
  },
  {
    name: 'draft_edm_copy',
    description: 'Generates email marketing copy using current offers',
    parameters: {
      type: 'object',
      properties: {
        oem_id: { type: 'string', description: 'OEM identifier' },
        campaign_type: { type: 'string', enum: ['new_model', 'offer', 'event', 'clearance'] },
      },
      required: ['oem_id', 'campaign_type'],
    },
  },
];
