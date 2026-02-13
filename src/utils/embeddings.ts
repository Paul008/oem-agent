/**
 * Embedding Generation Service
 *
 * Generates vector embeddings for semantic search using:
 * - Google Gemini text-embedding-004 (768 dimensions) - RECOMMENDED
 * - OpenAI text-embedding-3-small (768 dimensions)
 * - Or Groq/Together for open-source alternatives
 *
 * Used for:
 * - Product semantic search ("find family SUVs")
 * - Cross-OEM similarity ("vehicles like Sportage")
 * - Change pattern detection
 */

import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface EmbeddingConfig {
  provider: 'openai' | 'groq' | 'together' | 'gemini';
  apiKey: string;
  model?: string;
  dimensions?: number;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  contentHash: string;
  tokensUsed: number;
}

export interface ProductEmbeddingInput {
  id: string;
  title: string | null;
  subtitle: string | null;
  bodyType: string | null;
  fuelType: string | null;
  keyFeatures: unknown;
  priceAmount: number | null;
}

export interface OfferEmbeddingInput {
  id: string;
  title: string | null;
  description: string | null;
  offerType: string | null;
  applicableModels: unknown;
}

export interface ChangeEventEmbeddingInput {
  id: string;
  entityType: string | null;
  eventType: string | null;
  summary: string | null;
  diffJson: unknown;
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_MODELS: Record<string, string> = {
  gemini: 'text-embedding-004',
  openai: 'text-embedding-3-small',
  groq: 'nomic-embed-text-v1.5',
  together: 'togethercomputer/m2-bert-80M-8k-retrieval',
};

const MODEL_DIMENSIONS: Record<string, number> = {
  'text-embedding-004': 768,
  'text-embedding-3-small': 768,
  'text-embedding-3-large': 3072,
  'nomic-embed-text-v1.5': 768,
  'togethercomputer/m2-bert-80M-8k-retrieval': 768,
};

// ============================================================================
// Text Preparation
// ============================================================================

/**
 * Prepare product text for embedding
 */
export function prepareProductText(product: ProductEmbeddingInput): string {
  const parts: string[] = [];

  if (product.title) {
    parts.push(`Title: ${product.title}`);
  }
  if (product.subtitle) {
    parts.push(`Subtitle: ${product.subtitle}`);
  }
  if (product.bodyType) {
    parts.push(`Body Type: ${product.bodyType}`);
  }
  if (product.fuelType) {
    parts.push(`Fuel Type: ${product.fuelType}`);
  }
  if (product.priceAmount) {
    parts.push(`Price: $${product.priceAmount.toLocaleString()}`);
  }
  if (product.keyFeatures) {
    const features = Array.isArray(product.keyFeatures)
      ? product.keyFeatures.join(', ')
      : JSON.stringify(product.keyFeatures);
    parts.push(`Features: ${features}`);
  }

  return parts.join('\n');
}

/**
 * Prepare offer text for embedding
 */
export function prepareOfferText(offer: OfferEmbeddingInput): string {
  const parts: string[] = [];

  if (offer.title) {
    parts.push(`Title: ${offer.title}`);
  }
  if (offer.description) {
    parts.push(`Description: ${offer.description}`);
  }
  if (offer.offerType) {
    parts.push(`Type: ${offer.offerType}`);
  }
  if (offer.applicableModels) {
    const models = Array.isArray(offer.applicableModels)
      ? offer.applicableModels.join(', ')
      : JSON.stringify(offer.applicableModels);
    parts.push(`Applicable Models: ${models}`);
  }

  return parts.join('\n');
}

/**
 * Prepare change event text for embedding
 */
export function prepareChangeEventText(event: ChangeEventEmbeddingInput): string {
  const parts: string[] = [];

  if (event.entityType) {
    parts.push(`Entity: ${event.entityType}`);
  }
  if (event.eventType) {
    parts.push(`Event: ${event.eventType}`);
  }
  if (event.summary) {
    parts.push(`Summary: ${event.summary}`);
  }
  if (event.diffJson) {
    // Extract key changes from diff
    const diff = typeof event.diffJson === 'string'
      ? JSON.parse(event.diffJson)
      : event.diffJson;

    if (diff && typeof diff === 'object') {
      const changes: string[] = [];
      for (const [key, value] of Object.entries(diff)) {
        if (value && typeof value === 'object' && 'from' in value && 'to' in value) {
          changes.push(`${key}: ${(value as { from: unknown }).from} → ${(value as { to: unknown }).to}`);
        }
      }
      if (changes.length > 0) {
        parts.push(`Changes: ${changes.join(', ')}`);
      }
    }
  }

  return parts.join('\n');
}

/**
 * Generate content hash for change detection
 */
export function generateContentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').substring(0, 16);
}

