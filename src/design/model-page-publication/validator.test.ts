import { beforeEach, describe, expect, it, vi } from 'vitest';

import { productionBodyDocument, type ComposedPublicationCandidate } from './composer';
import { validatePublicationCandidate } from './validator';

const { validateInBrowser } = vi.hoisted(() => ({ validateInBrowser: vi.fn() }));

vi.mock('./browser-validator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./browser-validator')>();
  return { ...actual, validateInBrowser };
});

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function candidateWith(fragment: string, overrides: Partial<ComposedPublicationCandidate> = {}): Promise<ComposedPublicationCandidate> {
  const body = await productionBodyDocument(
    {},
    `<main data-oem-publication-body="true"><div data-oem-region-id="features" data-oem-published-renderer="tailwind" data-oem-interaction-kind="none">${fragment}</div></main>`,
    { oemId: 'nissan-au', modelSlug: 'ariya' },
    { candidate: true },
  );
  const hash = await sha256(body);
  return {
    body,
    referenceBody: body,
    regions: [{ regionId: 'features', order: 0, renderer: 'tailwind', interactionKind: 'none', html: fragment }],
    warnings: [],
    bytes: new TextEncoder().encode(body).byteLength,
    sha256: hash,
    etag: `"sha256-${hash}"`,
    ...overrides,
  };
}

async function rehash(candidate: ComposedPublicationCandidate): Promise<void> {
  candidate.bytes = new TextEncoder().encode(candidate.body).byteLength;
  candidate.sha256 = await sha256(candidate.body);
  candidate.etag = `"sha256-${candidate.sha256}"`;
}

beforeEach(() => {
  validateInBrowser.mockReset();
  validateInBrowser.mockResolvedValue({ viewports: [], blocking: [], warnings: [] });
});

