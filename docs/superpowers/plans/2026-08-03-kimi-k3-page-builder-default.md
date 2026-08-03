# Kimi K3 Page Builder Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `kimi-k3` the default model for the OEM Agent Page Builder's six substantive AI stages while preserving task-specific fallbacks, overrides, cost telemetry, and rollback controls.

**Architecture:** Add a first-class K3 configuration to the existing `AiRouter`, point only Page Builder visual/generation routes at it, and keep the established default → database override → request override merge. The Moonshot adapter adds K3's top-level reasoning-effort field, while the dashboard exposes K3 without forcing a client override when “Default” is selected.

**Tech Stack:** TypeScript, Cloudflare Workers, Hono, Supabase, Vitest, Vue 3, Vite, shadcn-vue, Moonshot OpenAI-compatible Chat Completions API.

## Global Constraints

- The official API model identifier is exactly `kimi-k3`.
- The API base remains `https://api.moonshot.ai/v1` and credentials remain server-only in `MOONSHOT_API_KEY`.
- K3 uses `reasoning_effort: "high"` for Page Builder calls.
- K3 standard input cost is USD $3.00 per million cache-miss tokens and output cost is USD $15.00 per million tokens; cache-hit input cost is USD $0.30 per million but cannot be calculated until the provider exposes cached-token usage separately.
- Only `design_vision`, `page_generation`, `page_visual_extraction`, `page_content_generation`, `page_screenshot_to_code`, and `page_structuring` change defaults.
- Database and per-request overrides continue to take precedence.
- No reasoning content is exposed or persisted as generated page content.
- Do not change crawl, extraction, validation, sales, quick-scan, or publication behavior.
- Never deploy a production secret from source control or print an API key in commands/logs.

---

### Task 1: Register Kimi K3, switch Page Builder defaults, and centralise model-cost calculation

**Files:**
- Create: `src/ai/router.test.ts`
- Modify: `src/ai/router.ts:40-180`
- Modify: `src/ai/router.ts:259-380`
- Modify: `src/ai/router.ts:1080-1130`

**Interfaces:**
- Produces: `KIMI_K3_CONFIG` with `model`, API metadata, capabilities, pricing, and `default_params.reasoning_effort`.
- Produces: `calculateInferenceCost(provider: AiProvider, model: string, usage?: { prompt_tokens: number; completion_tokens: number }): number | null`.
- Preserves: `TASK_ROUTING`, `AVAILABLE_MODELS`, and `AiRouter.route()` public interfaces.

- [ ] **Step 1: Write failing registry, routing, and cost tests**

Create `src/ai/router.test.ts` with assertions equivalent to:

