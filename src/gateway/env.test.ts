import { describe, it, expect } from 'vitest';
import { buildEnvVars } from './env';
import { createMockEnv } from '../test-utils';

describe('buildEnvVars', () => {
  it('returns empty object when no env vars set', () => {
    // Override OEM defaults from createMockEnv to test empty case
    const env = createMockEnv({
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      GROQ_API_KEY: undefined,
      TOGETHER_API_KEY: undefined,
    });
    const result = buildEnvVars(env);
    expect(result).toEqual({});
  });

  it('includes ANTHROPIC_API_KEY when set directly', () => {
    const env = createMockEnv({ ANTHROPIC_API_KEY: 'sk-test-key' });
    const result = buildEnvVars(env);
    expect(result.ANTHROPIC_API_KEY).toBe('sk-test-key');
  });

  it('includes OPENAI_API_KEY when set directly', () => {
    const env = createMockEnv({ OPENAI_API_KEY: 'sk-openai-key' });
    const result = buildEnvVars(env);
    expect(result.OPENAI_API_KEY).toBe('sk-openai-key');
  });

  // Cloudflare AI Gateway (new native provider)
  it('passes Cloudflare AI Gateway env vars', () => {
    const env = createMockEnv({
      CLOUDFLARE_AI_GATEWAY_API_KEY: 'cf-gw-key',
      CF_AI_GATEWAY_ACCOUNT_ID: 'my-account-id',
      CF_AI_GATEWAY_GATEWAY_ID: 'my-gateway-id',
    });
    const result = buildEnvVars(env);
    expect(result.CLOUDFLARE_AI_GATEWAY_API_KEY).toBe('cf-gw-key');
    expect(result.CF_AI_GATEWAY_ACCOUNT_ID).toBe('my-account-id');
    expect(result.CF_AI_GATEWAY_GATEWAY_ID).toBe('my-gateway-id');
  });

  it('passes Cloudflare AI Gateway alongside direct Anthropic key', () => {
    const env = createMockEnv({
      CLOUDFLARE_AI_GATEWAY_API_KEY: 'cf-gw-key',
      CF_AI_GATEWAY_ACCOUNT_ID: 'my-account-id',
      CF_AI_GATEWAY_GATEWAY_ID: 'my-gateway-id',
      ANTHROPIC_API_KEY: 'sk-anthro',
    });
    const result = buildEnvVars(env);
    expect(result.CLOUDFLARE_AI_GATEWAY_API_KEY).toBe('cf-gw-key');
    expect(result.ANTHROPIC_API_KEY).toBe('sk-anthro');
  });

  // Legacy AI Gateway support
  it('maps legacy AI_GATEWAY_API_KEY to ANTHROPIC_API_KEY with base URL', () => {
    const env = createMockEnv({
      AI_GATEWAY_API_KEY: 'sk-gateway-key',
      AI_GATEWAY_BASE_URL: 'https://gateway.ai.cloudflare.com/v1/123/my-gw/anthropic',
    });
    const result = buildEnvVars(env);
    expect(result.ANTHROPIC_API_KEY).toBe('sk-gateway-key');
    expect(result.ANTHROPIC_BASE_URL).toBe(
      'https://gateway.ai.cloudflare.com/v1/123/my-gw/anthropic',
    );
    expect(result.AI_GATEWAY_BASE_URL).toBe(
      'https://gateway.ai.cloudflare.com/v1/123/my-gw/anthropic',
    );
  });

  it('legacy AI_GATEWAY_* overrides direct ANTHROPIC_API_KEY', () => {
    const env = createMockEnv({
      AI_GATEWAY_API_KEY: 'gateway-key',
      AI_GATEWAY_BASE_URL: 'https://gateway.example.com/anthropic',
      ANTHROPIC_API_KEY: 'direct-key',
    });
    const result = buildEnvVars(env);
    expect(result.ANTHROPIC_API_KEY).toBe('gateway-key');
    expect(result.AI_GATEWAY_BASE_URL).toBe('https://gateway.example.com/anthropic');
  });

  it('strips trailing slashes from legacy AI_GATEWAY_BASE_URL', () => {
    const env = createMockEnv({
      AI_GATEWAY_API_KEY: 'sk-gateway-key',
      AI_GATEWAY_BASE_URL: 'https://gateway.ai.cloudflare.com/v1/123/my-gw/anthropic///',
    });
    const result = buildEnvVars(env);
    expect(result.AI_GATEWAY_BASE_URL).toBe(
      'https://gateway.ai.cloudflare.com/v1/123/my-gw/anthropic',
    );
  });

  it('falls back to ANTHROPIC_BASE_URL when no AI_GATEWAY_BASE_URL', () => {
    const env = createMockEnv({
      ANTHROPIC_API_KEY: 'direct-key',
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
    });
    const result = buildEnvVars(env);
    expect(result.ANTHROPIC_API_KEY).toBe('direct-key');
    expect(result.ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com');
  });

  // Gateway token mapping
  it('maps MOLTBOT_GATEWAY_TOKEN to OPENCLAW_GATEWAY_TOKEN for container', () => {
    const env = createMockEnv({ MOLTBOT_GATEWAY_TOKEN: 'my-token' });
    const result = buildEnvVars(env);
    expect(result.OPENCLAW_GATEWAY_TOKEN).toBe('my-token');
  });

  // Channel tokens
  it('includes all channel tokens when set', () => {
    const env = createMockEnv({
      TELEGRAM_BOT_TOKEN: 'tg-token',
      TELEGRAM_DM_POLICY: 'pairing',
      DISCORD_BOT_TOKEN: 'discord-token',
      DISCORD_DM_POLICY: 'open',
      SLACK_BOT_TOKEN: 'slack-bot',
      SLACK_APP_TOKEN: 'slack-app',
    });
    const result = buildEnvVars(env);

    expect(result.TELEGRAM_BOT_TOKEN).toBe('tg-token');
    expect(result.TELEGRAM_DM_POLICY).toBe('pairing');
    expect(result.DISCORD_BOT_TOKEN).toBe('discord-token');
    expect(result.DISCORD_DM_POLICY).toBe('open');
    expect(result.SLACK_BOT_TOKEN).toBe('slack-bot');
    expect(result.SLACK_APP_TOKEN).toBe('slack-app');
  });

  it('maps DEV_MODE to OPENCLAW_DEV_MODE for container', () => {
    const env = createMockEnv({
      DEV_MODE: 'true',
    });
    const result = buildEnvVars(env);
    expect(result.OPENCLAW_DEV_MODE).toBe('true');
  });

  // AI Gateway model override
  it('passes CF_AI_GATEWAY_MODEL to container', () => {
    const env = createMockEnv({
      CF_AI_GATEWAY_MODEL: 'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    });
    const result = buildEnvVars(env);
    expect(result.CF_AI_GATEWAY_MODEL).toBe('workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  });

  it('passes CF_ACCOUNT_ID to container', () => {
    const env = createMockEnv({ CF_ACCOUNT_ID: 'acct-123' });
    const result = buildEnvVars(env);
    expect(result.CF_ACCOUNT_ID).toBe('acct-123');
  });

  it('combines all env vars correctly', () => {
    // Override OEM defaults to test only the vars we care about
    const env = createMockEnv({
      ANTHROPIC_API_KEY: 'sk-key',
      MOLTBOT_GATEWAY_TOKEN: 'token',
      TELEGRAM_BOT_TOKEN: 'tg',
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      GROQ_API_KEY: undefined,
      TOGETHER_API_KEY: undefined,
    });
    const result = buildEnvVars(env);

    expect(result).toEqual({
      ANTHROPIC_API_KEY: 'sk-key',
      OPENCLAW_GATEWAY_TOKEN: 'token',
      TELEGRAM_BOT_TOKEN: 'tg',
    });
  });

  // OEM Agent secrets
  it('passes OEM Agent Supabase credentials', () => {
    const env = createMockEnv({
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      GROQ_API_KEY: undefined,
      TOGETHER_API_KEY: undefined,
    });
    const result = buildEnvVars(env);
    expect(result.SUPABASE_URL).toBe('https://project.supabase.co');
    expect(result.SUPABASE_SERVICE_ROLE_KEY).toBe('service-role-key');
  });

  it('passes OEM Agent LLM API keys', () => {
    const env = createMockEnv({
      GROQ_API_KEY: 'groq-key',
      TOGETHER_API_KEY: 'together-key',
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    });
    const result = buildEnvVars(env);
    expect(result.GROQ_API_KEY).toBe('groq-key');
    expect(result.TOGETHER_API_KEY).toBe('together-key');
  });

  it('passes OEM Agent research API keys', () => {
    const env = createMockEnv({
      BRAVE_API_KEY: 'brave-key',
      PERPLEXITY_API_KEY: 'perplexity-key',
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      GROQ_API_KEY: undefined,
      TOGETHER_API_KEY: undefined,
    });
    const result = buildEnvVars(env);
    expect(result.BRAVE_API_KEY).toBe('brave-key');
    expect(result.PERPLEXITY_API_KEY).toBe('perplexity-key');
  });

  it('passes browser automation secrets', () => {
    const env = createMockEnv({
      CDP_SECRET: 'cdp-shared-secret',
      WORKER_URL: 'https://worker.example.com',
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      GROQ_API_KEY: undefined,
      TOGETHER_API_KEY: undefined,
    });
    const result = buildEnvVars(env);
    expect(result.CDP_SECRET).toBe('cdp-shared-secret');
    expect(result.WORKER_URL).toBe('https://worker.example.com');
  });

  it('passes Slack webhook for notifications', () => {
    const env = createMockEnv({
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/xxx',
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      GROQ_API_KEY: undefined,
      TOGETHER_API_KEY: undefined,
    });
    const result = buildEnvVars(env);
    expect(result.SLACK_WEBHOOK_URL).toBe('https://hooks.slack.com/services/xxx');
  });
});
