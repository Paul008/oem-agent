#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const targets = JSON.parse(readFileSync(new URL('./mitsubishi-clone-targets.json', import.meta.url), 'utf8'));

export function parseCliArgs(argv, env = process.env) {
  const options = {
    baseUrl: (env.OEM_AGENT_PAGES_BASE_URL || '').replace(/\/$/, ''),
    continueOnError: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.split('=').slice(1).join('=').replace(/\/$/, '');
    } else if (arg === '--base-url') {
      options.baseUrl = String(argv[++index] || '').replace(/\/$/, '');
    } else if (arg.startsWith('--slug=')) {
      options.slug = arg.split('=').slice(1).join('=');
    } else if (arg === '--slug') {
      options.slug = argv[++index];
    } else if (arg === '--continue-on-error') {
      options.continueOnError = true;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export function selectedTargetsForSlug(slug, allTargets = targets) {
  return slug ? allTargets.filter(target => target.modelSlug === slug) : allTargets;
}

export function buildQaArgs(target, options = {}) {
  const pageSlug = `${target.oemId}-${target.modelSlug}`;
  const args = ['scripts/qa-production-oem-page.mjs', pageSlug];

  if (options.baseUrl)
    args.push('--base-url', options.baseUrl);
  if (options.json)
    args.push('--json');

  return args;
}

export function runMitsubishiProductionQa(options, deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  const log = deps.log || console.log;
  const error = deps.error || console.error;
  const nodePath = deps.nodePath || process.execPath;
  const selectedTargets = selectedTargetsForSlug(options.slug, deps.targets || targets);

  if (!selectedTargets.length) {
    error(`No Mitsubishi production QA target found for slug: ${options.slug}`);
    return 1;
  }

  const failures = [];

  for (const target of selectedTargets) {
    const pageSlug = `${target.oemId}-${target.modelSlug}`;
    const args = buildQaArgs(target, options);

    if (!options.json)
      log(`\n=== ${target.name} (${pageSlug}) ===`);

    const result = spawn(nodePath, args, { stdio: 'inherit' });

    if (result.status !== 0) {
      failures.push(pageSlug);
      if (!options.continueOnError)
        return result.status || 1;
    }
  }

  if (failures.length > 0) {
    error(`\nProduction clone QA failed for: ${failures.join(', ')}`);
    return 1;
  }

  if (!options.json)
    log(`\nProduction clone QA passed for ${selectedTargets.length} Mitsubishi page(s).`);

  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runMitsubishiProductionQa(parseCliArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
