/**
 * Shared types for OEM Agent skills
 * Re-exports from src/oem/types.ts for convenience
 */

export type {
  // Base types
  OemId,
  BodyType,
  FuelType,
  Availability,
  PriceType,
  OfferType,
  PageType,
  EntityType,
  EventType,
  Severity,

  // Product types
  Product,
  ProductPrice,
  ProductVariant,
  VariantColor,
  ProductCtaLink,
  ProductMeta,
  ProductImage,
  ProductVersion,
  ExtractedProduct,

  // Offer types
  Offer,
  OfferValidity,
  OfferAsset,
  OfferVersion,
  OfferProduct,
  ExtractedOffer,

  // Banner types
  Banner,
  BannerVersion,
  ExtractedBannerSlide,

  // Change events
  ChangeEvent,

  // Crawl results
  CrawlResult,
} from '../../src/oem/types';

/**
 * Result from extraction operations
 */
export interface ExtractionResult {
  products: number;
  offers: number;
  banners: number;
  changes: number;
  errors?: string[];
}

// ============================================================================
// Self-Healing Extraction Types (4-Layer Architecture)
// ============================================================================

/**
 * Extraction layer identifier
 * - L1_RESEARCH: Brave + Perplexity research phase
 * - L2_FAST_PATH: Cached selectors/APIs, no LLM
 * - L3_ADAPTIVE: Self-healing selector repair
 * - L4_DISCOVERY: Full AI-driven exploration
 */
export type ExtractionLayer = 'L1_RESEARCH' | 'L2_FAST_PATH' | 'L3_ADAPTIVE' | 'L4_DISCOVERY';

/**
 * Self-healing selector configuration
 * Stores both CSS selector AND semantic description for LLM repair
 */
export interface SelectorConfig {
  /** CSS selector for fast path extraction */
  selector: string;

  /** Semantic description for LLM repair (e.g., "Price in AUD for vehicle variant") */
  semantic: string;

  /** Last time this selector was verified working */
  lastVerified: string;

  /** Success rate (0-1) based on recent extractions */
  successRate: number;

  /** Consecutive failure count (triggers repair at threshold) */
  failureCount: number;

  /** Number of successful extractions */
  hitCount: number;

  /** Number of times LLM repair was needed */
  repairCount: number;
}

/**
 * Result of a selector repair operation
 */
export interface SelectorRepairResult {
  success: boolean;
  oldSelector: string;
  newSelector?: string;
  semantic: string;
  layer: ExtractionLayer;
  llmModel?: string;
  repairTimeMs?: number;
  error?: string;
}

/**
 * Extraction statistics for monitoring
 */