// ============================================================================
// Embedding Generation
// ============================================================================

/**
 * Generate embedding using configured provider
 */
export async function generateEmbedding(
  text: string,
  config: EmbeddingConfig
): Promise<EmbeddingResult> {
  const model = config.model || DEFAULT_MODELS[config.provider];
  const contentHash = generateContentHash(text);

  switch (config.provider) {
    case 'gemini':
      return generateGeminiEmbedding(text, config.apiKey, model, contentHash);
    case 'openai':
      return generateOpenAIEmbedding(text, config.apiKey, model, contentHash);
    case 'groq':
      return generateGroqEmbedding(text, config.apiKey, model, contentHash);
    case 'together':
      return generateTogetherEmbedding(text, config.apiKey, model, contentHash);
    default:
      throw new Error(`Unknown embedding provider: ${config.provider}`);
  }
}

async function generateGeminiEmbedding(
  text: string,
  apiKey: string,
  model: string,
  contentHash: string
): Promise<EmbeddingResult> {
  // Google Gemini Embedding API
  // https://ai.google.dev/gemini-api/docs/embeddings
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: `models/${model}`,
        content: {
          parts: [{ text }],
        },
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: MODEL_DIMENSIONS[model] || 768,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini embedding error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    embedding: { values: number[] };
  };

  // Gemini doesn't return token count, estimate based on text length
  const estimatedTokens = Math.ceil(text.length / 4);

  return {
    embedding: data.embedding.values,
    model,
    contentHash,
    tokensUsed: estimatedTokens,
  };
}

async function generateOpenAIEmbedding(
  text: string,
  apiKey: string,
  model: string,
  contentHash: string
): Promise<EmbeddingResult> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: text,
      dimensions: MODEL_DIMENSIONS[model] || 768,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI embedding error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>;
    usage: { total_tokens: number };
  };

  return {
    embedding: data.data[0].embedding,
    model,
    contentHash,
    tokensUsed: data.usage.total_tokens,
  };
}

async function generateGroqEmbedding(
  text: string,
  apiKey: string,
  model: string,
  contentHash: string
): Promise<EmbeddingResult> {
  // Groq uses OpenAI-compatible API
  const response = await fetch('https://api.groq.com/openai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq embedding error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>;
    usage: { total_tokens: number };
  };

  return {
    embedding: data.data[0].embedding,
    model,
    contentHash,
    tokensUsed: data.usage.total_tokens,
  };
}

async function generateTogetherEmbedding(
  text: string,
  apiKey: string,
  model: string,
  contentHash: string
): Promise<EmbeddingResult> {
  const response = await fetch('https://api.together.xyz/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Together embedding error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>;
    usage: { total_tokens: number };
  };

  return {
    embedding: data.data[0].embedding,
    model,
    contentHash,
    tokensUsed: data.usage.total_tokens,
  };
}

// ============================================================================
// Batch Processing
// ============================================================================

export interface BatchEmbeddingResult<T> {
  successes: Array<{ item: T; result: EmbeddingResult }>;
  failures: Array<{ item: T; error: string }>;
  totalTokens: number;
}

/**
 * Generate embeddings for multiple items with rate limiting
 */
