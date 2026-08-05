#!/usr/bin/env node

import { rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { experimental_readRawConfig } from 'wrangler';

const REQUIRED_R2_BINDINGS = new Set(['MOLTBOT_BUCKET', 'OEM_PAGE_BUCKET']);
const SAFE_TOP_LEVEL_KEYS = [
  'main',
  'compatibility_date',
  'compatibility_flags',
  'browser',
  'ai',
  'containers',
  'durable_objects',
  'migrations',
];

function assertSafeTarget(value, prefix, label) {
  const pattern = new RegExp(`^${prefix}[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`);
  if (typeof value !== 'string' || value.length > 63 || !pattern.test(value)) {
    throw new Error(`${label} must start with ${prefix} and contain only lowercase letters, numbers, and hyphens`);
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function isolateR2Bindings(rawBindings, bucketName) {
  if (!Array.isArray(rawBindings)) {
    throw new Error('r2_buckets must contain the E2E R2 bindings');
  }

  const bindings = rawBindings.map((entry) => assertObject(entry, 'each R2 binding'));
  const names = bindings.map((entry) => entry.binding);
  const uniqueNames = new Set(names);

  for (const required of REQUIRED_R2_BINDINGS) {
    if (!uniqueNames.has(required)) {
      throw new Error(`required R2 binding ${required} is missing`);
    }
  }

  if (bindings.length !== REQUIRED_R2_BINDINGS.size || uniqueNames.size !== REQUIRED_R2_BINDINGS.size) {
    throw new Error('r2_buckets must contain exactly MOLTBOT_BUCKET and OEM_PAGE_BUCKET once each');
  }

  return bindings.map(({ binding }) => ({ binding, bucket_name: bucketName }));
}

function buildIsolatedConfig(rawConfig, workerName, bucketName) {
  const source = assertObject(rawConfig, 'Wrangler config');
  if (typeof source.name !== 'string' || !source.name) {
    throw new Error('source Wrangler config must have a name');
  }
  if (source.name === workerName) {
    throw new Error('E2E worker name must be unique from the source Worker');
  }

  const isolated = {};
  for (const key of SAFE_TOP_LEVEL_KEYS) {
    if (source[key] !== undefined) isolated[key] = source[key];
  }

  isolated.name = workerName;
  isolated.workers_dev = true;
  isolated.r2_buckets = isolateR2Bindings(source.r2_buckets, bucketName);
  isolated.vars = {
    ENVIRONMENT: 'e2e',
    SANDBOX_SLEEP_AFTER: 'never',
    DEV_MODE: 'false',
    OPENCLAW_DEV_MODE: 'false',
    R2_BUCKET_NAME: bucketName,
    MEDIA_BASE_URL: '',
  };

  return isolated;
}

async function main() {
  const [sourcePath, outputPath, workerName, bucketName] = process.argv.slice(2);
  if (!sourcePath || !outputPath || !workerName || !bucketName) {
    throw new Error('usage: generate-config.mjs <source> <output> <worker-name> <r2-bucket>');
  }

  assertSafeTarget(workerName, 'moltbot-sandbox-e2e-', 'E2E worker name');
  assertSafeTarget(bucketName, 'moltbot-e2e-', 'E2E R2 bucket');

  const absoluteSource = resolve(sourcePath);
  const absoluteOutput = resolve(outputPath);
  if (absoluteSource === absoluteOutput) {
    throw new Error('source and output config paths must be different');
  }

  await rm(absoluteOutput, { force: true });
  const { rawConfig, configPath } = experimental_readRawConfig({ config: absoluteSource });
  if (!configPath || resolve(configPath) !== absoluteSource) {
    throw new Error('Wrangler did not load the requested source config');
  }
  const isolated = buildIsolatedConfig(rawConfig, workerName, bucketName);
  const temporaryOutput = `${absoluteOutput}.${process.pid}.tmp`;

  try {
    await writeFile(temporaryOutput, `${JSON.stringify(isolated, null, 2)}\n`, { flag: 'wx' });
    await rename(temporaryOutput, absoluteOutput);
  } finally {
    await rm(temporaryOutput, { force: true });
  }
}

main().catch(async (error) => {
  const outputPath = process.argv[3];
  if (outputPath) await rm(resolve(outputPath), { force: true });
  console.error(`E2E config generation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
