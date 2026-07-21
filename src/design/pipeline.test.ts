import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getCloneDecision, getStructuringFailure } from './pipeline';

describe('getCloneDecision', () => {
  it('refreshes an existing clone when the requested source URL changed', () => {
    const decision = getCloneDecision(
      { source_url: 'https://www.ford.com.au/showroom/suvs/everest/' },
      'https://www.ford.com.au/showroom/cars/mustang/',
    );

    expect(decision.shouldClone).toBe(true);
    expect(decision.reason).toBe('source URL changed');
  });

  it('refreshes an existing clone when forced even if the source URL is unchanged', () => {
    const decision = getCloneDecision(
      { source_url: 'https://www.volkswagen.com.au/en/models/amarok.html' },
      'https://www.volkswagen.com.au/en/models/amarok.html',
      { force: true },
    );

    expect(decision.shouldClone).toBe(true);
    expect(decision.reason).toBe('clone refresh requested');
  });

  it('reuses an existing clone when the source URL only differs by a trailing slash', () => {
    const decision = getCloneDecision(
      { source_url: 'https://www.ford.com.au/showroom/cars/mustang/' },
      'https://www.ford.com.au/showroom/cars/mustang',
    );

    expect(decision.shouldClone).toBe(false);
    expect(decision.reason).toBe('clone already exists in R2');
  });
});

describe('getStructuringFailure', () => {
  it('fails closed when structuring was rejected before publication', () => {
    expect(getStructuringFailure({
      success: false,
      sections_extracted: 7,
      error: 'Page publication rejected: missing color-picker section',
    })).toBe('Page publication rejected: missing color-picker section');
  });

  it('rejects an empty successful response and accepts extracted sections', () => {
    expect(getStructuringFailure({ success: true, sections_extracted: 0 })).toBe(
      'Page structuring returned no publishable sections',
    );
    expect(getStructuringFailure({ success: true, sections_extracted: 7 })).toBeNull();
  });
});

describe('AdaptivePipeline CLONE step capture diagnostics wiring', () => {
  it('records capture diagnostics after captureModelPage and before the success/failure branch', () => {
    const source = readFileSync(new URL('./pipeline.ts', import.meta.url), 'utf8');
    const captureCall = source.indexOf('const cloneResult = await this.capturer.captureModelPage(oemId, modelSlug, sourceUrl, modelName);');
    const recordCall = source.indexOf('recordCaptureDiagnostics(', captureCall);
    const failureCheck = source.indexOf('if (!cloneResult.success)', captureCall);

    expect(captureCall).toBeGreaterThan(-1);
    expect(recordCall).toBeGreaterThan(captureCall);
    expect(failureCheck).toBeGreaterThan(recordCall);
  });

  it('imports buildDiagnosticsRecord and recordCaptureDiagnostics from capture-diagnostics', () => {
    const source = readFileSync(new URL('./pipeline.ts', import.meta.url), 'utf8');

    expect(source).toContain("from './capture-diagnostics'");
    expect(source).toMatch(/buildDiagnosticsRecord/);
    expect(source).toMatch(/recordCaptureDiagnostics/);
  });

  it('wraps diagnostics recording so a diagnostics failure never fails the pipeline', () => {
    const source = readFileSync(new URL('./pipeline.ts', import.meta.url), 'utf8');
    const captureCall = source.indexOf('const cloneResult = await this.capturer.captureModelPage(oemId, modelSlug, sourceUrl, modelName);');
    const tryBlock = source.indexOf('try {', captureCall);
    const recordCall = source.indexOf('recordCaptureDiagnostics(', captureCall);
    const catchBlock = source.indexOf('} catch', recordCall);
    const warnCall = source.indexOf("console.warn('[Pipeline] Failed to record capture diagnostics'", catchBlock);

    expect(tryBlock).toBeGreaterThan(captureCall);
    expect(tryBlock).toBeLessThan(recordCall);
    expect(catchBlock).toBeGreaterThan(recordCall);
    expect(warnCall).toBeGreaterThan(catchBlock);
  });
});
