import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./page-generator.ts', import.meta.url)),
  'utf8',
);

describe('page generator routed-model reporting', () => {
  it('calculates costs and parse errors from the model selected by the router', () => {
    expect(source).toMatch(
      /calculateInferenceCost\(\s*kimiResponse\.provider,\s*kimiResponse\.model,\s*kimiResponse\.usage,?\s*\)/,
    );
    expect(source).toMatch(
      /calculateInferenceCost\(\s*claudeResponse\.provider,\s*claudeResponse\.model,\s*claudeResponse\.usage,?\s*\)/,
    );
    expect(source).toContain('Failed to parse ${kimiResponse.model} response as JSON');
    expect(source).toContain('Failed to parse ${claudeResponse.model} response as JSON');
    expect(source).not.toContain('Using Kimi K2.5 screenshot-to-code');
    expect(source).not.toContain('* 0.60');
  });
});
