/**
 * OEM Entity Types
 * 
 * TypeScript definitions matching the crawl-config-v1.2 specification
 * for the Multi-OEM AI Agent system.
 */

// ============================================================================
// Base Types
// ============================================================================

export type OemId = 
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
  | 'toyota-au';

export type BodyType = 'suv' | 'sedan' | 'hatch' | 'ute' | 'van' | 'bus' | 'people_mover' | 'sports' | 'cab_chassis' | 'campervan' | null;
export type FuelType = 'petrol' | 'diesel' | 'hybrid' | 'phev' | 'electric' | null;
export type Availability = 'available' | 'coming_soon' | 'limited_stock' | 'run_out' | 'discontinued';
export type PriceType = 'driveaway' | 'from' | 'rrp' | 'weekly' | 'monthly' | 'per_week' | 'per_month' | 'mrlp';
export type OfferType = 'price_discount' | 'driveaway_deal' | 'finance_rate' | 'bonus_accessory' | 'cashback' | 'free_servicing' | 'plate_clearance' | 'factory_bonus' | 'free_charger' | 'other';
export type PageType = 'homepage' | 'vehicle' | 'offers' | 'news' | 'sitemap' | 'price_guide' | 'category' | 'other';
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

export interface ProductVariant {
  name: string;
  price_amount: number | null;
  price_type: PriceType | null;
  drivetrain: string | null;
  engine: string | null;
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

export type AiProvider = 'groq' | 'together' | 'anthropic' | 'cloudflare_ai_gateway';
export type AiTaskType = 
  | 'html_normalisation' 
  | 'llm_extraction' 
  | 'diff_classification' 
  | 'change_summary' 
  | 'design_pre_screening' 
  | 'design_vision' 
  | 'sales_conversation' 
  | 'content_generation';
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
  variants?: ProductVariant[];
  key_features?: string[];
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
