import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComposedPublicationCandidate, PublicationInteractionKind } from './composer';
import { classifyVisualMismatch, compareRgbaChannels, validateInBrowser } from './browser-validator';

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));

vi.mock('@cloudflare/puppeteer', () => ({ default: { launch } }));

const interactions: PublicationInteractionKind[] = ['accordion', 'tabs', 'modal', 'carousel', 'slider'];

function browserCandidate(): ComposedPublicationCandidate {
  const regions = interactions.map((interactionKind, order) => ({
    regionId: `region-${interactionKind}`,
    order,
    renderer: 'tailwind' as const,
    interactionKind,
    html: `<section data-oem-region-id="region-${interactionKind}"></section>`,
  }));
  const body = `<main>${regions.map(region => region.html).join('')}</main>`;
  return { body, referenceBody: body, regions, warnings: [], bytes: body.length, sha256: 'candidate-sha', etag: 'candidate-etag' };
}

interface FakeBrowserOptions {
  mismatch?: number;
  overflow?: number;
  bodyHeight?: number;
  brokenMedia?: boolean;
  interactionFailure?: PublicationInteractionKind;
}

function fakeBrowser(options: FakeBrowserOptions = {}) {
  let pageNumber = 0;
  const writtenPages: FakePage[] = [];
  class FakePage {
    readonly handlers = new Map<string, (event: any) => void>();
    html = '';
    viewport = { width: 0, height: 0 };
    screenshotComplete = false;

    on(event: string, handler: (event: any) => void) { this.handlers.set(event, handler); return this; }
    async setViewport(viewport: { width: number; height: number }) { this.viewport = viewport; }
    async setContent(html: string) {
      this.html = html;
      if (options.brokenMedia && html === browserCandidate().body) {
        this.handlers.get('requestfailed')?.({ url: () => 'https://cdn.test/broken.webp', failure: () => ({ errorText: 'net::ERR_FAILED' }) });
      }
    }
    async addStyleTag() {}
    async screenshot() {
      await Promise.resolve();
      this.screenshotComplete = true;
      return new Uint8Array([137, 80, 78, 71, pageNumber]);
    }
    async close() {}
    async evaluate(fn: (...args: any[]) => unknown) {
      const source = fn.toString();
      if (source.includes('document.fonts')) return undefined;
      if (source.includes('horizontalOverflowPx')) {
        return {
          horizontalOverflowPx: options.overflow ?? 0,
          bodyHeight: options.bodyHeight ?? 1200,
          brokenMedia: options.brokenMedia ? ['https://cdn.test/broken.webp'] : [],
        };
      }
      if (source.includes('data-clone-carousel-index')) {
        return interactions.map(kind => ({
          regionId: `region-${kind}`,
          kind,
          passed: this.screenshotComplete && kind !== options.interactionFailure,
          detail: !this.screenshotComplete ? 'interaction raced screenshot' : kind === options.interactionFailure ? 'state did not change' : 'state changed',
        }));
      }
      if (source.includes('diffPixels')) {
        return { mismatchPercent: options.mismatch ?? 0.1, diffDataUrl: 'data:image/png;base64,iVBORw0KGgo=' };
      }
      throw new Error(`Unexpected evaluate call: ${source.slice(0, 100)}`);
    }
  }
  const browser = {
    async newPage() {
      pageNumber += 1;
      const page = new FakePage();
      writtenPages.push(page);
      return page;
    },
    close: vi.fn(async () => {}),
    writtenPages,
  };
  return browser;
}

beforeEach(() => launch.mockReset());

describe('browser publication validation', () => {
  it('warns from 20 percent visual mismatch and blocks above 35 percent', () => {
    expect(classifyVisualMismatch(0.1999)).toBe('pass');
    expect(classifyVisualMismatch(0.2)).toBe('warning');
    expect(classifyVisualMismatch(0.35)).toBe('warning');
    expect(classifyVisualMismatch(0.3501)).toBe('blocking');
  });

  it('uses the maximum RGBA channel delta from the fidelity report algorithm', () => {
    expect(compareRgbaChannels(
      new Uint8ClampedArray([0, 0, 0, 255, 40, 40, 40, 255]),
      new Uint8ClampedArray([25, 0, 0, 255, 41, 40, 40, 255]),
      0.1,
    )).toEqual({ comparedPixels: 2, diffPixels: 0, mismatchPercent: 0 });
    expect(compareRgbaChannels(
      new Uint8ClampedArray([0, 0, 0, 255]),
      new Uint8ClampedArray([27, 0, 0, 255]),
      0.1,
    ).mismatchPercent).toBe(1);
  });

  it('captures fixed viewports, validates every interaction kind, and emits revision evidence', async () => {
    const browser = fakeBrowser();
    launch.mockResolvedValue(browser);
    const evidence: Array<{ key: string; bytes: Uint8Array }> = [];

    const result = await validateInBrowser(browserCandidate(), {
      browser: {} as Fetcher,
      evidencePrefix: 'model-pages/nissan-au-ariya/publication/revisions/21/evidence',
      writeEvidence: async artifact => { evidence.push(artifact); },
    });

    expect(result.blocking).toEqual([]);
    expect(result.viewports.map(viewport => [viewport.name, viewport.horizontalOverflowPx, viewport.bodyHeight])).toEqual([
      ['desktop', 0, 1200], ['tablet', 0, 1200], ['mobile', 0, 1200],
    ]);
    expect(result.viewports.flatMap(viewport => viewport.interactions).every(item => item.passed)).toBe(true);
    expect(evidence).toHaveLength(9);
    expect(evidence.map(item => item.key)).toContain('model-pages/nissan-au-ariya/publication/revisions/21/evidence/mobile/diff.png');
    expect(evidence.every(item => item.bytes.byteLength > 0)).toBe(true);
  });

  it('blocks overflow, failed media, non-finite height, failed interaction, and high mismatch', async () => {
    launch.mockResolvedValue(fakeBrowser({
      mismatch: 0.3501,
      overflow: 24,
      bodyHeight: Number.POSITIVE_INFINITY,
      brokenMedia: true,
      interactionFailure: 'tabs',
    }));

    const result = await validateInBrowser(browserCandidate(), { browser: {} as Fetcher });

    expect(result.blocking.map(item => item.code)).toEqual(expect.arrayContaining([
      'visual-mismatch',
      'horizontal-overflow',
      'media-request-failed',
      'invalid-body-height',
      'interaction-failed',
    ]));
  });

  it('returns deterministic blocking viewport evidence when the browser binding is unavailable', async () => {
    const first = await validateInBrowser(browserCandidate(), {});
    const second = await validateInBrowser(browserCandidate(), {});

    expect(first).toEqual(second);
    expect(first.blocking.map(item => item.code)).toEqual(['browser-unavailable']);
    expect(first.viewports.map(item => item.name)).toEqual(['desktop', 'tablet', 'mobile']);
  });
});
