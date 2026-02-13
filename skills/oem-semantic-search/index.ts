/**
 * Skill: oem-semantic-search — Semantic Search API
 *
 * Provides natural language search for products, offers, and change events
 * using vector embeddings stored in Supabase with pgvector.
 *
 * Capabilities:
 * - Product semantic search ("find family SUVs")
 * - Cross-OEM similarity matching ("vehicles like Sportage")
 * - Offer search ("financing deals on EVs")
 * - Change pattern detection ("recent price increases")
 */

import {
  generateEmbedding,
  searchProductsSemantic,
  findSimilarProducts,
  type EmbeddingConfig,
  type SupabaseEmbeddingConfig,
} from '../../src/utils/embeddings';

// ============================================================================
// Types
// ============================================================================

type SearchAction =
  | 'search_products'
  | 'find_similar'
  | 'search_offers'
  | 'find_similar_changes';

interface SearchPayload {
  action: SearchAction;
  query?: string;
  product_id?: string;
  options?: {
    match_threshold?: number;
    match_count?: number;
    oem_id?: string;
    exclude_same_oem?: boolean;
    days_back?: number;
  };
}

interface ContainerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GOOGLE_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

interface SearchResult {
  success: boolean;
  action: SearchAction;
  results: unknown[];
  query?: string;
  count: number;
  error?: string;
}

// ============================================================================
// Handler
// ============================================================================

export async function handler(
  env: ContainerEnv,
  payload: Record<string, unknown>
): Promise<SearchResult> {
  const { action, query, product_id, options } = payload as unknown as SearchPayload;

  console.log(`[oem-semantic-search] Running action: ${action}`);

  // Get embedding API key (prefer Gemini, fallback to OpenAI)
  const apiKey = env.GOOGLE_API_KEY || env.OPENAI_API_KEY;
  const provider = env.GOOGLE_API_KEY ? 'gemini' : 'openai';

  if (!apiKey) {
    return {
      success: false,
      action,
      results: [],
      count: 0,
      error: 'Missing embedding API key (GOOGLE_API_KEY or OPENAI_API_KEY)',
    };
  }

  const config: SupabaseEmbeddingConfig = {
    provider: provider as 'gemini' | 'openai',
    apiKey,
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };

  try {
    switch (action) {
      case 'search_products':
        return await handleProductSearch(config, query!, options);

      case 'find_similar':
        return await handleFindSimilar(config, product_id!, options);

      case 'search_offers':
        return await handleOfferSearch(config, query!, options);

      case 'find_similar_changes':
        return await handleChangeSearch(config, query!, options);

      default:
        return {
          success: false,
          action,
          results: [],
          count: 0,
          error: `Unknown action: ${action}`,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[oem-semantic-search] Error: ${errorMessage}`);
    return {
      success: false,
      action,
      results: [],
      count: 0,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Search Handlers
// ============================================================================

async function handleProductSearch(
  config: SupabaseEmbeddingConfig,
  query: string,
  options?: SearchPayload['options']
): Promise<SearchResult> {
  const results = await searchProductsSemantic(query, config, {
    matchThreshold: options?.match_threshold ?? 0.7,
    matchCount: options?.match_count ?? 10,
    oemId: options?.oem_id,
  });

  return {
    success: true,
    action: 'search_products',
    query,
    results,
    count: results.length,
  };
}

async function handleFindSimilar(
  config: SupabaseEmbeddingConfig,
  productId: string,
  options?: SearchPayload['options']
): Promise<SearchResult> {
  const results = await findSimilarProducts(productId, config, {
    matchThreshold: options?.match_threshold ?? 0.8,
    matchCount: options?.match_count ?? 10,
    excludeSameOem: options?.exclude_same_oem ?? true,
  });

  return {
    success: true,
    action: 'find_similar',
    results,
    count: results.length,
  };
}

async function handleOfferSearch(
  config: SupabaseEmbeddingConfig,
  query: string,
  options?: SearchPayload['options']
): Promise<SearchResult> {
  // Generate embedding for query
  const queryResult = await generateEmbedding(query, config);

  // Call Supabase RPC function
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/rpc/search_offers_semantic`,
    {
      method: 'POST',
      headers: {
        apikey: config.supabaseKey,
        Authorization: `Bearer ${config.supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query_embedding: `[${queryResult.embedding.join(',')}]`,
        match_threshold: options?.match_threshold ?? 0.7,
        match_count: options?.match_count ?? 10,
        filter_oem_id: options?.oem_id ?? null,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Offer search failed: ${response.status} - ${error}`);
  }

  const results = (await response.json()) as Array<{
    offer_id: string;
    oem_id: string;
    title: string;
    description: string;
    offer_type: string;
    similarity: number;
  }>;

  return {
    success: true,
    action: 'search_offers',
    query,
    results: results.map((r) => ({
      offerId: r.offer_id,
      oemId: r.oem_id,
      title: r.title,
      description: r.description,
      offerType: r.offer_type,
      similarity: r.similarity,
    })),
    count: results.length,
  };
}

async function handleChangeSearch(
  config: SupabaseEmbeddingConfig,
  query: string,
  options?: SearchPayload['options']
): Promise<SearchResult> {
  // Generate embedding for query
  const queryResult = await generateEmbedding(query, config);

  // Call Supabase RPC function
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/rpc/find_similar_changes`,
    {
      method: 'POST',
      headers: {
        apikey: config.supabaseKey,
        Authorization: `Bearer ${config.supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query_embedding: `[${queryResult.embedding.join(',')}]`,
        match_threshold: options?.match_threshold ?? 0.75,
        match_count: options?.match_count ?? 20,
        days_back: options?.days_back ?? 30,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Change search failed: ${response.status} - ${error}`);
  }

  const results = (await response.json()) as Array<{
    change_event_id: string;
    oem_id: string;
    entity_type: string;
    event_type: string;
    summary: string;
    created_at: string;
    similarity: number;
  }>;

  return {
    success: true,
    action: 'find_similar_changes',
    query,
    results: results.map((r) => ({
      changeEventId: r.change_event_id,
      oemId: r.oem_id,
      entityType: r.entity_type,
      eventType: r.event_type,
      summary: r.summary,
      createdAt: r.created_at,
      similarity: r.similarity,
    })),
    count: results.length,
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  handleProductSearch,
  handleFindSimilar,
  handleOfferSearch,
  handleChangeSearch,
};
