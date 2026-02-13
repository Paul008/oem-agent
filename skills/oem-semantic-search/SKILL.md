---
name: oem-semantic-search
description: Semantic search API for products, offers, and change events using vector embeddings. Enables natural language queries and cross-OEM similarity matching.
---

# OEM Semantic Search

Provides semantic search capabilities using vector embeddings stored in Supabase with pgvector.

## Capabilities

### Product Search

Search products using natural language queries:

```json
{
  "action": "search_products",
  "query": "family SUV with good fuel economy",
  "options": {
    "match_threshold": 0.7,
    "match_count": 10,
    "oem_id": "kia-au"
  }
}
```

**Response:**
```json
{
  "results": [
    {
      "product_id": "uuid",
      "oem_id": "kia-au",
      "title": "Kia Sportage",
      "subtitle": "HEV GT-Line",
      "price_amount": 52990,
      "similarity": 0.89
    }
  ]
}
```

### Similar Products

Find similar products across OEMs:

```json
{
  "action": "find_similar",
  "product_id": "uuid-of-source-product",
  "options": {
    "match_threshold": 0.8,
    "match_count": 5,
    "exclude_same_oem": true
  }
}
```

**Use Cases:**
- Competitive analysis: "Find Toyota equivalents to Kia Sportage"
- Cross-selling: "Similar vehicles in different price ranges"
- Market intelligence: "Products positioned similarly across brands"

### Offer Search

Search promotional offers semantically:

```json
{
  "action": "search_offers",
  "query": "finance deals for electric vehicles",
  "options": {
    "match_threshold": 0.7,
    "match_count": 10
  }
}
```

### Change Pattern Detection

Find similar change events for pattern analysis:

```json
{
  "action": "find_similar_changes",
  "query": "price increase on SUV models",
  "options": {
    "days_back": 30,
    "match_threshold": 0.75
  }
}
```

**Use Cases:**
- Detect coordinated price changes across OEMs
- Identify seasonal promotion patterns
- Track market-wide trends

## Prerequisites

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key |
| `GOOGLE_API_KEY` | Yes | Gemini API for query embedding |

## Embedding Requirements

Products/offers must have embeddings generated before search works:

1. Run `oem-agent-hooks` with `action: sync_embeddings`
2. Or wait for scheduled cron job (every 6 hours)
3. Check coverage: `SELECT * FROM embedding_coverage_stats`

## API Endpoints

When deployed as a Cloudflare Worker route:

```
POST /api/oem-agent/semantic/search
POST /api/oem-agent/semantic/similar
POST /api/oem-agent/semantic/offers
POST /api/oem-agent/semantic/changes
```

## Performance

- **Query latency**: ~50-100ms (HNSW index)
- **Embedding generation**: ~100ms per query
- **Similarity threshold**: 0.7+ recommended for relevance

## Example Queries

| Query | Best For |
|-------|----------|
| "electric SUV under $60k" | Product search with price context |
| "7-seater family car" | Feature-based search |
| "hybrid with low emissions" | Specification search |
| "special financing deal" | Offer search |
| "recent price drops" | Change pattern search |

## Output Schema

All search results include:

```typescript
interface SearchResult {
  id: string;
  oem_id: string;
  title: string;
  similarity: number;  // 0.0-1.0, higher = more similar
  // Additional fields vary by entity type
}
```
