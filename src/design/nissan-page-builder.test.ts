import { describe, expect, it, vi } from 'vitest';
import {
  NISSAN_MODEL_PAGE_BUILD_PLAN,
  buildNissanModelPages,
  validateNissanPageSections,
  type NissanPagePipeline,
} from './nissan-page-builder';

describe('Nissan model-page builder plan', () => {
  it('requires every minimum model-page capability before publication', () => {
    const complete = [
      { id: 'hero', type: 'hero' },
      { id: 'intro', type: 'intro' },
      { id: 'features', type: 'feature-cards' },
      { id: 'colours', type: 'color-picker' },
      { id: 'specs', type: 'specs-grid' },
      { id: 'gallery', type: 'gallery' },
      { id: 'cta', type: 'cta-banner' },
    ];
    expect(validateNissanPageSections(complete as any)).toEqual([]);

    expect(validateNissanPageSections([
      { id: 'hero', type: 'hero' },
      { id: 'intro', type: 'intro' },
    ] as any)).toEqual([
      'missing feature/story section',
      'missing color-picker section',
      'missing specifications section',
      'missing gallery/360 section',
      'missing price, offer, or enquiry CTA section',
    ]);
  });

  it('defines the six official Nissan Australia page targets', () => {
    expect(NISSAN_MODEL_PAGE_BUILD_PLAN.map(target => target.pageId)).toEqual([
      'nissan-au-qashqai',
      'nissan-au-new-x-trail',
      'nissan-au-patrol',
      'nissan-au-all-new-navara',
      'nissan-au-z',
      'nissan-au-ariya',
    ]);
    expect(NISSAN_MODEL_PAGE_BUILD_PLAN).toHaveLength(6);
    const expectedSources: Record<string, string> = {
      qashqai: 'https://www.nissan.com.au/vehicles/browse-range/qashqai.html',
      'new-x-trail': 'https://www.nissan.com.au/vehicles/browse-range/new-x-trail.html',
      patrol: 'https://www.nissan.com.au/vehicles/browse-range/patrol.html',
      'all-new-navara': 'https://navara.nissan.com.au/',
      z: 'https://www.nissan.com.au/vehicles/browse-range/Z.html',
      ariya: 'https://www.nissan.com.au/vehicles/browse-range/ariya.html',
    };
    for (const target of NISSAN_MODEL_PAGE_BUILD_PLAN) {
      const url = new URL(target.sourceUrl);
      expect(url.protocol).toBe('https:');
      expect(['www.nissan.com.au', 'navara.nissan.com.au']).toContain(url.hostname);
      expect(target.sourceUrl).toBe(expectedSources[target.modelSlug]);
    }
  });

  it('defaults to a no-write plan and never calls the pipeline', async () => {
    const run = vi.fn();
    const result = await buildNissanModelPages({ run } as unknown as NissanPagePipeline);

    expect(result.dryRun).toBe(true);
    expect(result.planned).toHaveLength(6);
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses direct publication and requires the review-candidate workflow', async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const result = await buildNissanModelPages(
      { run } as unknown as NissanPagePipeline,
      { dryRun: false, modelSlugs: ['qashqai'], forceClone: true },
    );

    expect(run).not.toHaveBeenCalled();
    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([{
      pageId: 'nissan-au-qashqai',
      error: 'Direct Nissan page publication is disabled; use the review-candidate workflow',
    }]);
  });
});
