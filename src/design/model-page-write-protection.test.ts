import { describe, expect, it } from 'vitest';

import { isModelPageWriteProtected } from '../model-page-protection';
import { PageCapturer } from './page-capturer';
import { PageCloner } from './page-cloner';
import { PageGenerator } from './page-generator';
import { AdaptivePipeline } from './pipeline';
import { PageStructurer } from './page-structurer';

const throwingR2Bucket = {
  get() {
    throw new Error('R2 get should not be called for protected model page writes');
  },
  put() {
    throw new Error('R2 put should not be called for protected model page writes');
  },
};

const throwingSupabase = {
  from() {
    throw new Error('Supabase should not be called for protected model page writes');
  },
};

const throwingAiRouter = {
  route() {
    throw new Error('AI router should not be called for protected model page writes');
  },
};

const throwingDesignAgent = {
  capturePageForGeneration() {
    throw new Error('Design capture should not be called for protected model page writes');
  },
};

const throwingBrowser = {
  fetch() {
    throw new Error('Browser binding should not be called for protected model page writes');
  },
};

describe('model page write protection', () => {
  it('identifies live OEMs that must remain read-only', () => {
    expect(isModelPageWriteProtected('gac-au')).toBe(true);
    expect(isModelPageWriteProtected('foton-au')).toBe(true);
    expect(isModelPageWriteProtected('nissan-au', 'ariya')).toBe(true);
    expect(isModelPageWriteProtected('nissan-au', 'ariya', 'manual-editor')).toBe(false);
    expect(isModelPageWriteProtected('mazda-au')).toBe(false);
  });

  it('blocks PageGenerator writes before data, browser, image, or AI work', async () => {
    const generator = new PageGenerator({
      supabase: throwingSupabase as any,
      aiRouter: throwingAiRouter as any,
      designAgent: throwingDesignAgent as any,
      r2Bucket: throwingR2Bucket as any,
      browser: throwingBrowser as any,
    });

    const result = await generator.generateModelPage('gac-au', 'emkoo');
    expect(result.success).toBe(false);
    expect(result.error).toContain('protected from admin writes');

    const decision = await generator.shouldRegeneratePage('foton-au', 'tunland');
    expect(decision.shouldRegenerate).toBe(false);
    expect(decision.reason).toContain('protected from admin writes');
    expect(decision.checksDone).toEqual(['write_protection']);
  });

  it('blocks PageCapturer clone and screenshot writes before browser work', async () => {
    const capturer = new PageCapturer({
      r2Bucket: throwingR2Bucket as any,
      browser: throwingBrowser as any,
    });

    const cloneResult = await capturer.captureModelPage(
      'foton-au',
      'tunland',
      'https://example.test/tunland',
    );
    expect(cloneResult.success).toBe(false);
    expect(cloneResult.error).toContain('protected from admin writes');

    const screenshots = await capturer.captureSectionScreenshots(
      'https://example.test/emkoo',
      'gac-au',
      'emkoo',
    );
    expect(screenshots.size).toBe(0);
  });

  it('blocks PageStructurer writes before R2 or AI work', async () => {
    const structurer = new PageStructurer({
      aiRouter: throwingAiRouter as any,
      r2Bucket: throwingR2Bucket as any,
    });

    const structureResult = await structurer.structurePage('gac-au', 'emkoo');
    expect(structureResult.success).toBe(false);
    expect(structureResult.error).toContain('protected from admin writes');

    const regenerateResult = await structurer.regenerateSection(
      'foton-au',
      'tunland',
      'section-hero-0',
      'hero',
    );
    expect(regenerateResult.success).toBe(false);
    expect(regenerateResult.error).toContain('protected from admin writes');
  });

  it('blocks adaptive pipeline writes before extraction run logging', async () => {
    const pipeline = new AdaptivePipeline({
      aiRouter: throwingAiRouter as any,
      r2Bucket: throwingR2Bucket as any,
      browser: throwingBrowser as any,
      supabase: throwingSupabase as any,
    });

    const result = await pipeline.run(
      'gac-au',
      'emkoo',
      'https://example.test/emkoo',
      'EMKOO',
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('protected from admin writes');
    expect(result.steps[0]).toMatchObject({
      step: 'clone',
      status: 'skipped',
    });
  });

  it('blocks legacy PageCloner writes before browser work', async () => {
    const cloner = new PageCloner({
      r2Bucket: throwingR2Bucket as any,
      browser: throwingBrowser as any,
      moonshotApiKey: 'test-key',
      supabase: throwingSupabase as any,
    });

    const result = await cloner.cloneModelPage(
      'foton-au',
      'tunland',
      'https://example.test/tunland',
      'Tunland',
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('protected from admin writes');
  });
});
