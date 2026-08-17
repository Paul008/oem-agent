import { describe, expect, it } from 'vitest';
import type { PipelineResult, VehicleModelPage } from '../oem/types';
import { NISSAN_MODEL_PAGE_BUILD_PLAN } from './nissan-page-builder';
import {
  publishNissanModelPageCandidate,
  stageNissanModelPageCandidate,
  validateNissanModelPageArtifact,
  type NissanPageCandidateStore,
} from './nissan-page-candidates';

class MemoryCandidateStore implements NissanPageCandidateStore {
  readonly objects = new Map<string, { body: string; customMetadata?: Record<string, string> }>();

  constructor(initial: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.objects.set(key, { body: JSON.stringify(value) });
    }
  }

  async get(key: string): Promise<any> {
    const entry = this.objects.get(key);
    if (!entry) return null;
    return {
      customMetadata: entry.customMetadata,
      httpMetadata: { contentType: 'application/json' },
      arrayBuffer: async () => new TextEncoder().encode(entry.body).buffer,
      json: async () => JSON.parse(entry.body),
      text: async () => entry.body,
    };
  }

  async put(key: string, value: string | ArrayBuffer, options?: R2PutOptions): Promise<void> {
    const body = typeof value === 'string' ? value : new TextDecoder().decode(value);
    this.objects.set(key, { body, customMetadata: options?.customMetadata });
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

function completePage(sourceUrl = 'https://www.nissan.com.au/vehicles/browse-range/qashqai.html'): VehicleModelPage {
  return {
    id: 'nissan-au-qashqai',
    slug: 'qashqai',
    name: 'QASHQAI',
    oem_id: 'nissan-au',
    header: { slides: [] },
    content: {
      rendered: '<main>Nissan QASHQAI</main>',
      sections: [
        { id: 'hero', type: 'hero' },
        { id: 'intro', type: 'intro' },
        { id: 'features', type: 'feature-cards' },
        { id: 'colours', type: 'color-picker' },
        { id: 'specs', type: 'specs-grid' },
        { id: 'gallery', type: 'gallery' },
        { id: 'cta', type: 'cta-banner' },
      ] as any,
    },
    form: false,
    variant_link: '/build/qashqai',
    generated_at: '2026-07-21T00:00:00.000Z',
    source_url: sourceUrl,
    version: 1,
  };
}

function completeClonePage(): VehicleModelPage {
  return {
    ...completePage(),
    active_mode: 'clone',
    content: {
      rendered: '<main>Nissan QASHQAI clone</main>'.repeat(800),
      sections: [],
      modes: {
        clone: {
          rendered: '<main>Nissan QASHQAI clone</main>'.repeat(800),
          source_url: 'https://www.nissan.com.au/vehicles/browse-range/qashqai.html',
          captured_at: '2026-07-21T00:00:00.000Z',
          viewport: { width: 1440, height: 1100 },
          asset_map: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`asset-${index}`, `https://example.com/${index}.jpg`])),
          stylesheet_urls: ['https://www.nissan.com.au/nissan.css'],
          section_index: [],
          stripped_selectors: [],
          warnings: [],
          interactions: [{ id: 'gallery', type: 'carousel', trigger_count: 2, panel_count: 2 }],
          runtime_js: 'window.__cloneRuntime = true;',
          runtime_version: 'clone-runtime-v1',
        },
      },
    },
  } as VehicleModelPage;
}

