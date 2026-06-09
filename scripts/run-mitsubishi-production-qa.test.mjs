import { describe, expect, it } from 'vitest';

import {
  buildQaArgs,
  parseCliArgs,
  runMitsubishiProductionQa,
  selectedTargetsForSlug,
} from './run-mitsubishi-production-qa.mjs';

const targets = [
  { oemId: 'mitsubishi-au', modelSlug: 'asx', name: 'ASX' },
  { oemId: 'mitsubishi-au', modelSlug: 'outlander', name: 'Outlander' },
];

describe('parseCliArgs', () => {
  it('parses slug, base URL, json and continue flags', () => {
    const options = parseCliArgs([
      '--slug=outlander',
      '--base-url=https://example.com/pages/',
      '--json',
      '--continue-on-error',
    ]);

    expect(options).toMatchObject({
      slug: 'outlander',
      baseUrl: 'https://example.com/pages',
      json: true,
      continueOnError: true,
    });
  });

  it('uses OEM_AGENT_PAGES_BASE_URL when provided', () => {
    const options = parseCliArgs([], {
      OEM_AGENT_PAGES_BASE_URL: 'https://worker.example/api/pages/',
    });

    expect(options.baseUrl).toBe('https://worker.example/api/pages');
  });
});

describe('selectedTargetsForSlug', () => {
  it('selects all targets when no slug is provided', () => {
    expect(selectedTargetsForSlug(undefined, targets)).toEqual(targets);
  });

  it('selects one target by model slug', () => {
    expect(selectedTargetsForSlug('outlander', targets)).toEqual([targets[1]]);
  });
});

describe('buildQaArgs', () => {
  it('builds the single-page QA command arguments', () => {
    expect(buildQaArgs(targets[1], {
      baseUrl: 'https://example.com/pages',
      json: true,
    })).toEqual([
      'scripts/qa-production-oem-page.mjs',
      'mitsubishi-au-outlander',
      '--base-url',
      'https://example.com/pages',
      '--json',
    ]);
  });
});

describe('runMitsubishiProductionQa', () => {
  it('runs QA for all selected targets', () => {
    const calls = [];
    const status = runMitsubishiProductionQa({}, {
      targets,
      nodePath: 'node',
      log: () => {},
      spawnSync(command, args) {
        calls.push({ command, args });
        return { status: 0 };
      },
    });

    expect(status).toBe(0);
    expect(calls.map(call => call.args[1])).toEqual(['mitsubishi-au-asx', 'mitsubishi-au-outlander']);
  });

  it('returns failing status immediately unless continueOnError is enabled', () => {
    const calls = [];
    const status = runMitsubishiProductionQa({}, {
      targets,
      nodePath: 'node',
      log: () => {},
      spawnSync(command, args) {
        calls.push(args[1]);
        return { status: 1 };
      },
    });

    expect(status).toBe(1);
    expect(calls).toEqual(['mitsubishi-au-asx']);
  });

  it('continues on errors when requested and reports aggregate failure', () => {
    const calls = [];
    const errors = [];
    const status = runMitsubishiProductionQa({ continueOnError: true }, {
      targets,
      nodePath: 'node',
      log: () => {},
      error(message) {
        errors.push(message);
      },
      spawnSync(command, args) {
        calls.push(args[1]);
        return { status: args[1].endsWith('asx') ? 1 : 0 };
      },
    });

    expect(status).toBe(1);
    expect(calls).toEqual(['mitsubishi-au-asx', 'mitsubishi-au-outlander']);
    expect(errors.join('\n')).toContain('mitsubishi-au-asx');
  });
});
