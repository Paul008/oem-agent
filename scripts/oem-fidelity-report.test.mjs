import { describe, expect, it } from 'vitest';

import {
  buildResponsiveImageFindings,
  imageIdentityKey,
  parseCliArgs,
  renderMarkdownReport,
  scoreCapturePair,
} from './oem-fidelity-report.mjs';

function capture(target, viewport, largestUrl) {
  return {
    target,
    viewport,
    network: { failedCount: 0, badResponseCount: 0, failed: [], badResponses: [] },
    screenshotPath: `/tmp/${target}-${viewport}.png`,
    audit: {
      viewport: { horizontalOverflow: 0 },
      images: {
        broken: [],
        largest: largestUrl
          ? [{ currentSrc: largestUrl, src: largestUrl, rect: { area: 100000 } }]
          : [],
      },
      clippedText: [],
      lowContrastText: [],
      overflowOffenders: [],
    },
  };
}

describe('parseCliArgs', () => {
  it('builds the production preview URL from a slug', () => {
    const options = parseCliArgs([
      '--source-url',
      'https://www.ford.com.au/showroom/cars/mustang/',
      '--slug',
      'ford-au-mustang',
    ]);

    expect(options.previewUrl).toBe('https://oem-dashboard.pages.dev/preview/ford-au-mustang?view=production');
    expect(options.viewports).toEqual(['desktop', 'tablet', 'mobile']);
    expect(options.loadLazyMedia).toBe(true);
  });

  it('accepts repeated source hide selectors', () => {
    const options = parseCliArgs([
      '--source-url',
      'https://example.com/source',
      '--preview-url',
      'https://example.com/preview',
      '--source-hide',
      'header',
      '--source-hide',
      '.cookie',
    ]);

    expect(options.sourceHideSelectors).toEqual(['header', '.cookie']);
  });

  it('can disable lazy media warming', () => {
    const options = parseCliArgs([
      '--source-url',
      'https://example.com/source',
      '--preview-url',
      'https://example.com/preview',
      '--no-load-lazy-media',
    ]);

    expect(options.loadLazyMedia).toBe(false);
  });
});

describe('imageIdentityKey', () => {
  it('unwraps proxied media URLs and normalizes viewport suffixes', () => {
    expect(imageIdentityKey('https://oem-dashboard.pages.dev/media?url=https%3A%2F%2Fcdn.example.com%2Fhero-mobile.jpg')).toBe('hero-mobile.jpg');
  });
});

describe('buildResponsiveImageFindings', () => {
  it('flags preview mobile art direction when source swaps image and preview does not', () => {
    const pairs = [
      {
        viewport: 'desktop',
        source: capture('source', 'desktop', 'https://cdn.example.com/hero-desktop.jpg'),
        preview: capture('preview', 'desktop', 'https://cdn.example.com/hero-desktop.jpg'),
      },
      {
        viewport: 'mobile',
        source: capture('source', 'mobile', 'https://cdn.example.com/hero-mobile.jpg'),
        preview: capture('preview', 'mobile', 'https://cdn.example.com/hero-desktop.jpg'),
      },
    ];

    const findings = buildResponsiveImageFindings(pairs);

    expect(findings.some(finding => finding.type === 'missing-mobile-art-direction')).toBe(true);
  });
});

describe('scoreCapturePair', () => {
  it('penalizes mismatch and preview issues', () => {
    const pair = {
      preview: capture('preview', 'mobile', 'https://cdn.example.com/hero.jpg'),
      diff: { mismatchPercent: 0.2 },
    };
    pair.preview.audit.clippedText = [{ text: 'clipped' }];

    expect(scoreCapturePair(pair)).toBeLessThan(100);
  });
});

describe('renderMarkdownReport', () => {
  it('includes the overall score and artifacts', () => {
    const report = {
      sourceUrl: 'https://source.example',
      previewUrl: 'https://preview.example',
      createdAt: '2026-06-05T00:00:00.000Z',
      outputDir: '/tmp/report',
      overallScore: 88,
      failed: false,
      findings: [],
      pairs: [
        {
          viewport: 'desktop',
          score: 88,
          diff: {
            mismatchPercent: 0.1,
            sourceSize: { width: 10, height: 10 },
            previewSize: { width: 10, height: 10 },
            segments: [
              { yStart: 0, yEnd: 1000, mismatchPercent: 0.1 },
              { yStart: 1000, yEnd: 2000, mismatchPercent: 0.25 },
            ],
            diffPath: '/tmp/report/diff-desktop.png',
          },
          source: { screenshotPath: '/tmp/report/source-desktop.png' },
          preview: { screenshotPath: '/tmp/report/preview-desktop.png' },
        },
      ],
    };

    expect(renderMarkdownReport(report)).toContain('Overall score: 88/100');
    expect(renderMarkdownReport(report)).toContain('1000-2000px 25.0%');
    expect(renderMarkdownReport(report)).toContain('diff-desktop.png');
  });
});
