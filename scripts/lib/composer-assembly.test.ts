import { describe, expect, it } from 'vitest';
import type { CatalogPreset } from './catalog';
import { assembleDocument, buildReport, type SectionPlan } from './composer-assembly';

const HERO_PRESET: CatalogPreset = {
  id: 'hero-standard', type: 'hero', categoryId: 'content', categoryLabel: 'Toyota',
  name: 'Toyota Hero', description: '', propSchema: { heading: { type: 'string' } },
  demoProps: {}, screenshotPath: 's/h.png',
};

const capturedSection = (index: number, html: string) => ({
  index, tag: 'section', classes: '', top: index * 500, left: 0, width: 1440, height: 480,
  html, screenshotFile: `sections/0${index}.png`,
});

const matchedPlan: SectionPlan = {
  section: capturedSection(0, '<section><h1>RAV4</h1></section>'),
  match: { presetId: 'hero-standard', confidence: 0.9, runnersUp: [], reason: 'hero' },
  preset: HERO_PRESET,
  extraction: { props: { heading: 'RAV4' }, filledRatio: 1, missing: [] },
};

const unmatchedPlan: SectionPlan = {
  section: capturedSection(1, '<section class="weird">???</section>'),
  match: { presetId: null, confidence: 0.2, runnersUp: [], reason: 'nothing fits' },
  preset: null,
  extraction: null,
};

describe('assembleDocument', () => {
  const doc = assembleDocument([matchedPlan, unmatchedPlan]) as {
    version: number; templateKey: null; layout: Record<string, string>;
    sections: Array<Record<string, unknown>>;
  };

  it('produces the builder document envelope', () => {
    expect(doc.version).toBe(1);
    expect(doc.templateKey).toBeNull();
    expect(doc.layout).toEqual({
      width: 'contained', spacing: 'standard', backgroundColor: '#ffffff', textColor: '#111111',
    });
  });

  it('maps matched sections to typed builder sections in order', () => {
    expect(doc.sections[0]).toMatchObject({
      id: 'hero-s0', type: 'hero', label: 'Toyota Hero', props: { heading: 'RAV4' }, settings: {},
    });
  });

  it('maps unmatched sections to legacy_html carriers with the captured html', () => {
    expect(doc.sections[1]).toMatchObject({
      id: 'legacy-s1', type: 'legacy_html',
      props: { html: '<section class="weird">???</section>' },
    });
  });
});

describe('buildReport', () => {
  const report = buildReport({
    url: 'https://www.toyota.com.au/rav4', capturedAt: '2026-07-05T00:00:00Z',
    minConfidence: 0.5, plans: [matchedPlan, unmatchedPlan],
  });

  it('computes match metrics', () => {
    expect(report.json).toMatchObject({ totalSections: 2, matchedSections: 1, matchRate: 0.5 });
  });

  it('lists per-section rows including the unmatched one', () => {
    const rows = (report.json as { sections: Array<Record<string, unknown>> }).sections;
    expect(rows[0]).toMatchObject({ index: 0, presetId: 'hero-standard', filledRatio: 1 });
    expect(rows[1]).toMatchObject({ index: 1, presetId: null });
  });

  it('renders markdown with the headline metric and one table row per section', () => {
    expect(report.markdown).toContain('Matched: 1/2 (50%)');
    expect(report.markdown).toContain('hero-standard');
    expect(report.markdown).toContain('legacy_html');
  });
});
