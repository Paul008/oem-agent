import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'start-openclaw.sh');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'openclaw-persistence-'));
  const storage = join(root, 'mounted storage');
  const config = join(root, 'openclaw config');
  const workspace = join(root, 'workspace');
  const skills = join(workspace, 'skills');
  for (const path of [storage, config, workspace, skills]) mkdirSync(path, { recursive: true });
  const env = {
    ...process.env,
    MOLTBOT_STORAGE_PATH: storage,
    OPENCLAW_CONFIG_DIR: config,
    OPENCLAW_WORKSPACE_DIR: workspace,
    OPENCLAW_SKILLS_DIR: skills,
  };
  return { storage, config, workspace, skills, env };
}

function write(path: string, content: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

describe('start-openclaw persistence commands', () => {
  it('restores current config, workspace, and skills from the mounted bucket', () => {
    const f = fixture();
    write(join(f.storage, 'openclaw/openclaw.json'), '{"restored":true}');
    write(join(f.storage, 'workspace/MEMORY.md'), 'remember this');
    write(join(f.storage, 'skills/example/SKILL.md'), 'skill content');

    execFileSync('bash', [SCRIPT, 'persistence-restore'], { env: f.env });

    expect(readFileSync(join(f.config, 'openclaw.json'), 'utf8')).toBe('{"restored":true}');
    expect(readFileSync(join(f.workspace, 'MEMORY.md'), 'utf8')).toBe('remember this');
    expect(readFileSync(join(f.skills, 'example/SKILL.md'), 'utf8')).toBe('skill content');
  });

  it('restores and migrates a legacy clawdbot config', () => {
    const f = fixture();
    write(join(f.storage, 'clawdbot/clawdbot.json'), '{"legacy":true}');

    execFileSync('bash', [SCRIPT, 'persistence-restore'], { env: f.env });

    expect(readFileSync(join(f.config, 'openclaw.json'), 'utf8')).toBe('{"legacy":true}');
    expect(existsSync(join(f.config, 'clawdbot.json'))).toBe(false);
  });

  it('performs one mounted-filesystem sync cycle and preserves exclusions', () => {
    const f = fixture();
    write(join(f.config, 'openclaw.json'), '{"live":true}');
    write(join(f.config, 'runtime.log'), 'exclude log');
    write(join(f.workspace, 'MEMORY.md'), 'new memory');
    write(join(f.workspace, 'node_modules/pkg/index.js'), 'exclude dependency');
    write(join(f.workspace, '.git/config'), 'exclude git');
    write(join(f.skills, 'example/SKILL.md'), 'new skill');
    write(join(f.storage, 'workspace/stale.txt'), 'remove stale backup');

    execFileSync('bash', [SCRIPT, 'persistence-sync-once'], { env: f.env });

    expect(readFileSync(join(f.storage, 'openclaw/openclaw.json'), 'utf8')).toBe('{"live":true}');
    expect(readFileSync(join(f.storage, 'workspace/MEMORY.md'), 'utf8')).toBe('new memory');
    expect(readFileSync(join(f.storage, 'skills/example/SKILL.md'), 'utf8')).toBe('new skill');
    expect(existsSync(join(f.storage, 'openclaw/runtime.log'))).toBe(false);
    expect(existsSync(join(f.storage, 'workspace/node_modules/pkg/index.js'))).toBe(false);
    expect(existsSync(join(f.storage, 'workspace/.git/config'))).toBe(false);
    expect(existsSync(join(f.storage, 'workspace/stale.txt'))).toBe(false);
    expect(readFileSync(join(f.storage, '.last-sync'), 'utf8')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
