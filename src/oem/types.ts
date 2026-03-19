/**
 * OEM Entity Types
 * 
 * TypeScript definitions matching the crawl-config-v1.2 specification
 * for the Multi-OEM AI Agent system.
 */

// ============================================================================
// Base Types
// ============================================================================

/** Built-in OEM identifiers for the 17 pre-configured Australian OEMs. */
export type BuiltInOemId =
  | 'kia-au'
  | 'nissan-au'
  | 'ford-au'
  | 'volkswagen-au'
  | 'mitsubishi-au'
  | 'ldv-au'
  | 'isuzu-au'
  | 'mazda-au'
  | 'kgm-au'
  | 'gwm-au'
  | 'suzuki-au'
  | 'hyundai-au'
  | 'toyota-au'
  | 'subaru-au'
  | 'gmsv-au'
  | 'foton-au'
  | 'gac-au';

/**
 * Accepts both built-in and dynamically onboarded OEM IDs (e.g. 'cherry-au').
 * The `(string & {})` branch preserves autocomplete for known IDs while
 * allowing any valid string at runtime.
 */
export type OemId = BuiltInOemId | (string & {});

export type BodyType = 'suv' | 'sedan' | 'hatch' | 'ute' | 'van' | 'bus' | 'people_mover' | 'sports' | 'cab_chassis' | 'campervan' | null;
export type FuelType = 'petrol' | 'diesel' | 'hybrid' | 'phev' | 'electric' | null;
export type Availability = 'available' | 'coming_soon' | 'limited_stock' | 'run_out' | 'discontinued';
export type PriceType = 'driveaway' | 'from' | 'rrp' | 'weekly' | 'monthly' | 'per_week' | 'per_month' | 'mrlp';
export type OfferType = 'price_discount' | 'driveaway_deal' | 'finance_rate' | 'bonus_accessory' | 'cashback' | 'free_servicing' | 'plate_clearance' | 'factory_bonus' | 'free_charger' | 'other';
export type PageType = 'homepage' | 'vehicle' | 'offers' | 'news' | 'sitemap' | 'price_guide' | 'category' | 'build_price' | 'other';
export type EntityType = 'product' | 'offer' | 'banner' | 'sitemap' | 'page';
export type EventType = 'created' | 'updated' | 'removed' | 'price_changed' | 'disclaimer_changed' | 'image_changed' | 'availability_changed' | 'new_url_discovered';
export type Severity = 'critical' | 'high' | 'medium' | 'low';

// ============================================================================
// OEM Configuration
// ============================================================================

export interface OemConfig {
  homepage: string;
  vehicles_index?: string;
  offers: string;
  news?: string;
  schedule: CrawlSchedule;
  render_config?: {
    set_postcode?: string;
  };
  render_required?: PageType[];
  sub_brands?: string[];
}

export interface CrawlSchedule {
  homepage_minutes: number;
  offers_minutes: number;
  vehicles_minutes: number;
  news_minutes: number;
}

