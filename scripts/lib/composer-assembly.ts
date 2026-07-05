import type { CatalogPreset } from './catalog';
import type { Extraction } from './prop-extractor';
import type { SectionMatch } from './preset-matcher';
import type { CapturedSection } from './section-capture';

export type SectionPlan = {
  section: CapturedSection;
  match: SectionMatch;
  preset: CatalogPreset | null;
  extraction: Extraction | null;
};

export function assembleDocument(plans: SectionPlan[]): Record<string, unknown> {
  const sections = plans.map((plan) => {
    if (plan.preset && plan.extraction) {
      return {
        id: `${plan.preset.type}-s${plan.section.index}`,
        type: plan.preset.type,
        label: plan.preset.name,
        props: plan.extraction.props,
        settings: {},
      };
    }
    return {
      id: `legacy-s${plan.section.index}`,
      type: 'legacy_html',
      label: `Unmatched section ${plan.section.index}`,
      props: { html: plan.section.html },
      settings: {},
    };
  });

  return {
    version: 1,
    templateKey: null,
    layout: { width: 'contained', spacing: 'standard', backgroundColor: '#ffffff', textColor: '#111111' },
    sections,
  };
}

export function buildReport(input: {
  url: string;
  capturedAt: string;
  minConfidence: number;
  plans: SectionPlan[];
}): { json: Record<string, unknown>; markdown: string } {
  const rows = input.plans.map((plan) => ({
    index: plan.section.index,
    presetId: plan.match.presetId,
    presetName: plan.preset?.name ?? null,
    confidence: plan.match.confidence,
    filledRatio: plan.extraction?.filledRatio ?? null,
    missingProps: plan.extraction?.missing ?? [],
    matchReason: plan.match.reason,
    ...(plan.match.error ? { matchError: plan.match.error } : {}),
  }));

  const matched = rows.filter((row) => row.presetId !== null).length;
  const total = rows.length;
  const matchRate = total === 0 ? 0 : matched / total;

  const json = {
    url: input.url,
    capturedAt: input.capturedAt,
    minConfidence: input.minConfidence,
    totalSections: total,
    matchedSections: matched,
    matchRate,
    sections: rows,
  };

  const tableRows = rows.map((row) => {
    const preset = row.presetId ? `${row.presetId}` : '**legacy_html** (no match)';
    const fill = row.filledRatio === null ? '—' : `${Math.round(row.filledRatio * 100)}%`;
    const missing = row.missingProps.length ? row.missingProps.join(', ') : '—';
    return `| ${row.index} | ${preset} | ${row.confidence.toFixed(2)} | ${fill} | ${missing} |`;
  });

  const markdown = [
    `# Composer report — ${input.url}`,
    '',
    `Captured: ${input.capturedAt} · Min confidence: ${input.minConfidence}`,
    '',
    `Matched: ${matched}/${total} (${Math.round(matchRate * 100)}%)`,
    '',
    '| # | Preset | Confidence | Props filled | Missing |',
    '| --- | --- | --- | --- | --- |',
    ...tableRows,
    '',
  ].join('\n');

  return { json, markdown };
}
