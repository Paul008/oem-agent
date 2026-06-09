import { describe, expect, it } from 'vitest';

import {
  analyzeProductionClone,
  parseCliArgs,
  renderTextReport,
} from './qa-production-oem-page.mjs';

const selector = '.oem-production-scope[data-oem-id="mitsubishi-au"][data-model-slug="outlander"]';

function manifest(overrides = {}) {
  return {
    slug: 'mitsubishi-au-outlander',
    mode: 'clone',
    html_bytes: 100,
    scope: {
      selector,
      style_tags_scoped: 2,
      external_stylesheets_scoped: 15,
      external_stylesheets_blocked: 0,
      rules_scoped: 6938,
      rules_skipped: 0,
    },
    ...overrides,
  };
}

describe('parseCliArgs', () => {
  it('accepts slug as the first positional argument', () => {
    const options = parseCliArgs(['mitsubishi-au-outlander']);

    expect(options.htmlUrl).toBe('https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/mitsubishi-au-outlander/production-html');
    expect(options.manifestUrl).toBe('https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/mitsubishi-au-outlander/production-manifest');
  });

  it('accepts explicit production artifact URLs', () => {
    const options = parseCliArgs([
      '--html-url',
      'https://example.com/html',
      '--manifest-url',
      'https://example.com/manifest',
      '--json',
    ]);

    expect(options.htmlUrl).toBe('https://example.com/html');
    expect(options.manifestUrl).toBe('https://example.com/manifest');
    expect(options.json).toBe(true);
  });
});

describe('analyzeProductionClone', () => {
  it('passes a scoped clone artifact', () => {
    const result = analyzeProductionClone({
      manifest: manifest(),
      html: `<div class="oem-production-scope" data-oem-id="mitsubishi-au" data-model-slug="outlander"><style>${selector} .hero{color:red}</style></div>`,
      headers: { 'x-oem-css-scope': selector },
    });

    expect(result.passed).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('fails when live stylesheet links remain', () => {
    const result = analyzeProductionClone({
      manifest: manifest(),
      html: '<div class="oem-production-scope"><link rel="stylesheet" href="/leak.css"></div>',
    });

    expect(result.passed).toBe(false);
    expect(result.findings.some(item => item.code === 'live-stylesheet-links')).toBe(true);
  });

  it('fails when a stylesheet was blocked instead of scoped', () => {
    const result = analyzeProductionClone({
      manifest: manifest({
        scope: {
          ...manifest().scope,
          external_stylesheets_blocked: 1,
        },
      }),
      html: '<div class="oem-production-scope"><link data-oem-blocked-stylesheet-href="/missing.css"></div>',
    });

    expect(result.passed).toBe(false);
    expect(result.findings.some(item => item.code === 'blocked-stylesheets')).toBe(true);
  });

  it('fails when keyframe percentages were scoped as selectors', () => {
    const result = analyzeProductionClone({
      manifest: manifest(),
      html: `<div class="oem-production-scope"><style>@keyframes x { ${selector} 0% { opacity: 0; } }</style></div>`,
    });

    expect(result.passed).toBe(false);
    expect(result.findings.some(item => item.code === 'keyframe-corruption')).toBe(true);
  });

  it('warns when the scope header differs from the manifest selector', () => {
    const result = analyzeProductionClone({
      manifest: manifest(),
      html: '<div class="oem-production-scope"></div>',
      headers: { 'x-oem-css-scope': '.other' },
    });

    expect(result.passed).toBe(true);
    expect(result.findings.some(item => item.code === 'scope-header-mismatch')).toBe(true);
  });
});

describe('renderTextReport', () => {
  it('summarizes the QA result', () => {
    const result = analyzeProductionClone({
      manifest: manifest(),
      html: '<div class="oem-production-scope"></div>',
    });

    expect(renderTextReport(result)).toContain('production clone QA: pass');
    expect(renderTextReport(result)).toContain('stylesheets scoped: 15');
  });
});
