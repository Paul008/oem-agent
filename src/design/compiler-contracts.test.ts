import { describe, expect, it } from 'vitest';
import {
  COMPILE_JOB_STATUSES,
  RENDER_TARGETS,
  type ArtifactStore,
  type BrowserCaptureProvider,
  isCompileJobStatus,
  isRenderTarget,
  normalizeRenderTargets,
} from './compiler-contracts';

describe('compiler contracts', () => {
  it('defines the compile run lifecycle expected by the admin progress UI', () => {
    expect(COMPILE_JOB_STATUSES).toEqual([
      'queued',
      'capturing',
      'segmenting',
      'compiling',
      'qa',
      'publishing',
      'succeeded',
      'failed',
    ]);

    expect(isCompileJobStatus('capturing')).toBe(true);
    expect(isCompileJobStatus('completed')).toBe(false);
  });

  it('defines portable render targets including Alpine islands', () => {
    expect(RENDER_TARGETS).toEqual([
      'vue',
      'static-html',
      'tailwind-html',
      'alpine-island',
      'react',
      'web-component',
    ]);

    expect(isRenderTarget('alpine-island')).toBe(true);
    expect(isRenderTarget('svelte')).toBe(false);
  });

  it('normalizes render target input for API callers', () => {
    expect(normalizeRenderTargets(undefined)).toEqual(['vue']);
    expect(normalizeRenderTargets(['tailwind-html', 'unknown', 'tailwind-html', 'alpine-island'])).toEqual([
      'tailwind-html',
      'alpine-island',
    ]);
    expect(normalizeRenderTargets(['unknown'])).toEqual(['vue']);
  });

  it('keeps providers mockable behind interfaces', async () => {
    const browser: BrowserCaptureProvider = {
      async capture(job) {
        return {
          ok: true,
          value: {
            runId: job.runId,
            oemId: job.oemId,
            modelSlug: job.modelSlug,
            sourceUrl: job.sourceUrl,
            screenshots: [],
            warnings: [],
          },
        };
      },
    };
    const store: ArtifactStore = {
      async put(path, value) {
        return {
          path,
          bytes: typeof value === 'string' ? value.length : value.byteLength,
        };
      },
      async get() {
        return { ok: false, error: 'not implemented in test' };
      },
    };

    const job = {
      runId: 'run-1',
      oemId: 'volkswagen-au' as const,
      modelSlug: 'amarok',
      sourceUrl: 'https://www.volkswagen.com.au/en/models/amarok.html',
      status: 'queued' as const,
      requestedTargets: ['vue' as const],
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-03T00:00:00.000Z',
    };

    await expect(browser.capture(job)).resolves.toMatchObject({
      ok: true,
      value: {
        runId: 'run-1',
        oemId: 'volkswagen-au',
      },
    });
    await expect(store.put('runs/run-1/report.json', '{}')).resolves.toMatchObject({
      path: 'runs/run-1/report.json',
      bytes: 2,
    });
  });
});
