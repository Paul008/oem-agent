import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const generator = new URL('./generate-config.mjs', import.meta.url);
const deploy = fileURLToPath(new URL('./deploy', import.meta.url));
const deleteWorker = fileURLToPath(new URL('./delete-worker', import.meta.url));
const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const aiProviderCheck = join(projectRoot, 'test/e2e/fixture/has-ai-provider');

function sourceConfig(overrides = {}) {
  return `{
    // JSONC is intentional: the production Wrangler config contains comments.
    "name": "${overrides.name ?? 'oem-agent'}",
    "main": "src/index.ts",
    "workers_dev": true,
    "r2_buckets": ${JSON.stringify(overrides.r2_buckets ?? [
      { binding: 'MOLTBOT_BUCKET', bucket_name: 'oem-agent-assets' },
      { binding: 'OEM_PAGE_BUCKET', bucket_name: 'oem-agent-assets' },
    ])},
    "browser": { "binding": "BROWSER" },
    "ai": { "binding": "AI" },
    "vectorize": [{ "binding": "UX_KNOWLEDGE", "index_name": "ux-knowledge-base" }],
    "workflows": [{ "binding": "BROCHURE_MIRROR", "name": "brochure-mirror", "class_name": "BrochureMirrorWorkflow" }],
    "containers": [{ "class_name": "Sandbox", "image": "./Dockerfile" }],
    "durable_objects": { "bindings": [{ "name": "Sandbox", "class_name": "Sandbox" }] },
    "migrations": [{ "tag": "v1", "new_sqlite_classes": ["Sandbox"] }],
    "vars": {
      "ENVIRONMENT": "production",
      "R2_BUCKET_NAME": "oem-agent-assets",
      "CF_ACCOUNT_ID": "production-account-id",
      "MEDIA_BASE_URL": "https://media.example.test",
      "APIFY_PDF_FETCH_ACTOR_ID": "production-actor-id",
      "SAFE_FLAG": "preserved"
    },
    "routes": [{ "pattern": "media.example.test", "custom_domain": true }],
    "triggers": { "crons": ["0 17 * * *"] },
    "env": { "dev": { "name": "oem-agent-dev" } },
    "kv_namespaces": [{ "binding": "PRODUCTION_KV", "id": "production-kv-id" }]
  }`;
}

function runGenerator(config = sourceConfig(), workerName = 'moltbot-sandbox-e2e-123-base', bucket = 'moltbot-e2e-123-base') {
  const directory = mkdtempSync(join(tmpdir(), 'oem-e2e-config-'));
  const source = join(directory, 'wrangler.jsonc');
  const output = join(directory, 'wrangler.e2e.json');
  writeFileSync(source, config);
  const result = spawnSync(process.execPath, [generator.pathname, source, output, workerName, bucket], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  return { ...result, output, exists: () => {
    try { readFileSync(output); return true; } catch { return false; }
  } };
}

test('generates an isolated worker config with both R2 bindings on the ephemeral bucket', () => {
  const result = runGenerator();

  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(readFileSync(result.output, 'utf8'));
  assert.equal(config.name, 'moltbot-sandbox-e2e-123-base');
  assert.deepEqual(config.r2_buckets, [
    { binding: 'MOLTBOT_BUCKET', bucket_name: 'moltbot-e2e-123-base' },
    { binding: 'OEM_PAGE_BUCKET', bucket_name: 'moltbot-e2e-123-base' },
  ]);
  assert.equal(config.workers_dev, true);
  assert.equal(config.routes, undefined);
  assert.equal(config.triggers, undefined);
  assert.equal(config.vectorize, undefined);
  assert.equal(config.workflows, undefined);
  assert.equal(config.env, undefined);
  assert.equal(config.kv_namespaces, undefined);
  assert.deepEqual(config.browser, { binding: 'BROWSER' });
  assert.deepEqual(config.ai, { binding: 'AI' });
  assert.deepEqual(config.containers, [{ class_name: 'Sandbox', image: './Dockerfile' }]);
  assert.deepEqual(config.durable_objects, { bindings: [{ name: 'Sandbox', class_name: 'Sandbox' }] });
  assert.deepEqual(config.migrations, [{ tag: 'v1', new_sqlite_classes: ['Sandbox'] }]);
  assert.deepEqual(config.vars, {
    ENVIRONMENT: 'e2e',
    SANDBOX_SLEEP_AFTER: 'never',
    DEV_MODE: 'false',
    OPENCLAW_DEV_MODE: 'false',
    R2_BUCKET_NAME: 'moltbot-e2e-123-base',
    MEDIA_BASE_URL: '',
  });
  assert.doesNotMatch(JSON.stringify(config), /oem-agent-assets|production-account-id|production-actor-id|media\.example\.test/);
});

test('fails closed without writing a deployable config when a required R2 binding is absent', () => {
  const result = runGenerator(sourceConfig({
    r2_buckets: [{ binding: 'MOLTBOT_BUCKET', bucket_name: 'oem-agent-assets' }],
  }));

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OEM_PAGE_BUCKET/);
  assert.equal(result.exists(), false);
});