```ts
import { describe, expect, it } from 'vitest';
import {
  AVAILABLE_MODELS,
  KIMI_K3_CONFIG,
  TASK_ROUTING,
  calculateInferenceCost,
} from './router';

const pageBuilderTasks = [
  'design_vision',
  'page_generation',
  'page_visual_extraction',
  'page_content_generation',
  'page_screenshot_to_code',
  'page_structuring',
] as const;

describe('Kimi K3 Page Builder defaults', () => {
  it('registers Kimi K3 with the official identifier and capabilities', () => {
    expect(KIMI_K3_CONFIG).toMatchObject({
      model: 'kimi-k3',
      api_base: 'https://api.moonshot.ai/v1',
      max_context: 1_048_576,
      supports_vision: true,
      supports_tools: true,
      default_params: { reasoning_effort: 'high' },
    });
    expect(AVAILABLE_MODELS).toContainEqual(expect.objectContaining({
      id: 'kimi-k3-moonshot',
      provider: 'moonshot',
      model: 'kimi-k3',
      capabilities: ['vision', 'json_mode', 'reasoning', 'tools'],
    }));
  });

  it('uses Kimi K3 only for the six approved Page Builder task defaults', () => {
    for (const task of pageBuilderTasks) {
      expect(TASK_ROUTING[task]).toMatchObject({ provider: 'moonshot', model: 'kimi-k3' });
    }
    expect(TASK_ROUTING.quick_scan.model).not.toBe('kimi-k3');
    expect(TASK_ROUTING.llm_extraction.model).not.toBe('kimi-k3');
    expect(TASK_ROUTING.sales_conversation.model).not.toBe('kimi-k3');
  });

  it('calculates K3 cache-miss inference cost from official rates', () => {
    expect(calculateInferenceCost('moonshot', 'kimi-k3', {
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
    })).toBe(18);
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
pnpm exec vitest run src/ai/router.test.ts --pool forks --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because `KIMI_K3_CONFIG` and `calculateInferenceCost` are not exported and current Page Builder routes still select Gemini/K2.5.

- [ ] **Step 3: Add the K3 registry entry and route defaults**

In `src/ai/router.ts`, add:

```ts
export const KIMI_K3_CONFIG = {
  api_base: 'https://api.moonshot.ai/v1',
  api_key_env: 'MOONSHOT_API_KEY',
  model: 'kimi-k3',
  cost_per_m_input: 3.00,
  cost_per_m_output: 15.00,
  max_context: 1_048_576,
  supports_vision: true,
  supports_tools: true,
  default_params: { reasoning_effort: 'high' as const },
};
```

Add K3 to `AVAILABLE_MODELS`, set the six task routes to K3, and use the exact fallbacks from the approved design:

```ts
page_screenshot_to_code: {
  provider: 'moonshot',
  model: KIMI_K3_CONFIG.model,
  modelConfig: null,
  fallbackProvider: 'together',
  fallbackModel: AI_ROUTER_CONFIG.kimi_k2_5.model,
},
```

For the other five routes use their approved Gemini/Workers AI fallbacks.

Extract the existing private cost branches into exported `calculateInferenceCost`, add the K3 rate branch, and have `AiRouter.calculateCost()` delegate to it.

- [ ] **Step 4: Run the test and verify GREEN**

Run the same focused Vitest command. Expected: all tests in `src/ai/router.test.ts` pass.

- [ ] **Step 5: Commit the registry and routing slice**

```bash
git add src/ai/router.ts src/ai/router.test.ts
git commit -m "feat(oem-agent): default page builder to Kimi K3"
```

---

### Task 2: Send K3-compatible Moonshot requests and preserve override precedence

**Files:**
- Modify: `src/ai/router.test.ts`
- Modify: `src/ai/router.ts:475-570`
- Modify: `src/ai/router.ts:759-830`
- Modify: `src/routes/oem-agent.test.ts`
- Modify: `src/routes/oem-agent.ts:4800-4910`

**Interfaces:**
- Consumes: `KIMI_K3_CONFIG` from Task 1.
- Preserves: `AiRouter.route(request: InferenceRequest): Promise<InferenceResponse>`.
- Produces: K3 requests containing `reasoning_effort: "high"` only for `model === "kimi-k3"`.
- Produces: protected `POST /api/v1/oem-agent/admin/ai-model-canary`, which performs one non-publishing K3 structuring inference and returns the actual routed provider/model/fallback state.

- [ ] **Step 1: Add a failing K3 request-format test**

Add to `src/ai/router.test.ts`:

```ts
import { afterEach, vi } from 'vitest';
import { AiRouter } from './router';

afterEach(() => vi.unstubAllGlobals());