export interface Oem {
  id: OemId;
  name: string;
  base_url: string;
  config_json: OemConfig;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Products
// ============================================================================

export interface ProductPrice {
  amount: number | null;
  currency: string;
  type: PriceType | null;
  raw_string: string | null;
  qualifier: string | null;
}

export interface VariantColor {
  name: string;                    // e.g., "Aurora Black Pearl"
  code: string | null;             // e.g., "WK" (OEM color code)
  hex: string | null;              // e.g., "#1a1a1a" (for UI display)
  swatch_url: string | null;       // URL to color swatch image
  price_delta: number | null;      // Additional cost for this color (0 for standard, e.g., 695 for metallic)
  is_standard: boolean;            // true if included in base price
}

export interface ProductVariant {
  name: string;
  price_amount: number | null;
  price_type: PriceType | null;
  drivetrain: string | null;
  engine: string | null;
  colors: VariantColor[];          // Available colors for this variant
  disclaimer_text: string | null;  // Variant-specific disclaimer
}

export interface ProductCtaLink {
  text: string;
  url: string;
}

export interface ProductMeta {
  page_title?: string;
  meta_description?: string;
  og_image?: string;
  json_ld?: object | null;
}

export interface Product {
  id: string; // UUID
  oem_id: OemId;
  source_url: string;
  external_key: string | null;
  title: string;
  subtitle: string | null;
  body_type: BodyType;
  fuel_type: FuelType;
  availability: Availability;
  price_amount: number | null;
  price_currency: string;
  price_type: PriceType | null;
  price_raw_string: string | null;
  price_qualifier: string | null;
  disclaimer_text: string | null;
  primary_image_r2_key: string | null;
  gallery_image_count: number;
  // Vehicle specifications
  engine_size: string | null;
  cylinders: number | null;
  transmission: string | null;
  gears: number | null;
  drive: string | null;
  doors: number | null;
  seats: number | null;
  // OEM marketing features (e.g., "Apple CarPlay", "Blind Spot Monitor")
  key_features: string[];
  cta_links: ProductCtaLink[];
  variants: ProductVariant[];
  meta: ProductMeta;
  content_hash: string | null;
  current_version_id: string | null; // UUID
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string; // UUID
  product_id: string; // UUID
  oem_id: OemId;
  r2_key: string;
  sha256: string;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  sort_order: number;
  source_image_url: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface ProductVersion {
  id: string; // UUID
  product_id: string; // UUID
  oem_id: OemId;
  import_run_id: string | null; // UUID
  content_hash: string;
  json_snapshot: object;
  diff_summary: string | null;
  diff_fields: string[] | null;
  created_at: string;
}

// ============================================================================
// Offers
// ============================================================================

export interface OfferValidity {
  start_date: string | null;
  end_date: string | null;
  raw_string: string | null;
}

export interface Offer {
  id: string; // UUID
  oem_id: OemId;
  source_url: string;
  external_key: string | null;
  title: string;
  description: string | null;
  offer_type: OfferType | null;
  applicable_models: string[];
  price_amount: number | null;
  price_currency: string;
  price_type: PriceType | null;
  price_raw_string: string | null;
  saving_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  validity_raw_string: string | null;
  cta_text: string | null;
  cta_url: string | null;
  hero_image_r2_key: string | null;
  disclaimer_text: string | null;
  disclaimer_html: string | null;
  eligibility: string | null;
  content_hash: string | null;
  current_version_id: string | null; // UUID
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface OfferAsset {
  id: string; // UUID
  offer_id: string; // UUID
  oem_id: OemId;
  r2_key: string;
  sha256: string;
  asset_type: 'hero_image' | 'tile_image' | 'pdf' | 'banner' | null;
  source_url: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface OfferVersion {
  id: string; // UUID
  offer_id: string; // UUID
  oem_id: OemId;
  import_run_id: string | null; // UUID
  content_hash: string;
  json_snapshot: object;
  diff_summary: string | null;
  diff_fields: string[] | null;
  created_at: string;
}

export interface OfferProduct {
  offer_id: string; // UUID
  product_id: string; // UUID
  oem_id: OemId;
  variant_label: string | null;
}

// ============================================================================
// Banners
// ============================================================================

export interface Banner {
  id: string; // UUID
  oem_id: OemId;
  page_url: string;
  position: number;
  headline: string | null;
  sub_headline: string | null;
  cta_text: string | null;
  cta_url: string | null;
  image_url_desktop: string;
  image_url_mobile: string | null;
  image_r2_key: string;
  image_sha256: string;
  disclaimer_text: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface BannerVersion {
  id: string; // UUID
  banner_id: string; // UUID
  oem_id: OemId;
  import_run_id: string | null; // UUID
  content_hash: string;
  json_snapshot: object;
  diff_summary: string | null;
  created_at: string;
}

// ============================================================================
// Import Runs & Source Pages
// ============================================================================

export type ImportRunStatus = 'running' | 'completed' | 'failed' | 'partial';

export interface ImportRun {
  id: string; // UUID
  oem_id: OemId;
  started_at: string;
  finished_at: string | null;
  status: ImportRunStatus;
  pages_checked: number;
  pages_changed: number;
  pages_errored: number;
  products_upserted: number;
  offers_upserted: number;
  banners_upserted: number;
  error_json: object | null;
  created_at: string;
}

export type SourcePageStatus = 'active' | 'removed' | 'error' | 'blocked';

export interface SourcePage {
  id: string; // UUID
  oem_id: OemId;
  url: string;
  page_type: PageType;
  last_hash: string | null;
  last_rendered_hash: string | null;
  last_checked_at: string | null;
  last_changed_at: string | null;
  last_rendered_at: string | null;
  consecutive_no_change: number;
  status: SourcePageStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Change Events
// ============================================================================

export interface ChangeEvent {
  id: string; // UUID
  oem_id: OemId;
  import_run_id: string | null; // UUID
  entity_type: EntityType;
  entity_id: string | null; // UUID
  event_type: EventType;
  severity: Severity;
  summary: string | null;
  diff_json: object | null;
  notified_at: string | null;
  notification_channel: string | null;
  created_at: string;
}

// ============================================================================
// Design Agent — Brand Tokens
// ============================================================================

export interface TypographyEntry {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string | number;
  lineHeight?: string;
  letterSpacing?: string | null;
  textTransform?: string | null;
}

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string | null;
  background: string;
  surface: string;
  text_primary: string;
  text_secondary: string;
  text_on_primary: string;
  border: string;
  error: string;
  success: string;
  cta_fill: string;
  cta_text: string;
  cta_hover: string | null;
  gradient?: {
    type: 'linear' | 'radial';
    direction: string;
    stops: Array<{ color: string; position: string }>;
  } | null;
  palette_extended?: Record<string, string>;
}

export interface BrandTypography {
  font_primary: string;
  font_secondary: string | null;
  font_mono: string | null;
  font_cdn_urls: string[];
  scale: {
    display?: TypographyEntry;
    h1?: TypographyEntry;
    h2?: TypographyEntry;
    h3?: TypographyEntry;
    h4?: TypographyEntry;
    body_large?: TypographyEntry;
    body?: TypographyEntry;
    body_small?: TypographyEntry;
    caption?: TypographyEntry;
    price?: TypographyEntry;
    disclaimer?: TypographyEntry;
    cta?: TypographyEntry;
    nav?: TypographyEntry;
  };
}

export interface BrandSpacing {
  unit: number;
  scale: Record<string, number>;
  section_gap: number;
  container_max_width: number;
  container_padding: number;
}

export interface BrandBorders {
  radius_sm: string;
  radius_md: string;
  radius_lg: string;
  radius_full: string;
  width_default: string;
  color_default: string;
}

export interface BrandShadows {
  sm: string;
  md: string;
  lg: string;
}

export interface ButtonStyle {
  background: string;
  color: string;
  border: string;
  border_radius: string;
  padding: string;
  font_size: string;
  font_weight: string | number;
  text_transform: string | null;
  hover_background: string | null;
  hover_color: string | null;
}

export interface BrandComponents {
  card?: {
    background: string;
    border_radius: string;
    shadow: string;
    padding: string;
    hover_shadow: string | null;
  };
  hero?: {
    min_height_desktop: string;
    min_height_mobile: string;
    overlay: string | null;
    text_alignment: string;
  };
  nav?: {
    height: string;
    background: string;
    text_color: string;
    sticky: boolean;
  };
  price_display?: {
    font: string;
    size: string;
    weight: string;
    color: string;
    prefix_style: string | null;
  };
  disclaimer?: {
    font_size: string;
    color: string;
    line_height: string;
    max_width: string | null;
  };
}

export interface BrandAnimations {
  transition_default: string;
  carousel_transition: string | null;
  hover_scale: string | null;
}

export interface BrandTokens {
  oem_id: OemId;
  version: number;
  captured_at: string;
  source_pages: string[];
  colors: BrandColors;
  typography: BrandTypography;
  spacing: BrandSpacing;
  borders: BrandBorders;
  shadows: BrandShadows;
  buttons: {
    primary: ButtonStyle;
    secondary: ButtonStyle;
    outline: ButtonStyle;
    text: ButtonStyle;
  };
  components: BrandComponents;
  animations: BrandAnimations | null;
}

export interface BrandTokensDb {
  id: string; // UUID
  oem_id: OemId;
  version: number;
  tokens_json: BrandTokens;
  source_pages_json: string[];
  screenshot_r2_keys_json: string[];
  content_hash: string;
  is_active: boolean;
  captured_at: string;
  created_at: string;
}

// ============================================================================
// Design Agent — Page Layouts
// ============================================================================

export type LayoutSectionType = 
  | 'hero_banner' | 'hero_carousel' | 'hero_video'
  | 'vehicle_intro' | 'vehicle_highlights'
  | 'spec_table' | 'spec_comparison'
  | 'image_gallery' | 'image_carousel'
  | 'feature_grid' | 'feature_list'
  | 'variant_selector' | 'variant_cards'
  | 'price_display' | 'price_table'
  | 'cta_banner' | 'cta_strip'
  | 'offer_tiles' | 'offer_detail'
  | 'text_block' | 'two_column'
  | 'tabbed_content' | 'accordion'
  | 'testimonial' | 'review_carousel'
  | 'related_models' | 'model_cards'
  | 'disclaimer_block' | 'footer_legal'
  | 'breadcrumb' | 'sticky_nav'
  | 'configurator_link' | 'build_price_cta'
  | 'video_embed' | '360_viewer'
  | 'custom';

export type SlotType = 'text' | 'rich_text' | 'image' | 'price' | 'cta_button' | 'cta_link' | 'list' | 'table' | 'video' | 'html' | 'disclaimer' | 'badge';

export interface ContentSlot {
  slot_type: SlotType;
  data_binding?: string;
  style?: object;
  fallback?: string | null;
}

export interface LayoutSection {
  id: string;
  type: LayoutSectionType;
  layout: {
    display?: 'flex' | 'grid' | 'block' | 'inline-flex';
    direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
    justify?: string;
    align?: string;
    gap?: string;
    grid_template?: string | null;
    width?: string;
    max_width?: string | null;
    min_height?: string | null;
    padding?: string;
    margin?: string;
    full_bleed?: boolean;
  };
  style: {
    background?: string;
    background_image?: string | null;
    overlay?: string | null;
    border_bottom?: string | null;
    box_shadow?: string | null;
  };
  responsive?: {
    tablet?: object | null;
    mobile?: object | null;
  };
  content_slots: Record<string, ContentSlot>;
  components: LayoutSection[];
}

export interface PageLayout {
  oem_id: OemId;
  page_type: 'homepage' | 'vehicle_detail' | 'vehicle_range' | 'offers' | 'offer_detail' | 'news' | 'news_article';
  source_url: string;
  captured_at: string;
  version: number;
  viewport: {
    desktop_width: number;
    tablet_width: number;
    mobile_width: number;
  };
  page_meta: {
    background_color?: string;
    max_content_width?: number;
    uses_full_bleed?: boolean;
  };
  sections: LayoutSection[];
}

export interface PageLayoutDb {
  id: string; // UUID
  oem_id: OemId;
  page_type: string;
  source_url: string;
  version: number;
  layout_json: PageLayout;
  brand_tokens_id: string | null; // UUID
  content_hash: string;
  is_active: boolean;
  captured_at: string;
  created_at: string;
}

// ============================================================================
// Design Agent — Design Captures
// ============================================================================

export type DesignCaptureTrigger = 'initial' | 'visual_change' | 'manual' | 'quarterly_audit';
export type DesignCaptureStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DesignCapture {
  id: string; // UUID
  oem_id: OemId;
  page_url: string;
  page_type: string;
  trigger_type: DesignCaptureTrigger;
  screenshot_desktop_r2_key: string | null;
  screenshot_mobile_r2_key: string | null;
  dom_snapshot_r2_key: string | null;
  computed_styles_r2_key: string | null;
  phash_desktop: string | null;
  phash_mobile: string | null;
  phash_distance_from_previous: number | null;
  kimi_request_tokens: number | null;
  kimi_response_tokens: number | null;
  kimi_cost_usd: number | null;
  brand_tokens_id: string | null; // UUID
  page_layout_id: string | null; // UUID
  status: DesignCaptureStatus;
  error_message: string | null;
  captured_at: string;
  created_at: string;
}

// ============================================================================
// AI Inference Logging
// ============================================================================

export type AiProvider = 'groq' | 'together' | 'moonshot' | 'anthropic' | 'cloudflare_ai_gateway' | 'google_gemini';
export type AiTaskType =
  | 'html_normalisation'
  | 'llm_extraction'
  | 'diff_classification'
  | 'change_summary'
  | 'design_pre_screening'
  | 'design_vision'
  | 'sales_conversation'
  | 'content_generation'
  | 'page_generation'
  | 'page_visual_extraction'
  | 'page_content_generation'
  | 'page_screenshot_to_code'
  | 'page_structuring'
  | 'quick_scan'
  | 'extraction_quality_check'
  | 'section_deep_analysis'
  | 'bespoke_component';
export type AiInferenceStatus = 'success' | 'error' | 'timeout' | 'rate_limited';

export interface AiInferenceLog {
  id: string; // UUID
  oem_id: OemId | null;
  import_run_id: string | null; // UUID
  provider: AiProvider;
  model: string;
  task_type: AiTaskType;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  request_timestamp: string;
  response_timestamp: string | null;
  prompt_hash: string | null;
  response_hash: string | null;
  status: AiInferenceStatus;
  error_message: string | null;
  retry_count: number;
  was_fallback: boolean;
  fallback_reason: string | null;
  batch_id: string | null; // UUID
  batch_discount_applied: boolean;
  metadata_json: object;
}

// ============================================================================
// OEM Members (Access Control)
// ============================================================================

export type MemberRole = 'admin' | 'editor' | 'viewer';

export interface OemMember {
  id: string; // UUID
  oem_id: OemId;
  full_name: string | null;
  role: MemberRole | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

// ============================================================================
// Extracted Data (Crawl Results)
// ============================================================================

export interface ExtractedProduct {
  external_key?: string;
  title: string;
  subtitle?: string | null;
  body_type?: BodyType;
  fuel_type?: FuelType;
  availability?: Availability;
  price?: ProductPrice | null;
  // Vehicle specifications
  engine_size?: string | null;
  cylinders?: number | null;
  transmission?: string | null;
  gears?: number | null;
  drive?: string | null;
  doors?: number | null;
  seats?: number | null;
  // OEM marketing features (e.g., "Apple CarPlay", "Blind Spot Monitor")
  key_features?: string[];
  variants?: ProductVariant[];
  cta_links?: ProductCtaLink[];
  disclaimer_text?: string | null;
  primary_image_url?: string | null;
  gallery_image_urls?: string[];
  meta?: ProductMeta;
}

export interface ExtractedOffer {
  external_key?: string | null;
  title: string;
  description?: string | null;
  offer_type?: OfferType | null;
  applicable_models?: string[];
  price?: {
    amount?: number | null;
    type?: PriceType | null;
    raw_string?: string | null;
    saving_amount?: number | null;
  } | null;
  validity?: OfferValidity | null;
  cta_text?: string | null;
  cta_url?: string | null;
  hero_image_url?: string | null;
  disclaimer_text?: string | null;
  disclaimer_html?: string | null;
  eligibility?: string | null;
}

export interface ExtractedBannerSlide {
  position: number;
  headline?: string | null;
  sub_headline?: string | null;
  cta_text?: string | null;
  cta_url?: string | null;
  image_url_desktop: string;
  image_url_mobile?: string | null;
  disclaimer_text?: string | null;
}

export interface CrawlResult {
  url: string;
  page_type?: PageType;
  html_hash?: string;
  normalized_html?: string;
  products?: ExtractedProduct[];
  offers?: ExtractedOffer[];
  banner_slides?: ExtractedBannerSlide[];
  discovered_urls?: string[];
  error?: string;
}

// ============================================================================
// AI Model Configuration (from spec Section 10)
// ============================================================================

export interface GroqModelConfig {
  model: string;
  description: string;
  cost_per_m_input: number;
  cost_per_m_output: number;
  max_context: number;
  latency_p50_ms: number;
  supports_vision: boolean;
  supports_tools: boolean;
}

// ============================================================================
// Smart Mode — API Discovery
// ============================================================================

export type ApiDiscoveryStatus = 'discovered' | 'verified' | 'stale' | 'error';

export interface DiscoveredApi {
  id: string; // UUID
  oem_id: OemId;
  source_page_id: string | null; // UUID - page where API was discovered
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  content_type: string | null;
  response_type: 'json' | 'xml' | 'html' | 'text' | 'binary';
  sample_request_headers: Record<string, string> | null;
  sample_request_body: string | null;
  sample_response_hash: string | null;
  data_type: 'products' | 'offers' | 'inventory' | 'pricing' | 'config' | 'other' | null;
  schema_json: object | null; // Inferred JSON schema
  reliability_score: number; // 0-1 confidence score
  status: ApiDiscoveryStatus;
  last_successful_call: string | null;
  call_count: number;
  error_count: number;
  discovered_at: string;
  updated_at: string;
}

export interface NetworkRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  resourceType: string;
  timestamp: number;
}

export interface NetworkResponse {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  contentType: string | null;
  body?: string;
  bodySize: number;
  timestamp: number;
}

export interface SmartModeResult {
  html: string;
  networkRequests: NetworkRequest[];
  networkResponses: NetworkResponse[];
  apiCandidates: ApiCandidate[];
  performanceMetrics: {
    domContentLoaded: number;
    loadComplete: number;
    firstPaint: number | null;
  };
}

export interface ApiCandidate {
  url: string;
  method: string;
  contentType: string | null;
  responseSize: number;
  isJson: boolean;
  isPotentialDataApi: boolean;
  dataType: 'products' | 'offers' | 'inventory' | 'pricing' | 'config' | 'other' | null;
  confidence: number;
}

export interface AiRouterConfig {
  groq: {
    api_base: string;
    api_key_env: string;
    default_params: {
      temperature: number;
      max_tokens: number;
      response_format: { type: string };
    };
    models: {
      fast_classify: GroqModelConfig;
      balanced: GroqModelConfig;
      powerful: GroqModelConfig;
      reasoning: GroqModelConfig;
    };
    batch_config: {
      enabled: boolean;
      discount_pct: number;
      use_for: string[];
    };
  };
  kimi_k2_5: {
    api_base: string;
    api_key_env: string;
    model: string;
    default_params: {
      temperature: number;
      max_tokens: number;
      response_format: { type: string };
    };
    thinking_mode_params: {
      temperature: number;
      max_tokens: number;
    };
    cost_per_m_input: number;
    cost_per_m_output: number;
    max_context: number;
    supports_vision: boolean;
    use_for: string[];
  };
}

// ============================================================================
// Page Generation Pipeline (Brand Ambassador)
// ============================================================================

export interface VehicleModelPageSlide {
  heading: string;
  sub_heading: string;
  button: string;
  desktop: string;
  mobile: string;
  bottom_strip: Array<{ heading: string; sub_heading: string }>;
}

export interface VehicleModelPage {
  id: string;
  slug: string;
  name: string;
  oem_id: OemId;
  header: {
    slides: VehicleModelPageSlide[];
  };
  content: {
    rendered: string;
    sections?: PageSection[];
  };
  form: boolean;
  variant_link: string;
  generated_at: string;
  source_url: string;
  version: number;
  page_type?: 'model' | 'custom' | 'subpage';
  parent_slug?: string;
  subpage_type?: string;
  subpage_name?: string;
  source_data_hash?: string;
  source_data_updated_at?: string;
}

export type PageGenerationStatus = 'pending' | 'capturing' | 'generating' | 'validating' | 'completed' | 'failed';

export interface PageGenerationJob {
  oem_id: OemId;
  model_slug: string;
  source_url: string;
  trigger: 'manual' | 'cron' | 'change_detected';
  status: PageGenerationStatus;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

export interface PageGenerationResult {
  success: boolean;
  page?: VehicleModelPage;
  r2_key?: string;
  generation_time_ms: number;
  gemini_tokens_used?: number;
  gemini_cost_usd?: number;
  claude_tokens_used?: number;
  claude_cost_usd?: number;
  total_cost_usd?: number;
  images_uploaded?: number;
  validation_errors: string[];
  error?: string;
  _debug?: Record<string, unknown>;
}

export interface RegenerationDecision {
  shouldRegenerate: boolean;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  checksDone: string[];
  pageAge?: number;
}

// ============================================================================
// Structured Page Sections (Gemini 3.1 Pro extraction)
// ============================================================================

export type PageSectionType = 'hero' | 'intro' | 'tabs' | 'color-picker' | 'specs-grid'
  | 'gallery' | 'feature-cards' | 'video' | 'cta-banner' | 'content-block'
  | 'accordion' | 'enquiry-form' | 'map' | 'alert' | 'divider'
  | 'testimonial' | 'comparison-table' | 'stats' | 'logo-strip' | 'embed'
  | 'pricing-table' | 'sticky-bar' | 'countdown' | 'finance-calculator'
  | 'image-showcase';

export interface HeroSection {
  type: 'hero'; id: string; order: number;
  heading: string; sub_heading: string;
  cta_text: string; cta_url: string;
  desktop_image_url: string; mobile_image_url: string;
}

export interface IntroSection {
  type: 'intro'; id: string; order: number;
  title?: string; body_html: string;
  image_url?: string; image_position: 'left' | 'right' | 'background';
}

export interface TabsSection {
  type: 'tabs'; id: string; order: number;
  title?: string;
  tabs: Array<{ label: string; content_html: string; image_url?: string }>;
  default_tab: number;
}

export interface ColorPickerSection {
  type: 'color-picker'; id: string; order: number;
  title?: string;
  colors: Array<{
    name: string; code?: string; swatch_url?: string;
    hero_image_url?: string; hex?: string;
  }>;
}

export interface SpecsGridSection {
  type: 'specs-grid'; id: string; order: number;
  title?: string;
  categories: Array<{
    name: string;
    specs: Array<{ label: string; value: string; unit?: string }>;
  }>;
}

export interface GallerySection {
  type: 'gallery'; id: string; order: number;
  title?: string;
  images: Array<{ url: string; alt?: string; caption?: string }>;
  layout: 'carousel' | 'grid';
}

export interface FeatureCardsSection {
  type: 'feature-cards'; id: string; order: number;
  title?: string;
  cards: Array<{ title: string; description: string; image_url?: string }>;
  columns: 2 | 3 | 4;
}

export interface VideoSection {
  type: 'video'; id: string; order: number;
  title?: string;
  video_url: string; poster_url?: string; autoplay: boolean;
}

export interface CtaBannerSection {
  type: 'cta-banner'; id: string; order: number;
  heading: string; body?: string;
  cta_text: string; cta_url: string;
  background_color?: string;
}

export interface ContentBlockSection {
  type: 'content-block';
  id: string;
  order: number;
  title?: string;
  content_html: string;
  layout: 'full-width' | 'contained' | 'two-column';
  background?: string;
  image_url?: string;
}

export interface AccordionSection {
  type: 'accordion'; id: string; order: number;
  title?: string;
  items: Array<{ question: string; answer: string }>;
  section_id?: string;
}

export interface EnquiryFormSection {
  type: 'enquiry-form'; id: string; order: number;
  heading: string;
  sub_heading?: string;
  form_type: 'contact' | 'test-drive' | 'service';
  vehicle_context: boolean;
}

export interface MapSection {
  type: 'map'; id: string; order: number;
  title?: string;
  sub_heading?: string;
  embed_url: string;
}

export interface AlertSection {
  type: 'alert'; id: string; order: number;
  title?: string;
  message: string;
  variant: 'info' | 'warning' | 'success' | 'destructive';
  dismissible: boolean;
}

export interface DividerSection {
  type: 'divider'; id: string; order: number;
  style: 'line' | 'space' | 'dots';
  spacing: 'sm' | 'md' | 'lg';
}

export interface TestimonialSection {
  type: 'testimonial'; id: string; order: number;
  title?: string;
  testimonials: Array<{
    quote: string;
    author: string;
    role?: string;
    avatar_url?: string;
    rating?: number; // 1-5
  }>;
  layout: 'carousel' | 'grid' | 'stacked';
}

export interface ComparisonTableSection {
  type: 'comparison-table'; id: string; order: number;
  title?: string;
  columns: Array<{
    label: string;
    highlighted?: boolean;
  }>;
  rows: Array<{
    feature: string;
    values: string[];
  }>;
}

export interface StatsSection {
  type: 'stats'; id: string; order: number;
  title?: string;
  stats: Array<{
    value: string;
    label: string;
    unit?: string;
    icon_url?: string;
  }>;
  layout: 'row' | 'grid';
  background?: string;
}

export interface LogoStripSection {
  type: 'logo-strip'; id: string; order: number;
  title?: string;
  logos: Array<{
    name: string;
    image_url: string;
    link_url?: string;
  }>;
  grayscale: boolean;
}

export interface EmbedSection {
  type: 'embed'; id: string; order: number;
  title?: string;
  embed_url: string;
  embed_type: 'iframe' | 'script';
  aspect_ratio: '16:9' | '4:3' | '1:1' | 'auto';
  max_width?: string;
}

export interface PricingTableSection {
  type: 'pricing-table'; id: string; order: number;
  title?: string;
  subtitle?: string;
  tiers: Array<{
    name: string;
    price: string;
    price_suffix?: string;
    features: string[];
    cta_text: string;
    cta_url: string;
    highlighted?: boolean;
    badge_text?: string;
  }>;
  disclaimer?: string;
}

export interface StickyBarSection {
  type: 'sticky-bar'; id: string; order: number;
  position: 'top' | 'bottom';
  model_name: string;
  price_text?: string;
  buttons: Array<{
    text: string;
    url: string;
    variant: 'primary' | 'secondary' | 'ghost';
  }>;
  show_after_scroll_px: number;
  background_color?: string;
}

export interface CountdownSection {
  type: 'countdown'; id: string; order: number;
  title?: string;
  subtitle?: string;
  target_date: string; // ISO 8601
  expired_message: string;
  cta_text?: string;
  cta_url?: string;
  background_color?: string;
  background_image_url?: string;
}

export interface FinanceCalculatorSection {
  type: 'finance-calculator'; id: string; order: number;
  title?: string;
  subtitle?: string;
  default_price: number;
  default_deposit: number;
  default_term_months: number;
  default_rate: number;
  min_deposit: number;
  max_term: number;
  cta_text?: string;
  cta_url?: string;
  disclaimer?: string;
}

export interface ImageShowcaseSection {
  type: 'image-showcase'; id: string; order: number;
  title?: string;
  images: Array<{
    url: string;
    alt?: string;
    caption?: string;
    description?: string;
    overlay_position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  }>;
  layout: 'stacked' | 'fullscreen-scroll';
  height: 'screen' | 'large' | 'medium';
  overlay_style: 'dark' | 'light' | 'none';
}

export type PageSection =
  | HeroSection | IntroSection | TabsSection | ColorPickerSection
  | SpecsGridSection | GallerySection | FeatureCardsSection
  | VideoSection | CtaBannerSection | ContentBlockSection
  | AccordionSection | EnquiryFormSection | MapSection
  | AlertSection | DividerSection
  | TestimonialSection | ComparisonTableSection | StatsSection
  | LogoStripSection | EmbedSection
  | PricingTableSection | StickyBarSection | CountdownSection
  | FinanceCalculatorSection
  | ImageShowcaseSection;

export interface PageStructuringResult {
  success: boolean;
  page?: VehicleModelPage;
  r2_key?: string;
  structuring_time_ms: number;
  sections_extracted: number;
  section_types: PageSectionType[];
  gemini_tokens_used?: number;
  gemini_cost_usd?: number;
  error?: string;
}

// ============================================================================
// Design Memory — OEM Profiles & Extraction Runs
// ============================================================================

export interface OemDesignProfile {
  brand_tokens: {
    primary_color: string;
    secondary_colors: string[];
    font_family: string;
    border_radius: string;
    button_style: string;
  };
  extraction_hints: {
    hero_selectors: string[];
    gallery_selectors: string[];
    tab_selectors: string[];
    known_failures: string[];
    bot_detection: 'none' | 'cloudflare' | 'custom';
    wait_ms_after_load: number;
  };
  quality_history: {
    avg_quality_score: number;
    total_runs: number;
    last_run_at: string;
    common_errors: Array<{ message: string; count: number }>;
  };
  last_updated: string;
}

export type ExtractionPipeline = 'capturer' | 'cloner' | 'structurer' | 'generator' | 'adaptive';
export type ExtractionRunStatus = 'running' | 'completed' | 'failed';

export interface ExtractionRun {
  id: string;
  oem_id: OemId;
  model_slug: string;
  pipeline: ExtractionPipeline;
  status: ExtractionRunStatus;
  started_at: string;
  finished_at: string | null;
  sections_extracted: number;
  quality_score: number | null;
  total_tokens: number | null;
  total_cost_usd: number | null;
  errors_json: Array<{ message: string; selector?: string }>;
  successful_selectors: string[];
  failed_selectors: string[];
  prompt_version: string | null;
  created_at: string;
}

export interface ExtractionRunInput {
  oem_id: OemId;
  model_slug: string;
  pipeline: ExtractionPipeline;
  prompt_version?: string;
}

export interface ExtractionRunResult {
  sections_extracted: number;
  quality_score: number;
  total_tokens: number;
  total_cost_usd: number;
  errors: Array<{ message: string; selector?: string }>;
  successful_selectors: string[];
  failed_selectors: string[];
}

// ============================================================================
// Adaptive Pipeline Types (Phase 3)
// ============================================================================

export interface QuickScanResult {
  section_id: string;
  layout_type: 'hero' | 'gallery' | 'tabs' | 'video' | 'feature-cards' | 'specs' | 'cta' | 'content' | 'unknown';
  has_video: boolean;
  has_carousel: boolean;
  dominant_colors: string[];
  confidence: number;
}

export interface QualityCheckResult {
  overall_score: number;
  issues: Array<{
    severity: 'critical' | 'warning' | 'info';
    message: string;
    section_id?: string;
  }>;
  missing_section_types: string[];
  empty_content_sections: string[];
  broken_url_count: number;
}

export interface PipelineStepResult {
  step: 'clone' | 'screenshot' | 'classify' | 'extract' | 'validate' | 'generate' | 'learn';
  status: 'success' | 'skipped' | 'failed';
  duration_ms: number;
  tokens_used?: number;
  cost_usd?: number;
  details?: Record<string, unknown>;
}

export interface PipelineResult {
  success: boolean;
  oem_id: OemId;
  model_slug: string;
  steps: PipelineStepResult[];
  sections: PageSection[];
  quality_score: number;
  total_tokens: number;
  total_cost_usd: number;
  total_duration_ms: number;
  screenshots_captured: number;
  error?: string;
}