describe('Nissan page candidate staging', () => {
  const target = NISSAN_MODEL_PAGE_BUILD_PLAN[0];
  const latestKey = 'pages/definitions/nissan-au/qashqai/latest.json';

  it('stores a review candidate and restores the prior public artifact', async () => {
    const published = { ...completePage(), version: 7, name: 'Published QASHQAI' };
    const generated = completePage();
    const store = new MemoryCandidateStore({ [latestKey]: published });
    const pipeline = {
      run: async (...args: any[]): Promise<PipelineResult> => {
        const stagingSlug = args[1];
        expect(stagingSlug).toBe('qashqai--candidate-candidate-001');
        const options = args[4];
        expect(options.validateSections(generated.content.sections)).toEqual([]);
        await store.put(`pages/definitions/nissan-au/${stagingSlug}/latest.json`, JSON.stringify(generated));
        return { success: true, sections: generated.content.sections } as PipelineResult;
      },
    };

    const result = await stageNissanModelPageCandidate(store, pipeline, target, {
      candidateId: 'candidate-001',
      now: () => new Date('2026-07-21T01:00:00.000Z'),
    });

    expect(result.success).toBe(true);
    expect(result.candidateKey).toBe('pages/candidates/nissan-au/qashqai/candidate-001.json');
    expect(JSON.parse(store.objects.get(latestKey)!.body)).toEqual(published);
    const candidate = store.objects.get(result.candidateKey!);
    expect(JSON.parse(candidate!.body)).toEqual(generated);
    expect(candidate!.customMetadata).toMatchObject({
      candidate_status: 'pending-review',
      oem_id: 'nissan-au',
      model_slug: 'qashqai',
    });
    expect(store.objects.has('pages/definitions/nissan-au/qashqai--candidate-candidate-001/latest.json')).toBe(false);
  });

  it('removes a temporary latest artifact when no public artifact existed', async () => {
    const generated = completePage();
    const store = new MemoryCandidateStore();
    const pipeline = {
      run: async (_oemId: string, stagingSlug: string): Promise<PipelineResult> => {
        await store.put(`pages/definitions/nissan-au/${stagingSlug}/latest.json`, JSON.stringify(generated));
        return { success: true, sections: generated.content.sections } as PipelineResult;
      },
    };

    const result = await stageNissanModelPageCandidate(store, pipeline, target, {
      candidateId: 'candidate-002',
    });

    expect(result.success).toBe(true);
    expect(store.objects.has(latestKey)).toBe(false);
    expect(store.objects.has(result.candidateKey!)).toBe(true);
  });

  it('stages an explicit clone candidate without structured section validation', async () => {
    const generated = completeClonePage();
    const store = new MemoryCandidateStore();
    const pipeline = {
      run: async (_oemId: string, stagingSlug: string, _sourceUrl: string, _modelName: string, options: any): Promise<PipelineResult> => {
        expect(options.forceClone).toBe(true);
        expect(options.cloneOnly).toBe(true);
        expect(options.validateSections).toBeUndefined();
        await store.put(`pages/definitions/nissan-au/${stagingSlug}/latest.json`, JSON.stringify(generated));
        return { success: true, sections: [] } as unknown as PipelineResult;
      },
    };

    const result = await stageNissanModelPageCandidate(store, pipeline, target, {
      candidateId: 'clone-candidate-001',
      forceClone: true,
    });

    expect(result.success).toBe(true);
    expect(store.objects.get(result.candidateKey!)?.customMetadata).toMatchObject({
      candidate_status: 'pending-review',
      artifact_mode: 'clone',
    });
  });

  it('rejects a candidate with a non-official source and restores public latest', async () => {
    const published = { ...completePage(), version: 4 };
    const generated = completePage('https://nissan-adme.adus.com.au/api/');
    const store = new MemoryCandidateStore({ [latestKey]: published });
    const pipeline = {
      run: async (_oemId: string, stagingSlug: string): Promise<PipelineResult> => {
        await store.put(`pages/definitions/nissan-au/${stagingSlug}/latest.json`, JSON.stringify(generated));
        return { success: true, sections: generated.content.sections } as PipelineResult;
      },
    };

    const result = await stageNissanModelPageCandidate(store, pipeline, target, {
      candidateId: 'candidate-bad',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('source_url does not match the reviewed Nissan model source');
    expect(store.objects.has('pages/candidates/nissan-au/qashqai/candidate-bad.json')).toBe(false);
    expect(JSON.parse(store.objects.get(latestKey)!.body)).toEqual(published);
  });
});

describe('validateNissanModelPageArtifact', () => {
  it('requires matching identity, official source, and minimum sections', () => {
    const target = NISSAN_MODEL_PAGE_BUILD_PLAN[0];
    expect(validateNissanModelPageArtifact(target, completePage())).toEqual([]);
    expect(validateNissanModelPageArtifact(target, {
      ...completePage(),
      id: 'wrong-id',
      content: { rendered: '', sections: [{ id: 'hero', type: 'hero' }] as any },
    })).toEqual(expect.arrayContaining([
      'page id must be nissan-au-qashqai',
      'missing model introduction section',
      'missing color-picker section',
    ]));
  });

  it('accepts only complete clones when clone validation is explicit', () => {
    const target = NISSAN_MODEL_PAGE_BUILD_PLAN[0];
    expect(validateNissanModelPageArtifact(target, completeClonePage(), { mode: 'clone' })).toEqual([]);

    const incomplete = completeClonePage() as any;
    incomplete.content.modes.clone.rendered = '<main>Too short</main>';
    incomplete.content.rendered = '<main>Too short</main>';
    incomplete.content.modes.clone.asset_map = {};
    expect(validateNissanModelPageArtifact(target, incomplete, { mode: 'clone' })).toEqual(expect.arrayContaining([
      'clone rendered HTML is incomplete',
      'clone asset map is incomplete',
    ]));
  });

  it('allows the Navara microsite clone to retain passive native rails without invented controls', () => {
    const target = NISSAN_MODEL_PAGE_BUILD_PLAN.find(item => item.modelSlug === 'all-new-navara')!;
    const clone = completeClonePage() as any;
    clone.id = target.pageId;
    clone.slug = target.modelSlug;
    clone.name = target.modelName;
    clone.source_url = target.sourceUrl;
    clone.content.modes.clone.source_url = target.sourceUrl;
    clone.content.modes.clone.interactions = [];

    expect(validateNissanModelPageArtifact(target, clone, { mode: 'clone' })).toEqual([]);
  });
});

describe('Nissan page candidate promotion', () => {
  const target = NISSAN_MODEL_PAGE_BUILD_PLAN[0];
  const candidateKey = 'pages/candidates/nissan-au/qashqai/candidate-001.json';
  const latestKey = 'pages/definitions/nissan-au/qashqai/latest.json';

  it('publishes a revalidated candidate with a versioned backup and review metadata', async () => {
    const candidate = completePage();
    const store = new MemoryCandidateStore();
    store.objects.set(candidateKey, {
      body: JSON.stringify(candidate),
      customMetadata: { candidate_status: 'pending-review' },
    });

    const result = await publishNissanModelPageCandidate(store, target, 'candidate-001', {
      reviewedBy: 'developer@example.com',
      now: () => new Date('2026-07-21T02:00:00.000Z'),
    });

    expect(result.success).toBe(true);
    expect(result.publishedKey).toBe(latestKey);
    expect(result.versionKey).toContain('pages/definitions/nissan-au/qashqai/v-');
    expect(JSON.parse(store.objects.get(latestKey)!.body)).toEqual(candidate);
    expect(JSON.parse(store.objects.get(result.versionKey!)!.body)).toEqual(candidate);
    expect(store.objects.get(candidateKey)!.customMetadata).toMatchObject({
      candidate_status: 'published',
      reviewed_by: 'developer@example.com',
      published_at: '2026-07-21T02:00:00.000Z',
    });
  });

  it('snapshots the replaced public artifact for rollback', async () => {
    const published = { ...completePage(), version: 8, name: 'Previous public QASHQAI' };
    const candidate = { ...completePage(), version: 9, name: 'Reviewed QASHQAI' };
    const store = new MemoryCandidateStore({ [latestKey]: published });
    store.objects.set(candidateKey, {
      body: JSON.stringify(candidate),
      customMetadata: { candidate_status: 'pending-review', artifact_mode: 'structured' },
    });

    const result = await publishNissanModelPageCandidate(store, target, 'candidate-001', {
      reviewedBy: 'developer@example.com',
      now: () => new Date('2026-07-21T02:00:00.000Z'),
    });

    expect(result.success).toBe(true);
    expect(result.rollbackKey).toContain('pages/definitions/nissan-au/qashqai/rollback-');
    expect(JSON.parse(store.objects.get(result.rollbackKey!)!.body)).toEqual(published);
    expect(store.objects.get(result.rollbackKey!)!.customMetadata).toMatchObject({
      rollback_for_candidate: 'candidate-001',
      replaced_key: latestKey,
    });
  });

  it('refuses an invalid candidate without replacing public latest', async () => {
    const published = { ...completePage(), version: 8, name: 'Current public page' };
    const invalid = {
      ...completePage('https://nissan-adme.adus.com.au/api/'),
      content: { rendered: '', sections: [{ id: 'hero', type: 'hero' }] },
    };
    const store = new MemoryCandidateStore({
      [latestKey]: published,
      [candidateKey]: invalid,
    });

    const result = await publishNissanModelPageCandidate(store, target, 'candidate-001', {
      reviewedBy: 'developer@example.com',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('source_url does not match the reviewed Nissan model source');
    expect(JSON.parse(store.objects.get(latestKey)!.body)).toEqual(published);
  });

  it('publishes a revalidated explicit clone candidate', async () => {
    const candidate = completeClonePage();
    const store = new MemoryCandidateStore();
    store.objects.set(candidateKey, {
      body: JSON.stringify(candidate),
      customMetadata: { candidate_status: 'pending-review', artifact_mode: 'clone' },
    });

    const result = await publishNissanModelPageCandidate(store, target, 'candidate-001', {
      reviewedBy: 'developer@example.com',
    });

    expect(result.success).toBe(true);
    expect(store.objects.get(latestKey)?.customMetadata).toMatchObject({ artifact_mode: 'clone' });
  });

  it('requires a named reviewer before promotion', async () => {
    const store = new MemoryCandidateStore({ [candidateKey]: completePage() });
    const result = await publishNissanModelPageCandidate(store, target, 'candidate-001', {
      reviewedBy: '   ',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(['reviewedBy is required before candidate publication']);
    expect(store.objects.has(latestKey)).toBe(false);
  });
});