it('sends K3 reasoning, image, and JSON fields to Moonshot', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    choices: [{ message: { content: '{"sections":[]}' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  const router = new AiRouter({ moonshot: 'test-key' });

  const response = await router.route({
    taskType: 'page_structuring',
    prompt: 'Return structured sections',
    imageBase64: 'aW1hZ2U=',
    imageMimeType: 'image/png',
    requireJson: true,
    maxTokens: 4096,
  });

  const request = fetchMock.mock.calls[0][1] as RequestInit;
  const body = JSON.parse(String(request.body));
  expect(response).toMatchObject({ provider: 'moonshot', model: 'kimi-k3', wasFallback: false });
  expect(body).toMatchObject({
    model: 'kimi-k3',
    reasoning_effort: 'high',
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  });
  expect(body.messages[0].content[0].image_url.url).toBe('data:image/png;base64,aW1hZ2U=');
});
```

- [ ] **Step 2: Add failing legacy and override-precedence tests**

Add tests proving:

```ts
expect(legacyMoonshotBody.reasoning_effort).toBeUndefined();
expect(perRequestOverrideResult).toMatchObject({
  provider: 'google_gemini',
  model: 'gemini-2.5-pro',
});
expect(databaseOverrideResult).toMatchObject({
  provider: 'google_gemini',
  model: 'gemini-3.1-pro-preview',
});
```

Use a small Supabase fake whose `workflow_settings.single()` returns an `ai_model_overrides.page_structuring` value and whose `ai_inference_log.insert()` resolves successfully. These tests must exercise `AiRouter.route`, not duplicate the merge logic.

- [ ] **Step 3: Run the focused test and verify RED**

Expected: the K3 body lacks `reasoning_effort`; existing override tests remain useful guards.

- [ ] **Step 4: Implement the K3-only request field**

In `callMoonshot`, add to the request object:

```ts
...(model === KIMI_K3_CONFIG.model
  ? { reasoning_effort: KIMI_K3_CONFIG.default_params.reasoning_effort }
  : {}),
```

Keep `messages`, image input, `max_tokens`, and JSON response format unchanged. Do not persist or expose `reasoning_content`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Expected: K3 request, legacy request, and override-precedence tests all pass.

- [ ] **Step 6: Add the protected non-publishing K3 canary route test-first**

Before committing, add a failing route test to `src/routes/oem-agent.test.ts` that calls `/admin/ai-model-canary`, stubs Supabase REST calls separately from the Moonshot chat-completion call, and expects:

```ts
expect(response.status).toBe(200);
expect(await response.json()).toMatchObject({
  success: true,
  taskType: 'page_structuring',
  provider: 'moonshot',
  model: 'kimi-k3',
  wasFallback: false,
});
expect(moonshotRequestBody).toMatchObject({
  model: 'kimi-k3',
  reasoning_effort: 'high',
  max_tokens: 128,
});
```

Verify RED because the route does not exist. Then add the protected route beside the existing AI model configuration routes:

```ts
app.post('/admin/ai-model-canary', async (c) => {
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const router = new AiRouter({
    moonshot: c.env.MOONSHOT_API_KEY,
    together: c.env.TOGETHER_API_KEY,
    google: c.env.GOOGLE_API_KEY,
  }, supabase, c.env.AI);
  const result = await router.route({
    taskType: 'page_structuring',
    prompt: 'Return exactly this JSON object: {"ok":true}',
    requireJson: true,
    maxTokens: 128,
    overrideRoute: { provider: 'moonshot', model: KIMI_K3_CONFIG.model },
  });
  return c.json({
    success: true,
    taskType: 'page_structuring',
    provider: result.provider,
    model: result.model,
    wasFallback: result.wasFallback,
  });
});
```

The endpoint is covered by the existing outer `/admin/*` authentication policy and does not accept a prompt or write a generated page. Run both focused test files and verify GREEN.

- [ ] **Step 7: Commit the transport and canary slice**

```bash
git add src/ai/router.ts src/ai/router.test.ts src/routes/oem-agent.ts src/routes/oem-agent.test.ts
git commit -m "feat(oem-agent): send Kimi K3 reasoning requests"
```

---

### Task 3: Correct Page Generator model labels and inference-cost telemetry

**Files:**
- Create: `src/design/page-generator-model-routing.test.ts`
- Modify: `src/design/page-generator.ts:1028-1165`

**Interfaces:**
- Consumes: `calculateInferenceCost` from Task 1.
- Preserves: `PageGenerator.generatePage()` response shape, including legacy `claude_*` telemetry fields.

- [ ] **Step 1: Write a failing source/telemetry contract test**

Create `src/design/page-generator-model-routing.test.ts` to read `page-generator.ts` and assert that the screenshot path:

```ts
expect(source).toContain('calculateInferenceCost(kimiResponse.provider, kimiResponse.model, kimiResponse.usage)');
expect(source).toContain('Failed to parse ${kimiResponse.model} response as JSON');
expect(source).not.toContain('Using Kimi K2.5 screenshot-to-code');
expect(source).not.toContain("* 0.60");
```

This protects the legacy response schema while ensuring runtime telemetry follows the model that actually answered, including fallbacks.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
pnpm exec vitest run src/design/page-generator-model-routing.test.ts --pool forks --maxWorkers=1 --minWorkers=1
```

Expected: FAIL on the K2.5 log/error text and hard-coded cost calculation.

- [ ] **Step 3: Use actual inference response metadata**

Import `calculateInferenceCost` from `../ai/router`. Replace screenshot and no-screenshot hard-coded rates with:

```ts
claudeCost = calculateInferenceCost(
  kimiResponse.provider,
  kimiResponse.model,
  kimiResponse.usage,
) ?? 0;
```

Use the corresponding response variable in the no-screenshot branch. Make logs identify the routed model without exposing reasoning:

```ts
console.log(`[PageGenerator] Using routed screenshot-to-code model for ${oemId}/${modelSlug}`);
```

Return parse errors with `${kimiResponse.model}` or `${claudeResponse.model}` rather than stale provider names.

- [ ] **Step 4: Run the contract test and verify GREEN**

Expected: the new test passes.

- [ ] **Step 5: Commit the telemetry slice**

```bash
git add src/design/page-generator.ts src/design/page-generator-model-routing.test.ts
git commit -m "fix(oem-agent): report routed page model costs"
```

---

### Task 4: Expose Kimi K3 in the Page Builder admin

**Files:**
- Modify: `dashboard/src/pages/dashboard/page-builder/ai-model-options.test.ts`
- Modify: `dashboard/src/pages/dashboard/page-builder/ai-model-options.ts`
- Modify: `dashboard/src/pages/dashboard/page-builder-docs.vue`

**Interfaces:**
- Preserves: `DEFAULT_AI_MODEL_VALUE`, `AI_MODEL_OPTIONS`, and `getAiModelOverride(value)`.
- Produces: `{ provider: "moonshot", model: "kimi-k3" }` for the explicit K3 option.

- [ ] **Step 1: Change the dashboard catalog test first**

Make the expected display order begin:

```ts
[
  { value: 'default', label: 'Default (from settings)' },
  { value: 'moonshot::kimi-k3', label: 'Kimi K3' },
  { value: 'google_gemini::gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
]
```

Add:

```ts
expect(getAiModelOverride('moonshot::kimi-k3')).toEqual({
  provider: 'moonshot',
  model: 'kimi-k3',
});
```

- [ ] **Step 2: Run the dashboard test and verify RED**

Run from `dashboard/`:

```bash
pnpm test -- src/pages/dashboard/page-builder/ai-model-options.test.ts
```

Expected: FAIL because K3 is absent.

- [ ] **Step 3: Add K3 to the dashboard option catalog**

Insert immediately after the default option:

```ts
{ value: 'moonshot::kimi-k3', label: 'Kimi K3', provider: 'moonshot', model: 'kimi-k3' },
```

Keep “Default” mapped to `undefined`, so the backend decides the task route. Update Page Builder documentation references from K2 screenshot generation to K3-default routing and document `MOONSHOT_API_KEY` as the server-side credential.

- [ ] **Step 4: Run the focused dashboard test and verify GREEN**

Expected: all AI model option tests pass.

- [ ] **Step 5: Run required dashboard formatting and verification**

From `dashboard/` run:

```bash
pnpm lint:fix
pnpm test
pnpm build
```

Expected: each command exits 0.

- [ ] **Step 6: Commit the dashboard slice**

```bash
git add dashboard/src/pages/dashboard/page-builder/ai-model-options.ts dashboard/src/pages/dashboard/page-builder/ai-model-options.test.ts dashboard/src/pages/dashboard/page-builder-docs.vue
git commit -m "feat(dashboard): expose Kimi K3 page default"
```

---

### Task 5: Verify the complete change and activate K3 safely

**Files:**
- Verify only; no source file is created unless verification identifies a defect.

**Interfaces:**
- Consumes: all preceding tasks.
- Produces: a deployed Worker version whose inference log proves whether K3 is active or falling back.

- [ ] **Step 1: Run complete OEM Agent verification**

From the OEM Agent root:

```bash
pnpm exec vitest run --pool forks --maxWorkers=1 --minWorkers=1
pnpm typecheck
git diff --check
```

Expected: all project tests pass, TypeScript exits 0, and the diff check has no output.

- [ ] **Step 2: Confirm secret names without printing values**

Run:

```bash
pnpm exec wrangler secret list -c wrangler.jsonc
```

Expected: `MOONSHOT_API_KEY` appears. Do not print or retrieve the secret value.

- [ ] **Step 3: Push and deploy**

After fetching `origin/main` and confirming the local branch is a descendant:

```bash
git push origin HEAD:main
pnpm run deploy
```

Record the commit SHA and Cloudflare Worker version ID.

- [ ] **Step 4: Run the deployed K3 Page Builder canary**

From an authenticated dashboard browser session, call the fixed-prompt, non-publishing endpoint:

```js
const sessionEntry = Object.entries(localStorage).find(([key]) => /^sb-.*-auth-token$/.test(key))
const session = sessionEntry ? JSON.parse(sessionEntry[1]) : null
const accessToken = session?.access_token || session?.currentSession?.access_token
if (!accessToken) throw new Error('Authenticated Supabase dashboard session not found')

await fetch('https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/ai-model-canary', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
}).then(response => response.json())
```

Expected response:

```json
{
  "success": true,
  "taskType": "page_structuring",
  "provider": "moonshot",
  "model": "kimi-k3",
  "wasFallback": false
}
```

Verify the latest `ai_inference_log` row has:

```json
{
  "task_type": "page_structuring",
  "provider": "moonshot",
  "model": "kimi-k3",
  "status": "success",
  "was_fallback": false
}
```

- [ ] **Step 5: Apply the credential gate**

If the canary returns HTTP 401 or the log records a fallback, do not claim K3 is active. Report that the deployed route defaults to K3 but the Moonshot credential/account must be replaced or topped up through the Kimi Open Platform. After the user supplies authority for a valid key, rotate only the Cloudflare `MOONSHOT_API_KEY` secret and rerun Step 4.

If the canary succeeds, query the live AI model configuration through an authenticated dashboard session and verify the six defaults resolve to `moonshot` / `kimi-k3` with no database override masking them.

- [ ] **Step 6: Final production smoke check**

Open the Page Builder, confirm Kimi K3 appears immediately below Default, run a non-publishing structure preview, and verify there are no browser console errors. Record the browser evidence and inference-log timestamp in the handoff.
