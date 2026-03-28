import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtractedRecipe, ExtractionResult } from './recipe-extractor';

// Mock @cloudflare/puppeteer
vi.mock('@cloudflare/puppeteer', () => ({
  default: {
    launch: vi.fn(),
  },
}));

// Mock the AI router config imports
vi.mock('../ai/router', () => ({
  GEMINI_CONFIG: {
    api_base: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-pro',
  },
  GEMINI_31_CONFIG: {
    model: 'gemini-3.1-pro-preview',
    default_params: {
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
  },
}));

// We need to import after mocks are set up
const { RecipeExtractor } = await import('./recipe-extractor');

// Access the private module-level function via the module
// Since buildRecipeExtractionPrompt is not exported, we test it indirectly
// through the class, or we can re-import the module and test the prompt logic

describe('RecipeExtractor', () => {
  // -----------------------------------------------------------------------
  // ExtractedRecipe type shape
  // -----------------------------------------------------------------------
  describe('ExtractedRecipe type conformance', () => {
    it('accepts a valid recipe object', () => {
      const recipe: ExtractedRecipe = {
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Hero Banner',
        resolves_to: 'hero',
        defaults_json: { heading_size: 'lg', text_align: 'center' },
        confidence: 0.95,
        bounds: { top_pct: 0, height_pct: 15 },
      };
      expect(recipe.pattern).toBe('hero');
      expect(recipe.confidence).toBeGreaterThan(0);
      expect(recipe.bounds?.top_pct).toBe(0);
    });

    it('allows optional bounds', () => {
      const recipe: ExtractedRecipe = {
        pattern: 'card-grid',
        variant: 'icon-title-body',
        label: 'Feature Cards (3-col)',
        resolves_to: 'feature-cards',
        defaults_json: { columns: 3 },
        confidence: 0.8,
      };
      expect(recipe.bounds).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Confidence filtering logic
  // -----------------------------------------------------------------------
  describe('confidence filtering and sorting', () => {
    let extractor: InstanceType<typeof RecipeExtractor>;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      extractor = new RecipeExtractor({
        browser: {} as Fetcher,
        googleApiKey: 'test-key',
      });
      mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
    });

    it('filters out recipes with confidence <= 0.5', async () => {
      // We test the filtering logic by mocking captureScreenshot + callVisionApi
      const recipes: ExtractedRecipe[] = [
        { pattern: 'hero', variant: 'v1', label: 'Hero', resolves_to: 'hero', defaults_json: {}, confidence: 0.9 },
        { pattern: 'card-grid', variant: 'v2', label: 'Cards', resolves_to: 'feature-cards', defaults_json: {}, confidence: 0.3 },
        { pattern: 'tabs', variant: 'v3', label: 'Tabs', resolves_to: 'tabs', defaults_json: {}, confidence: 0.51 },
        { pattern: 'utility', variant: 'v4', label: 'Footer', resolves_to: 'sticky-bar', defaults_json: {}, confidence: 0.5 },
      ];

      // Mock captureScreenshot to return a tiny PNG-like buffer
      (extractor as any).captureScreenshot = vi.fn().mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

      // Mock callVisionApi to return our test recipes
      (extractor as any).callVisionApi = vi.fn().mockResolvedValue(recipes);

      const result: ExtractionResult = await extractor.extractRecipes('https://example.com', 'nissan-au');

      // Should filter out confidence <= 0.5 (the 0.3 and 0.5 entries)
      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0].confidence).toBe(0.9); // highest first
      expect(result.suggestions[1].confidence).toBe(0.51);
    });

    it('sorts remaining recipes by confidence descending', async () => {
      const recipes: ExtractedRecipe[] = [
        { pattern: 'tabs', variant: 'v1', label: 'Tabs', resolves_to: 'tabs', defaults_json: {}, confidence: 0.6 },
        { pattern: 'hero', variant: 'v2', label: 'Hero', resolves_to: 'hero', defaults_json: {}, confidence: 0.95 },
        { pattern: 'card-grid', variant: 'v3', label: 'Cards', resolves_to: 'feature-cards', defaults_json: {}, confidence: 0.8 },
      ];

      (extractor as any).captureScreenshot = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
      (extractor as any).callVisionApi = vi.fn().mockResolvedValue(recipes);

      const result = await extractor.extractRecipes('https://example.com', 'kia-au');

      expect(result.suggestions[0].pattern).toBe('hero');
      expect(result.suggestions[1].pattern).toBe('card-grid');
      expect(result.suggestions[2].pattern).toBe('tabs');
    });

    it('returns empty suggestions when all recipes are low confidence', async () => {
      const recipes: ExtractedRecipe[] = [
        { pattern: 'hero', variant: 'v1', label: 'Hero', resolves_to: 'hero', defaults_json: {}, confidence: 0.2 },
        { pattern: 'tabs', variant: 'v2', label: 'Tabs', resolves_to: 'tabs', defaults_json: {}, confidence: 0.1 },
      ];

      (extractor as any).captureScreenshot = vi.fn().mockResolvedValue(new Uint8Array([1]));
      (extractor as any).callVisionApi = vi.fn().mockResolvedValue(recipes);

      const result = await extractor.extractRecipes('https://example.com', 'ford-au');

      expect(result.suggestions).toHaveLength(0);
    });

    it('includes screenshot_base64 in the result', async () => {
      (extractor as any).captureScreenshot = vi.fn().mockResolvedValue(new Uint8Array([65, 66, 67])); // "ABC"
      (extractor as any).callVisionApi = vi.fn().mockResolvedValue([]);

      const result = await extractor.extractRecipes('https://example.com', 'nissan-au');

      expect(result.screenshot_base64).toBeTruthy();
      expect(typeof result.screenshot_base64).toBe('string');
    });
  });

  // -----------------------------------------------------------------------
  // callVisionApi response parsing
  // -----------------------------------------------------------------------
  describe('callVisionApi error handling (private)', () => {
    let extractor: InstanceType<typeof RecipeExtractor>;

    beforeEach(() => {
      extractor = new RecipeExtractor({
        browser: {} as Fetcher,
        googleApiKey: 'test-key',
      });
    });

    it('throws on non-OK HTTP response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limited'),
      }));

      const callVisionApi = (extractor as any).callVisionApi.bind(extractor);
      await expect(callVisionApi('prompt', 'base64img', new AbortController().signal))
        .rejects.toThrow('Gemini 3.1 Pro API error: 429');
    });

    it('throws on empty response content', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{}] } }] }),
      }));

      const callVisionApi = (extractor as any).callVisionApi.bind(extractor);
      await expect(callVisionApi('prompt', 'base64img', new AbortController().signal))
        .rejects.toThrow('Empty response from Gemini 3.1 Pro');
    });

    it('throws on invalid JSON in response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'not valid json' }] } }],
        }),
      }));

      const callVisionApi = (extractor as any).callVisionApi.bind(extractor);
      await expect(callVisionApi('prompt', 'base64img', new AbortController().signal))
        .rejects.toThrow('Invalid JSON from Gemini 3.1 Pro');
    });

    it('throws when response JSON is missing recipes array', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: '{"sections": []}' }] } }],
        }),
      }));

      const callVisionApi = (extractor as any).callVisionApi.bind(extractor);
      await expect(callVisionApi('prompt', 'base64img', new AbortController().signal))
        .rejects.toThrow('Response missing "recipes" array');
    });

    it('returns parsed recipes on valid response', async () => {
      const recipes = [
        { pattern: 'hero', variant: 'v1', label: 'Hero', resolves_to: 'hero', defaults_json: {}, confidence: 0.9 },
      ];

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ recipes }) }] } }],
        }),
      }));

      const callVisionApi = (extractor as any).callVisionApi.bind(extractor);
      const result = await callVisionApi('prompt', 'base64img', new AbortController().signal);
      expect(result).toEqual(recipes);
    });
  });

  // -----------------------------------------------------------------------
  // buildRecipeExtractionPrompt (module-level function, tested indirectly)
  // -----------------------------------------------------------------------
  describe('prompt building', () => {
    it('extractRecipes calls callVisionApi with a prompt containing the oemId', async () => {
      const extractor = new RecipeExtractor({
        browser: {} as Fetcher,
        googleApiKey: 'test-key',
      });

      (extractor as any).captureScreenshot = vi.fn().mockResolvedValue(new Uint8Array([1]));

      const callSpy = vi.fn().mockResolvedValue([]);
      (extractor as any).callVisionApi = callSpy;

      await extractor.extractRecipes('https://example.com', 'mazda-au');

      expect(callSpy).toHaveBeenCalledTimes(1);
      const prompt = callSpy.mock.calls[0][0];
      expect(prompt).toContain('mazda-au');
      expect(prompt).toContain('pattern');
      expect(prompt).toContain('confidence');
    });
  });
});
