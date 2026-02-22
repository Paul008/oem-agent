/**
 * UX Knowledge Manager — Semantic Retrieval via Cloudflare Vectorize
 *
 * Indexes successful extraction results as vector embeddings for
 * semantic similarity search. When extracting a new page, the system
 * can find similar past extractions that worked well, injecting them
 * into prompts as "recipes" for better results.
 *
 * Uses Google text-embedding-004 (768 dims) to match existing
 * pdf_embeddings pipeline.
 */

import type { OemId, PageSection } from '../oem/types';

// ============================================================================
// Types
// ============================================================================

export interface UxKnowledgeEntry {
  oem_id: OemId;
  model_slug: string;
  section_type: string;
  section_summary: string;
  quality_score: number;
  indexed_at: string;
}

export interface SimilarExtraction {
  id: string;
  oem_id: string;
  model_slug: string;
  section_type: string;
  section_summary: string;
  quality_score: number;
  similarity_score: number;
}

// ============================================================================
// UxKnowledgeManager Class
// ============================================================================

export class UxKnowledgeManager {
  private vectorize: VectorizeIndex;
  private googleApiKey: string;

  constructor(vectorize: VectorizeIndex, googleApiKey: string) {
    this.vectorize = vectorize;
    this.googleApiKey = googleApiKey;
  }

  /**
   * Index a successful extraction result into Vectorize.
   * Each section becomes a separate vector with metadata.
   */
  async indexExtractionResult(
    oemId: OemId,
    modelSlug: string,
    sections: PageSection[],
    qualityScore: number,
  ): Promise<number> {
    if (qualityScore < 0.5) {
      // Don't index low-quality extractions
      return 0;
    }

    let indexed = 0;

    for (const section of sections) {
      try {
        const summary = this.summarizeSection(section);
        if (!summary) continue;

        const embedding = await this.getEmbedding(summary);
        if (!embedding) continue;

        const vectorId = `${oemId}/${modelSlug}/${section.id}`;

        await this.vectorize.upsert([{
          id: vectorId,
          values: embedding,
          metadata: {
            oem_id: oemId,
            model_slug: modelSlug,
            section_type: section.type,
            section_summary: summary.substring(0, 500),
            quality_score: qualityScore,
            indexed_at: new Date().toISOString(),
          },
        }]);

        indexed++;
      } catch (err) {
        console.warn(`[UxKnowledge] Failed to index section ${section.id}:`, err);
      }
    }

    console.log(`[UxKnowledge] Indexed ${indexed}/${sections.length} sections for ${oemId}/${modelSlug}`);
    return indexed;
  }

  /**
   * Find similar past extractions for a given query.
   * Returns the top-K most similar sections from past successful runs.
   */
  async findSimilarExtractions(
    query: string,
    options?: {
      oemId?: OemId;
      sectionType?: string;
      topK?: number;
    },
  ): Promise<SimilarExtraction[]> {
    const topK = options?.topK || 5;

    const embedding = await this.getEmbedding(query);
    if (!embedding) return [];

    const filter: Record<string, { $eq: string }> = {};
    if (options?.oemId) filter.oem_id = { $eq: options.oemId };
    if (options?.sectionType) filter.section_type = { $eq: options.sectionType };

    const results = await this.vectorize.query(embedding, {
      topK,
      returnMetadata: 'all',
      ...(Object.keys(filter).length > 0 ? { filter } : {}),
    });

    return results.matches.map(match => ({
      id: match.id,
      oem_id: (match.metadata?.oem_id as string) || '',
      model_slug: (match.metadata?.model_slug as string) || '',
      section_type: (match.metadata?.section_type as string) || '',
      section_summary: (match.metadata?.section_summary as string) || '',
      quality_score: (match.metadata?.quality_score as number) || 0,
      similarity_score: match.score,
    }));
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Create a text summary of a section for embedding.
   */
  private summarizeSection(section: PageSection): string {
    const parts: string[] = [`Section type: ${section.type}`];

    switch (section.type) {
      case 'hero':
        parts.push(`Heading: ${section.heading || 'none'}`);
        if (section.desktop_image_url) parts.push(`Has desktop image`);
        if (section.mobile_image_url) parts.push(`Has mobile image`);
        break;
      case 'intro':
        if (section.title) parts.push(`Title: ${section.title}`);
        if (section.image_url) parts.push(`Has image (${section.image_position})`);
        break;
      case 'tabs':
        parts.push(`${(section.tabs || []).length} tabs`);
        for (const tab of (section.tabs || []).slice(0, 3)) {
          parts.push(`Tab: ${tab.label}`);
        }
        break;
      case 'color-picker':
        parts.push(`${(section.colors || []).length} colors`);
        break;
      case 'specs-grid':
        parts.push(`${(section.categories || []).length} categories`);
        for (const cat of (section.categories || []).slice(0, 3)) {
          parts.push(`Category: ${cat.name}`);
        }
        break;
      case 'gallery':
        parts.push(`${(section.images || []).length} images, layout: ${section.layout}`);
        break;
      case 'feature-cards':
        parts.push(`${(section.cards || []).length} cards, ${section.columns} columns`);
        break;
      case 'video':
        if (section.video_url) parts.push(`Video URL present`);
        if (section.poster_url) parts.push(`Has poster`);
        break;
      case 'cta-banner':
        parts.push(`CTA: ${section.cta_text}`);
        break;
      case 'content-block':
        if (section.title) parts.push(`Title: ${section.title}`);
        parts.push(`Layout: ${section.layout}`);
        break;
    }

    return parts.join('. ');
  }

  /**
   * Get embedding vector from Google text-embedding-004.
   */
  private async getEmbedding(text: string): Promise<number[] | null> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${this.googleApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text }] },
          }),
        },
      );

      if (!response.ok) {
        console.warn('[UxKnowledge] Embedding API error:', response.status);
        return null;
      }

      const data = await response.json() as { embedding?: { values?: number[] } };
      return data.embedding?.values || null;
    } catch (err) {
      console.warn('[UxKnowledge] Embedding request failed:', err);
      return null;
    }
  }
}