export interface ExtractionStats {
  oemId: string;
  url: string;
  timestamp: string;
  layer: ExtractionLayer;
  durationMs: number;
  selectorsUsed: number;
  selectorsFailed: number;
  selectorsRepaired: number;
  apisUsed: number;
  llmCalls: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// Discovery Types (for oem-build-price-discover skill)
// ============================================================================

/**
 * Research findings from Brave + Perplexity (Layer 1)
 */
export interface ResearchFindings {
  tech_stack?: string[];
  known_apis?: string[];
  cms_platform?: string;
  similar_oems?: string[];
  relevant_sources?: string[];
  pattern_hints?: string[];
}

/**
 * URL pattern discovered in configurator
 */
export interface DiscoveredUrlPattern {
  pattern: string;
  example: string;
  parameters: string[];
}

/**
 * API endpoint discovered via network interception
 */
export interface DiscoveredApi {
  url: string;
  method: string;
  content_type: string;
  provides: ('variants' | 'colors' | 'prices' | 'features' | 'disclaimers')[];
  sample_response?: object;
  headers_needed?: Record<string, string>;
}

/**
 * CSS selectors discovered for extraction (simple string format)
 * @deprecated Use SelfHealingSelectors for new implementations
 */
export interface DiscoveredSelectors {
  variant_cards?: string;
  variant_name?: string;
  variant_price?: string;
  variant_engine?: string;
  variant_drivetrain?: string;
  color_swatches?: string;
  color_name?: string;
  color_code?: string;
  color_price_delta?: string;
  color_swatch_image?: string;
  disclaimer?: string;
  features_list?: string;
  total_price?: string;
  price_type_label?: string;
}

/**
 * Self-healing selectors with semantic descriptions (Layer 2/3 support)
 */
export interface SelfHealingSelectors {
  variant_cards?: SelectorConfig;
  variant_name?: SelectorConfig;
  variant_price?: SelectorConfig;
  variant_engine?: SelectorConfig;
  variant_drivetrain?: SelectorConfig;
  color_swatches?: SelectorConfig;
  color_name?: SelectorConfig;
  color_code?: SelectorConfig;
  color_price_delta?: SelectorConfig;
  color_swatch_image?: SelectorConfig;
  disclaimer?: SelectorConfig;
  features_list?: SelectorConfig;
  total_price?: SelectorConfig;
  price_type_label?: SelectorConfig;
}

/**
 * Default semantic descriptions for selector types
 */
export const SELECTOR_SEMANTICS: Record<keyof SelfHealingSelectors, string> = {
  variant_cards: 'Container element for each vehicle variant/trim card',
  variant_name: 'Name of the vehicle variant or trim level',
  variant_price: 'Price in local currency for the vehicle variant',
  variant_engine: 'Engine specification text (e.g., "2.0L Turbo")',
  variant_drivetrain: 'Drivetrain type (e.g., "AWD", "FWD", "4WD")',
  color_swatches: 'Container for color selection swatches',
  color_name: 'Name of the selected color (e.g., "Aurora Black Pearl")',
  color_code: 'OEM color code (e.g., "WK")',
  color_price_delta: 'Additional cost for this color option',
  color_swatch_image: 'Color swatch image element or URL',
  disclaimer: 'Legal disclaimer text for pricing or offers',
  features_list: 'List of features included in this variant',
  total_price: 'Total configured price including all options',
  price_type_label: 'Price type indicator (e.g., "Drive Away", "RRP")',
};

/**
 * Full discovery result for an OEM (4-Layer Architecture)
 */
export interface DiscoveryResult {
  oem_id: string;
  discovered_at: string;
  entry_url: string;

  /** URL patterns for configurator navigation */
  url_patterns: {
    model_index?: DiscoveredUrlPattern;
    variant_selection?: DiscoveredUrlPattern;
    color_selection?: DiscoveredUrlPattern;
    options_selection?: DiscoveredUrlPattern;
    summary?: DiscoveredUrlPattern;
  };

  /** Direct API endpoints (Layer 2 fast path) */
  apis: DiscoveredApi[];

  /** Legacy simple selectors (backward compatibility) */
  selectors: DiscoveredSelectors;

  /** Self-healing selectors with semantic descriptions (Layer 2/3) */
  selfHealingSelectors?: SelfHealingSelectors;

  /** Extraction strategy */
  strategy: {
    primary: 'api' | 'dom' | 'hybrid';
    requires_js_render: boolean;
    requires_interaction: boolean;
    interaction_steps?: string[];
  };

  /** Research findings (Layer 1) */
  research?: ResearchFindings;

  /** Screenshots captured during discovery */
  screenshots?: string[];

  /** Sample extracted data for validation */
  sample_data?: {
    variants?: object[];
    colors?: object[];
  };

  /** Models discovered on entry page */
  models_found: string[];

  /** Number of variants analyzed */
  variants_analyzed: number;

  /** Errors encountered during discovery */
  errors?: string[];

  /** Extraction statistics */
  stats?: {
    totalExtractions: number;
    successfulExtractions: number;
    selectorRepairs: number;
    avgExtractionTimeMs: number;
    lastExtraction?: string;
    lastSuccessfulExtraction?: string;
  };
}