test('rejects production-shaped worker and bucket targets', () => {
  const worker = runGenerator(sourceConfig(), 'oem-agent');
  const bucket = runGenerator(sourceConfig(), 'moltbot-sandbox-e2e-123-base', 'oem-agent-assets');

  assert.notEqual(worker.status, 0);
  assert.match(worker.stderr, /E2E worker name/);
  assert.equal(worker.exists(), false);
  assert.notEqual(bucket.status, 0);
  assert.match(bucket.stderr, /E2E R2 bucket/);
  assert.equal(bucket.exists(), false);
});

test('deploy aborts before Wrangler when isolated config generation fails', () => {
  const directory = mkdtempSync(join(tmpdir(), 'oem-e2e-deploy-'));
  const binaryDirectory = join(directory, 'bin');
  const npxLog = join(directory, 'npx.log');
  const fixturePath = join(projectRoot, 'test/e2e');
  mkdirSync(binaryDirectory);

  for (const [name, contents] of Object.entries({
    npm: '#!/bin/sh\nexit 0\n',
    jq: `#!/bin/sh\ncase "$2" in\n  .worker_name.value) echo oem-agent ;;\n  .r2_bucket_name.value) echo moltbot-e2e-static-failure ;;\nesac\n`,
    npx: '#!/bin/sh\nprintf "%s\\n" "$*" >> "$NPX_LOG"\nexit 0\n',
  })) {
    const path = join(binaryDirectory, name);
    writeFileSync(path, contents);
    chmodSync(path, 0o755);
  }

  const result = spawnSync('bash', [deploy, '{}'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binaryDirectory}:${process.env.PATH}`,
      NPX_LOG: npxLog,
      CCTR_TEST_PATH: fixturePath,
      CLOUDFLARE_API_TOKEN: 'e2e-token',
      CF_ACCOUNT_ID: 'e2e-account',
      MOLTBOT_GATEWAY_TOKEN: 'e2e-gateway-token',
      CF_ACCESS_TEAM_DOMAIN: 'e2e-access.example.test',
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /E2E worker name/);
  assert.equal(existsSync(npxLog), false, 'Wrangler must not run after config generation fails');
});

test('cloud-mutating E2E job requires an explicit dispatch and E2E environment', () => {
  const workflow = readFileSync(join(projectRoot, '.github/workflows/test.yml'), 'utf8');
  const e2eJob = workflow.slice(workflow.indexOf('\n  e2e:'));

  assert.match(e2eJob, /if: github\.event_name == 'workflow_dispatch'/);
  assert.match(e2eJob, /environment: e2e/);
  assert.match(e2eJob, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.E2E_CLOUDFLARE_API_TOKEN \|\| secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(e2eJob, /CF_ACCOUNT_ID: \$\{\{ vars\.E2E_CF_ACCOUNT_ID \|\| secrets\.E2E_CF_ACCOUNT_ID \|\| secrets\.CF_ACCOUNT_ID \}\}/);
});

test('credential-less E2E deployment never requires or provisions R2 access keys', () => {
  const workflow = readFileSync(join(projectRoot, '.github/workflows/test.yml'), 'utf8');
  const start = readFileSync(join(projectRoot, 'test/e2e/fixture/server/start'), 'utf8');
  const deployScript = readFileSync(join(projectRoot, 'test/e2e/fixture/server/deploy'), 'utf8');

  for (const contents of [workflow, start, deployScript]) {
    assert.doesNotMatch(contents, /R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY/);
  }

  assert.match(deployScript, /R2_BUCKET/);
  assert.doesNotMatch(deployScript, /secret put R2_BUCKET_NAME/);
});

test('E2E deploy only invokes package scripts that exist', () => {
  const deployScript = readFileSync(join(projectRoot, 'test/e2e/fixture/server/deploy'), 'utf8');
  const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  const invokedScripts = [...deployScript.matchAll(/npm run ([\w:-]+)/g)].map((match) => match[1]);

  assert.deepEqual(invokedScripts, ['typecheck']);
  for (const script of invokedScripts) {
    assert.equal(typeof packageJson.scripts?.[script], 'string');
  }
});

test('Access protection exists for the full lifetime of the E2E Worker', () => {
  const start = readFileSync(join(projectRoot, 'test/e2e/fixture/server/start'), 'utf8');
  const stop = readFileSync(join(projectRoot, 'test/e2e/fixture/server/stop'), 'utf8');

  assert.ok(start.indexOf('create-access-app') < start.indexOf('"$SCRIPT_DIR/deploy"'));
  assert.ok(stop.indexOf('debug/e2e-storage') < stop.indexOf('"$SCRIPT_DIR/delete-worker"'));
  assert.ok(stop.indexOf('"$SCRIPT_DIR/delete-worker"') < stop.indexOf('Deleting Access application'));
  assert.match(stop, /if \[ "\$WORKER_ABSENT" = true \].*ACCESS_APP_ID/);
  assert.match(stop, /Worker identity is missing; retaining Access/);
  assert.match(stop, /if \[ "\$CLEANUP_FAILED" = true \]/);
});

test('Worker deletion must be verified before Access can be removed', () => {
  const directory = mkdtempSync(join(tmpdir(), 'oem-e2e-delete-'));
  const binaryDirectory = join(directory, 'bin');
  mkdirSync(binaryDirectory);
  for (const [name, contents] of Object.entries({
    npx: '#!/bin/sh\nexit 0\n',
    curl: '#!/bin/sh\nprintf "%s" "$CURL_STATUS"\n',
  })) {
    const path = join(binaryDirectory, name);
    writeFileSync(path, contents);
    chmodSync(path, 0o755);
  }

  const run = (status) => spawnSync('bash', [deleteWorker, 'moltbot-sandbox-e2e-123-base'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      PATH: `${binaryDirectory}:${process.env.PATH}`,
      CURL_STATUS: status,
      CLOUDFLARE_API_TOKEN: 'e2e-token',
      CLOUDFLARE_ACCOUNT_ID: 'e2e-account',
    },
  });

  assert.equal(run('404').status, 0);
  const surviving = run('200');
  assert.notEqual(surviving.status, 0);
  assert.match(surviving.stderr, /could not be verified/);
});

test('AI assertion gate matches every complete supported provider configuration', () => {
  const run = (env = {}) => spawnSync(aiProviderCheck, [], { env, encoding: 'utf8' }).status;

  assert.equal(run(), 1);
  assert.equal(run({ CLOUDFLARE_AI_GATEWAY_API_KEY: 'key' }), 1);
  assert.equal(run({
    CLOUDFLARE_AI_GATEWAY_API_KEY: 'key',
    CF_AI_GATEWAY_ACCOUNT_ID: 'account',
    CF_AI_GATEWAY_GATEWAY_ID: 'gateway',
  }), 0);
  assert.equal(run({ AI_GATEWAY_API_KEY: 'key' }), 1);
  assert.equal(run({ AI_GATEWAY_API_KEY: 'key', AI_GATEWAY_BASE_URL: 'https://gateway.test' }), 0);
  assert.equal(run({ ANTHROPIC_API_KEY: 'key' }), 0);
  assert.equal(run({ OPENAI_API_KEY: 'key' }), 0);
});

test('cloud suite destroys a container and verifies an R2 marker survives', () => {
  const scenario = readFileSync(join(projectRoot, 'test/e2e/persistence.txt'), 'utf8');

  assert.match(scenario, /debug\/persistence-probe/);
  assert.match(scenario, /debug\/destroy-container/);
  assert.match(scenario, /persistence marker restored/);
});