describe('validatePublicationCandidate static gates', () => {
  it.each([
    '<script src="https://evil.test/x.js"></script>',
    '<img onerror="steal()">',
    '<iframe src="https://evil.test"></iframe>',
  ])('blocks forbidden markup %s', async (forbidden) => {
    const report = await validatePublicationCandidate(await candidateWith(forbidden), { browser: {} as Fetcher });

    expect(report.publishable).toBe(false);
    expect(report.blocking.some(item => item.code === 'unsafe-markup')).toBe(true);
  });

  it('blocks unsafe URL protocols and body style blocks without publication scope', async () => {
    const candidate = await candidateWith('<a href="javascript:steal()">bad</a><style>.global{display:none}</style>');
    const report = await validatePublicationCandidate(candidate, { browser: {} as Fetcher });

    expect(report.blocking.map(item => item.code)).toEqual(expect.arrayContaining([
      'unsafe-protocol',
      'unscoped-style',
    ]));
  });

  it('accepts scoped styles with the exact composer-owned script set', async () => {
    const candidate = await candidateWith('<style>[data-oem-publication-body="true"] .feature{color:red}</style>');
    const report = await validatePublicationCandidate(candidate, { browser: {} as Fetcher });

    expect(report.blocking.filter(item => ['unsafe-markup', 'unscoped-style'].includes(item.code))).toEqual([]);
  });

  it('rejects forged trusted markers and a mismatched CSP before browser validation', async () => {
    const forged = await candidateWith('<script data-oem-alpine-runtime="true">steal()</script>');
    const badCsp = await candidateWith('safe');
    badCsp.body = badCsp.body.replace("'sha256-", "'sha256-X");
    await rehash(badCsp);

    const forgedReport = await validatePublicationCandidate(forged, { browser: {} as Fetcher });
    const cspReport = await validatePublicationCandidate(badCsp, { browser: {} as Fetcher });

    expect(forgedReport.blocking.some(item => item.code === 'unsafe-script')).toBe(true);
    expect(cspReport.blocking.some(item => item.code === 'unsafe-script')).toBe(true);
    expect(validateInBrowser).not.toHaveBeenCalled();
  });

  it.each([
    ["connect-src 'none'", 'connect-src https:'],
    ["style-src 'unsafe-inline'", "style-src 'unsafe-inline' https:"],
    ['img-src https: data:', 'img-src https: data: blob:'],
  ])('rejects a broadened full CSP directive %s before browser validation', async (owned, broadened) => {
    const candidate = await candidateWith('safe');
    candidate.body = candidate.body.replace(owned, broadened);
    await rehash(candidate);

    const report = await validatePublicationCandidate(candidate, { browser: {} as Fetcher });

    expect(report.blocking.some(item => item.code === 'unsafe-csp')).toBe(true);
    expect(validateInBrowser).not.toHaveBeenCalled();
  });

  it.each([
    'java&#x09;script:steal()',
    'java&#x0a;script:steal()',
    'java&#x0d;script:steal()',
  ])('blocks entity-decoded ASCII-control protocol variant %s', async href => {
    const report = await validatePublicationCandidate(await candidateWith(`<a href="${href}">bad</a>`), { browser: {} as Fetcher });
    expect(report.blocking.some(item => item.code === 'unsafe-protocol')).toBe(true);
  });

  it('accepts scoped rules inside media queries while rejecting an unscoped nested rule', async () => {
    const scoped = await candidateWith('<style>@media (max-width:600px){[data-oem-publication-body="true"] .feature{display:none}}</style>');
    const unscoped = await candidateWith('<style>@media (max-width:600px){.feature{display:none}}</style>');

    const scopedReport = await validatePublicationCandidate(scoped, { browser: {} as Fetcher });
    const unscopedReport = await validatePublicationCandidate(unscoped, { browser: {} as Fetcher });

    expect(scopedReport.blocking.some(item => item.code === 'unscoped-style')).toBe(false);
    expect(unscopedReport.blocking.some(item => item.code === 'unscoped-style')).toBe(true);
  });

  it.each(['hero', 'variants', 'inventory'])('blocks the platform-owned %s region', async (platformRegion) => {
    const candidate = await candidateWith('safe');
    candidate.regions[0].regionId = platformRegion;
    candidate.body = candidate.body.replaceAll('features', platformRegion);
    candidate.bytes = new TextEncoder().encode(candidate.body).byteLength;
    candidate.sha256 = await sha256(candidate.body);
    candidate.etag = `"sha256-${candidate.sha256}"`;

    const report = await validatePublicationCandidate(candidate, { browser: {} as Fetcher });

    expect(report.blocking.some(item => item.code === 'platform-owned-region')).toBe(true);
  });

  it('blocks missing region IDs and duplicate declared IDs', async () => {
    const candidate = await candidateWith('safe');
    candidate.regions.push({ ...candidate.regions[0], order: 1 });
    const report = await validatePublicationCandidate(candidate, { browser: {} as Fetcher });

    expect(report.blocking.some(item => item.code === 'invalid-region-id')).toBe(true);
  });

  it('blocks an actual encoded body above 5_242_880 bytes even when candidate metadata understates it', async () => {
    const candidate = await candidateWith('x'.repeat(5_242_881));
    candidate.bytes = 1;
    const report = await validatePublicationCandidate(candidate, { browser: {} as Fetcher });

    expect(report.blocking.some(item => item.code === 'body-too-large')).toBe(true);
  });

  it('applies the 5_242_880-byte limit independently to the reference body', async () => {
    const candidate = await candidateWith('safe');
    candidate.referenceBody = 'x'.repeat(5_242_881);
    const report = await validatePublicationCandidate(candidate, { browser: {} as Fetcher });

    expect(report.blocking.some(item => item.code === 'reference-body-too-large')).toBe(true);
  });

  it.each(['font-face', 'property', 'counter-style', 'page'])('blocks global @%s CSS at-rules', async atRule => {
    const css = atRule === 'font-face' ? '@font-face{font-family:x;src:url(https://cdn.test/x.woff2)}'
      : atRule === 'property' ? '@property --x{syntax:"<color>";inherits:false;initial-value:red}'
        : atRule === 'counter-style' ? '@counter-style x{system:numeric;symbols:"0"}'
          : '@page{margin:0}';
    const report = await validatePublicationCandidate(await candidateWith(`<style>${css}</style>`), { browser: {} as Fetcher });
    expect(report.blocking.some(item => item.code === 'unscoped-style')).toBe(true);
  });

  it.each([
    '@font-feature-values Font{ @styleset{nice:1} }',
    '@font-palette-values --brand{font-family:Font;base-palette:1}',
    '@custom-media --narrow (max-width:600px)',
    '@custom-selector :--heading h1,h2',
  ])('blocks unapproved global CSS at-rule %s', async css => {
    const report = await validatePublicationCandidate(await candidateWith(`<style>${css}</style>`), { browser: {} as Fetcher });
    expect(report.blocking.some(item => item.code === 'unscoped-style')).toBe(true);
  });

  it('accepts scoped rules nested in approved containers and owned keyframes', async () => {
    const css = [
      '@media (max-width:600px){[data-oem-publication-body="true"] .a{display:none}}',
      '@supports (display:grid){[data-oem-publication-body="true"] .b{display:grid}}',
      '@container card (min-width:300px){[data-oem-publication-body="true"] .c{display:block}}',
      '@layer components{[data-oem-publication-body="true"] .d{color:red}}',
      '@keyframes fade{from{opacity:0}to{opacity:1}}',
    ].join('');
    const report = await validatePublicationCandidate(await candidateWith(`<style>${css}</style>`), { browser: {} as Fetcher });

    expect(report.blocking.some(item => item.code === 'unscoped-style')).toBe(false);
  });

  it('blocks stale size, digest, and ETag integrity metadata', async () => {
    const candidate = await candidateWith('safe', { bytes: 1, sha256: 'stale', etag: 'stale' });
    const report = await validatePublicationCandidate(candidate, { browser: {} as Fetcher });

    expect(report.blocking.some(item => item.code === 'candidate-integrity')).toBe(true);
  });

  it('derives the same SHA-256 validation digest for identical validation evidence', async () => {
    const candidate = await candidateWith('safe');
    const first = await validatePublicationCandidate(candidate, { browser: {} as Fetcher });
    const second = await validatePublicationCandidate(candidate, { browser: {} as Fetcher });

    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(second.digest).toBe(first.digest);
  });
});
