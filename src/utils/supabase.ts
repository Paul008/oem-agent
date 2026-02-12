/**
 * Supabase Client
 * 
 * Creates a Supabase client for use in the Worker environment.
 * Uses the service role key for server-side operations.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Database row types for type-safe queries
export interface OemRow {
  id: string;
  name: string;
  base_url: string;
  config_json: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SourcePageRow {
  id: string;
  oem_id: string;
  url: string;
  page_type: string;
  last_hash: string | null;
  last_rendered_hash: string | null;
  last_checked_at: string | null;
  last_changed_at: string | null;
  last_rendered_at: string | null;
  consecutive_no_change: number;
  status: 'active' | 'removed' | 'error' | 'blocked';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportRunRow {
  id: string;
  oem_id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'completed' | 'failed' | 'partial';
  pages_checked: number;
  pages_changed: number;
  pages_errored: number;
  products_upserted: number;
  offers_upserted: number;
  banners_upserted: number;
  error_json: Record<string, unknown> | null;
  created_at: string;
}

export interface ProductRow {
  id: string;
  oem_id: string;
  source_url: string;
  external_key: string | null;
  title: string;
  subtitle: string | null;
  body_type: string | null;
  fuel_type: string | null;
  availability: string;
  price_amount: number | null;
  price_currency: string;
  price_type: string | null;
  price_raw_string: string | null;
  price_qualifier: string | null;
  disclaimer_text: string | null;
  primary_image_r2_key: string | null;
  gallery_image_count: number;
  key_features: string[];
  cta_links: Array<{ text: string; url: string }>;
  variants: Array<Record<string, unknown>>;
  meta_json: Record<string, unknown>;
  content_hash: string | null;
  current_version_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface OfferRow {
  id: string;
  oem_id: string;
  source_url: string;
  external_key: string | null;
  title: string;
  description: string | null;
  offer_type: string | null;
  applicable_models: string[];
  price_amount: number | null;
  price_currency: string;
  price_type: string | null;
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
  current_version_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface ChangeEventRow {
  id: string;
  oem_id: string;
  import_run_id: string | null;
  entity_type: string;
  entity_id: string | null;
  event_type: string;
  severity: string;
  summary: string | null;
  diff_json: Record<string, unknown> | null;
  notified_at: string | null;
  notification_channel: string | null;
  created_at: string;
}

export interface AiInferenceLogRow {
  id: string;
  oem_id: string | null;
  import_run_id: string | null;
  provider: string;
  model: string;
  task_type: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  request_timestamp: string;
  response_timestamp: string | null;
  prompt_hash: string | null;
  response_hash: string | null;
  status: string;
  error_message: string | null;
  retry_count: number;
  was_fallback: boolean;
  fallback_reason: string | null;
  batch_id: string | null;
  batch_discount_applied: boolean;
  metadata_json: Record<string, unknown>;
}