export async function generateEmbeddingsBatch<T>(
  items: T[],
  prepareText: (item: T) => string,
  config: EmbeddingConfig,
  options: {
    batchSize?: number;
    delayMs?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<BatchEmbeddingResult<T>> {
  const { batchSize = 10, delayMs = 100, onProgress } = options;
  const results: BatchEmbeddingResult<T> = {
    successes: [],
    failures: [],
    totalTokens: 0,
  };

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (item) => {
        try {
          const text = prepareText(item);
          const result = await generateEmbedding(text, config);
          results.successes.push({ item, result });
          results.totalTokens += result.tokensUsed;
        } catch (error) {
          results.failures.push({
            item,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );

    if (onProgress) {
      onProgress(Math.min(i + batchSize, items.length), items.length);
    }

    // Rate limiting delay between batches
    if (i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

// ============================================================================
// Supabase Integration
// ============================================================================

export interface SupabaseEmbeddingConfig extends EmbeddingConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

/**
 * Sync product embeddings with Supabase
 */
export async function syncProductEmbeddings(
  config: SupabaseEmbeddingConfig,
  options: {
    limit?: number;
    oemId?: string;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<{ processed: number; errors: number }> {
  const { limit = 100, oemId, onProgress } = options;

  // Fetch products pending embedding
  let query = `${config.supabaseUrl}/rest/v1/products_pending_embedding?select=*`;
  if (oemId) {
    query += `&oem_id=eq.${oemId}`;
  }
  query += `&limit=${limit}`;

  const response = await fetch(query, {
    headers: {
      'apikey': config.supabaseKey,
      'Authorization': `Bearer ${config.supabaseKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch pending products: ${response.status}`);
  }

  const products = await response.json() as ProductEmbeddingInput[];
  console.log(`[syncProductEmbeddings] Found ${products.length} products pending embedding`);

  const results = await generateEmbeddingsBatch(
    products,
    prepareProductText,
    config,
    { onProgress }
  );

  // Insert successful embeddings
  for (const { item, result } of results.successes) {
    await fetch(`${config.supabaseUrl}/rest/v1/product_embeddings`, {
      method: 'POST',
      headers: {
        'apikey': config.supabaseKey,
        'Authorization': `Bearer ${config.supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        product_id: item.id,
        embedding: `[${result.embedding.join(',')}]`,
        source_text: prepareProductText(item),
        model: result.model,
        content_hash: result.contentHash,
      }),
    });
  }

  return {
    processed: results.successes.length,
    errors: results.failures.length,
  };
}

/**
 * Search products using semantic query
 */
export async function searchProductsSemantic(
  query: string,
  config: SupabaseEmbeddingConfig,
  options: {
    matchThreshold?: number;
    matchCount?: number;
    oemId?: string;
  } = {}
): Promise<Array<{
  productId: string;
  oemId: string;
  title: string;
  subtitle: string;
  priceAmount: number;
  similarity: number;
}>> {
  const { matchThreshold = 0.7, matchCount = 10, oemId } = options;

  // Generate embedding for query
  const queryResult = await generateEmbedding(query, config);

  // Call Supabase RPC function
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/search_products_semantic`, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseKey,
      'Authorization': `Bearer ${config.supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query_embedding: `[${queryResult.embedding.join(',')}]`,
      match_threshold: matchThreshold,
      match_count: matchCount,
      filter_oem_id: oemId || null,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Search failed: ${response.status} - ${error}`);
  }

  const results = await response.json() as Array<{
    product_id: string;
    oem_id: string;
    title: string;
    subtitle: string;
    price_amount: number;
    similarity: number;
  }>;

  return results.map((r) => ({
    productId: r.product_id,
    oemId: r.oem_id,
    title: r.title,
    subtitle: r.subtitle,
    priceAmount: r.price_amount,
    similarity: r.similarity,
  }));
}

/**
 * Find similar products across OEMs
 */
export async function findSimilarProducts(
  productId: string,
  config: SupabaseEmbeddingConfig,
  options: {
    matchThreshold?: number;
    matchCount?: number;
    excludeSameOem?: boolean;
  } = {}
): Promise<Array<{
  productId: string;
  oemId: string;
  title: string;
  subtitle: string;
  priceAmount: number;
  similarity: number;
}>> {
  const { matchThreshold = 0.8, matchCount = 10, excludeSameOem = true } = options;

  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/find_similar_products`, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseKey,
      'Authorization': `Bearer ${config.supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_product_id: productId,
      match_threshold: matchThreshold,
      match_count: matchCount,
      exclude_same_oem: excludeSameOem,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Find similar failed: ${response.status} - ${error}`);
  }

  const results = await response.json() as Array<{
    product_id: string;
    oem_id: string;
    title: string;
    subtitle: string;
    price_amount: number;
    similarity: number;
  }>;

  return results.map((r) => ({
    productId: r.product_id,
    oemId: r.oem_id,
    title: r.title,
    subtitle: r.subtitle,
    priceAmount: r.price_amount,
    similarity: r.similarity,
  }));
}
