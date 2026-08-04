// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComposedPublicationCandidate, PublicationInteractionKind } from './composer';
import {
  auditPublicationPage,
  classifyVisualMismatch,
  compareRgbaChannels,
  compareScreenshotsInPage,
  evaluatePublicationInteractions,
  validateInBrowser,
  waitForPublicationResources,
} from './browser-validator';

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
  return { revision: 21, body, referenceBody: body, regions, warnings: [], bytes: body.length, sha256: 'candidate-sha', etag: 'candidate-etag' };
}

interface FakeBrowserOptions {
  mismatch?: number;
  overflow?: number;
  bodyHeight?: number;
  brokenMedia?: boolean;
  interactionFailure?: PublicationInteractionKind;
  networkSettleFailure?: boolean;
  candidateHeight?: number;
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
    async waitForNetworkIdle() {
      if (options.networkSettleFailure) throw new Error('network idle timeout');
    }
    async screenshot() {
      await Promise.resolve();
      this.screenshotComplete = true;
      return new Uint8Array([137, 80, 78, 71, pageNumber]);
    }
    async close() {}
    async evaluate(fn: (...args: any[]) => unknown) {
      if (fn === waitForPublicationResources) return { timedOut: false, stalledResources: [] };
      if (fn === auditPublicationPage) {
        return {
          horizontalOverflowPx: options.overflow ?? 0,
          bodyHeight: options.bodyHeight ?? 1200,
          brokenMedia: options.brokenMedia ? ['https://cdn.test/broken.webp'] : [],
        };
      }
      if (fn === evaluatePublicationInteractions) {
        return interactions.map(kind => ({
          regionId: `region-${kind}`,
          kind,
          passed: this.screenshotComplete && kind !== options.interactionFailure,
          detail: !this.screenshotComplete ? 'interaction raced screenshot' : kind === options.interactionFailure ? 'state did not change' : 'state changed',
        }));
      }
      if (fn === compareScreenshotsInPage) {
        return {
          mismatchPercent: options.mismatch ?? 0.1,
          sourceSize: { width: 1440, height: 1200 },
          candidateSize: { width: 1440, height: options.candidateHeight ?? 1200 },
          diffDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        };
      }
      throw new Error('Unexpected evaluate callback');
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
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function installDom(html: string): void {
  document.body.innerHTML = html;
}

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

  it('compares the natural-size minimum canvas and reports dimension mismatch without scaling', async () => {
    const pixels = new Map([
      ['source', { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(10) }],
      ['candidate', { width: 2, height: 3, data: new Uint8ClampedArray(24).fill(10) }],
    ]);
    class FakeImage {
      naturalWidth = 0; naturalHeight = 0; data = new Uint8ClampedArray();
      set src(value: string) { const item = pixels.get(value)!; this.naturalWidth = item.width; this.naturalHeight = item.height; this.data = item.data; }
      async decode() {}
    }
    class FakeCanvas {
      width = 0; height = 0; image?: FakeImage;
      getContext() {
        return {
          drawImage: (image: FakeImage) => { this.image = image; },
          getImageData: (_x: number, _y: number, width: number, height: number) => {
            const data = new Uint8ClampedArray(width * height * 4);
            for (let y = 0; y < height; y += 1) data.set(this.image!.data.subarray(y * this.image!.naturalWidth * 4, y * this.image!.naturalWidth * 4 + width * 4), y * width * 4);
            return { data };
          },
          createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
          putImageData: () => {},
        };
      }
      toDataURL() { return 'data:image/png;base64,iVBORw0KGgo='; }
    }
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('document', { createElement: () => new FakeCanvas() });

    const result = await compareScreenshotsInPage({ sourceUrl: 'source', candidateUrl: 'candidate', threshold: 0.1 });

    expect(result.mismatchPercent).toBe(0);
    expect(result.sourceSize).toEqual({ width: 2, height: 2 });
    expect(result.candidateSize).toEqual({ width: 2, height: 3 });
  });

  it('executes real interaction transitions and enforces final ARIA and panel state', async () => {
    installDom(`<main>
      <section data-oem-region-id="accordion"><button aria-expanded="false">Open</button></section>
      <section data-oem-region-id="tabs"><button role="tab" aria-selected="false" aria-controls="panel">Tab</button><div id="panel" hidden>Panel</div></section>
      <section data-oem-region-id="modal"><button aria-expanded="false">Open</button></section>
      <section data-oem-region-id="carousel" data-clone-carousel-index="0"><button>Next</button></section>
    </main>`);
    const accordion = document.querySelector('[data-oem-region-id="accordion"] button')!;
    const modal = document.querySelector('[data-oem-region-id="modal"] button')!;
    const tab = document.querySelector('[role="tab"]')!;
    const panel = document.getElementById('panel')!;
    const carousel = document.querySelector('[data-oem-region-id="carousel"]')!;
    accordion.addEventListener('click', () => accordion.setAttribute('aria-expanded', 'true'));
    modal.addEventListener('click', () => modal.setAttribute('aria-expanded', 'true'));
    tab.addEventListener('click', () => { tab.setAttribute('aria-selected', 'true'); panel.hidden = false; });
    carousel.querySelector('button')!.addEventListener('click', () => carousel.setAttribute('data-clone-carousel-index', '1'));

    const result = await evaluatePublicationInteractions([
      { regionId: 'accordion', interactionKind: 'accordion' },
      { regionId: 'tabs', interactionKind: 'tabs' },
      { regionId: 'modal', interactionKind: 'modal' },
      { regionId: 'carousel', interactionKind: 'carousel' },
    ]);

    expect(result.every(item => item.passed)).toBe(true);

    installDom('<section data-oem-region-id="bad"><button role="tab" aria-selected="false" aria-controls="bad-panel">Tab</button><div id="bad-panel" hidden>Panel</div></section>');
    document.querySelector('button')!.addEventListener('click', event => (event.currentTarget as Element).setAttribute('aria-selected', 'true'));
    const invalid = await evaluatePublicationInteractions([{ regionId: 'bad', interactionKind: 'tabs' }]);
    expect(invalid[0].passed).toBe(false);
  });

  it('bounds stalled resources and lets explicit image failure settle deterministically', async () => {
    const stalledImage = { complete: false, currentSrc: 'https://cdn.test/stalled.webp', src: 'https://cdn.test/stalled.webp', addEventListener: () => {} };
    vi.stubGlobal('document', { fonts: { ready: new Promise(() => {}) }, images: [stalledImage] });
    const stalled = await waitForPublicationResources({ timeoutMs: 5 });
    expect(stalled).toEqual({ timedOut: true, stalledResources: ['https://cdn.test/stalled.webp', 'document.fonts'] });

    const failedImage = { complete: false, currentSrc: 'https://cdn.test/failed.webp', src: 'https://cdn.test/failed.webp', addEventListener: (kind: string, listener: () => void) => { if (kind === 'error') setTimeout(listener, 0); } };
    vi.stubGlobal('document', { fonts: { ready: Promise.resolve() }, images: [failedImage] });
    const failed = await waitForPublicationResources({ timeoutMs: 50 });
    expect(failed.timedOut).toBe(false);
  });

  it('requires revision-scoped evidence persistence before launching a browser', async () => {
    const missing = await validateInBrowser(browserCandidate(), { browser: {} as Fetcher });
    const badPrefix = await validateInBrowser(browserCandidate(), {
      browser: {} as Fetcher,
      evidencePrefix: 'model-pages/publication/candidates/temp/evidence',
      writeEvidence: async () => {},
    });

    expect(missing.blocking.map(item => item.code)).toEqual(['evidence-required']);
    expect(badPrefix.blocking.map(item => item.code)).toEqual(['evidence-required']);
    expect(launch).not.toHaveBeenCalled();
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
    expect(result.viewports.every(viewport => viewport.evidence?.candidate.sha256.match(/^[a-f0-9]{64}$/))).toBe(true);
    expect(result.viewports.every(viewport => viewport.evidence?.candidate.byteLength === 5)).toBe(true);
  });

  it('surfaces natural screenshot dimension mismatches', async () => {
    launch.mockResolvedValue(fakeBrowser({ candidateHeight: 1300 }));
    const result = await validateInBrowser(browserCandidate(), {
      browser: {} as Fetcher,
      evidencePrefix: 'model-pages/nissan-au-ariya/publication/revisions/21/evidence',
      writeEvidence: async () => {},
    });

    expect(result.warnings.filter(item => item.code === 'screenshot-dimension-mismatch')).toHaveLength(3);
  });

  it('returns no evidence keys when persistence fails', async () => {
    launch.mockResolvedValue(fakeBrowser());
    const result = await validateInBrowser(browserCandidate(), {
      browser: {} as Fetcher,
      evidencePrefix: 'model-pages/nissan-au-ariya/publication/revisions/21/evidence',
      writeEvidence: async () => { throw new Error('R2 unavailable'); },
    });

    expect(result.blocking.map(item => item.code)).toEqual(['browser-validation-failed']);
    expect(result.viewports.every(viewport => !viewport.screenshotKey && !viewport.diffScreenshotKey && !viewport.evidence)).toBe(true);
  });

  it('blocks overflow, failed media, non-finite height, failed interaction, and high mismatch', async () => {
    launch.mockResolvedValue(fakeBrowser({
      mismatch: 0.3501,
      overflow: 24,
      bodyHeight: Number.POSITIVE_INFINITY,
      brokenMedia: true,
      interactionFailure: 'tabs',
      networkSettleFailure: true,
    }));

    const result = await validateInBrowser(browserCandidate(), {
      browser: {} as Fetcher,
      evidencePrefix: 'model-pages/nissan-au-ariya/publication/revisions/21/evidence',
      writeEvidence: async () => {},
    });

    expect(result.blocking.map(item => item.code)).toEqual(expect.arrayContaining([
      'visual-mismatch',
      'horizontal-overflow',
      'media-request-failed',
      'invalid-body-height',
      'interaction-failed',
      'resource-readiness-failed',
    ]));
  });

  it('returns deterministic blocking viewport evidence when the browser binding is unavailable', async () => {
    const first = await validateInBrowser(browserCandidate(), {});
    const second = await validateInBrowser(browserCandidate(), {});

    expect(first).toEqual(second);
    expect(first.blocking.map(item => item.code)).toEqual(['browser-unavailable']);
    expect(first.viewports.map(item => item.name)).toEqual(['desktop', 'tablet', 'mobile']);
    expect(first.viewports.every(item => !item.screenshotKey && !item.diffScreenshotKey && !item.evidence)).toBe(true);
  });
});
