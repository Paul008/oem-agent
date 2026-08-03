# Kimi K3 as the Page Builder Default

Date: 2026-08-03
Status: Approved for implementation

## Objective

Make Moonshot Kimi K3 the default model for the OEM Agent Page Builder's substantive visual and generation stages. Keep crawling, extraction, validation, sales, and lightweight classification on their existing purpose-specific models.

The official Moonshot model identifier is `kimi-k3`. Kimi K3 is a native multimodal, always-thinking model with an OpenAI-compatible Chat Completions API, image input, JSON output, tool support, and a one-million-token context window.

## Scope

Kimi K3 becomes the checked-in default for these task types:

- `design_vision`
- `page_generation`
- `page_visual_extraction`
- `page_content_generation`
- `page_screenshot_to_code`
- `page_structuring`

The following remain unchanged:

- crawl and extraction routes
- quick scan and extraction-quality checks
- sales conversation and content routes
- scheduled synchronisation and validation routes
- per-request model overrides
- database model overrides

Database overrides and per-request overrides continue to take precedence over checked-in defaults.

## Architecture

### Model registry

Add a first-class Kimi K3 configuration to `src/ai/router.ts` rather than treating the model as an arbitrary string. The configuration records:

- provider: `moonshot`
- API base: `https://api.moonshot.ai/v1`
- model: `kimi-k3`
- API key: `MOONSHOT_API_KEY`
- capabilities: vision, JSON mode, reasoning, and tools
- context window: 1,048,576 tokens
- default reasoning effort: `high`

`AVAILABLE_MODELS` and the Page Builder model options expose Kimi K3. Kimi K2.6 and Kimi K2.5 remain selectable for rollback and comparisons.

### Routing

`TASK_ROUTING` selects Kimi K3 for the six in-scope Page Builder task types. Existing independent providers remain fallbacks so a Moonshot credential, quota, or model-availability failure does not disable page work:

| Task | Primary | Fallback |
| --- | --- | --- |
| Design vision | Kimi K3 | Gemini 3.1 Pro |
| Page generation | Kimi K3 | Gemini 3.1 Pro |
| Visual extraction | Kimi K3 | Gemma 4 on Workers AI |
| Content generation | Kimi K3 | Gemini 3.1 Pro |
| Screenshot-to-code | Kimi K3 | Kimi K2.5 through Together |
| Page structuring | Kimi K3 | Gemini 3.1 Pro |

The existing merge order remains unchanged:

1. checked-in task default
2. database task override
3. per-request override

### Moonshot request format

The Moonshot provider adapter adds K3-specific request fields only when `model === "kimi-k3"`:

- `reasoning_effort: "high"`
- the existing multimodal `image_url` payload when a screenshot is supplied
- the existing `response_format: { "type": "json_object" }` for structured tasks
- the existing task-specific output-token limit

Page Builder requests are single-turn calls, so preserved reasoning history is not required for this release. If K3 is later used for multi-turn agents or tool loops, the complete assistant message, including `reasoning_content` and `tool_calls`, must be stored and replayed.

The application consumes `message.content` as it does today. Reasoning content is not displayed or persisted as user-facing page content.

## Admin experience

Kimi K3 appears immediately below “Default (from settings)” in the Page Builder model selector. Selecting “Default” resolves to K3 through backend task routing; the client does not hard-code a model override for the default option.

The AI model settings response includes K3 in `availableModels`, so the task-routing administration page can select it explicitly.

## Credentials and activation

The current local `MOONSHOT_API_KEY` receives HTTP 401 from the official models endpoint. This does not reveal whether the separately stored Cloudflare production secret is valid.

Production activation therefore uses this gate:

1. deploy the code with independent fallbacks intact
2. run a minimal K3 inference through the deployed Worker
3. verify `ai_inference_log` records provider `moonshot`, model `kimi-k3`, and status `success`
4. if authentication or model access fails, keep the deployment but use the automatic fallback and replace `MOONSHOT_API_KEY` before declaring K3 active

No API key is exposed to the dashboard or stored in source control.

## Error handling and observability

The existing `AiRouter` retry/fallback loop remains responsible for transport, authentication, quota, and malformed-output failures. Inference logging records the actual provider and model for both primary and fallback attempts.

K3 failures must include the provider HTTP status without logging credentials or response headers that may contain sensitive values. The UI continues receiving the existing task-level error shape if both primary and fallback fail.

## Testing

Automated tests cover:

- Kimi K3 appears in the backend available-model registry with the correct capabilities
- the six Page Builder task defaults resolve to `moonshot` / `kimi-k3`
- unrelated task defaults remain unchanged
- database and per-request overrides still win
- K3 Moonshot requests include `reasoning_effort: "high"`
- image and JSON-mode payloads remain valid for K3
- K2.5 requests do not receive K3-only parameters
- the dashboard selector includes K3 and resolves it to the correct override shape

Required verification:

- focused router and dashboard tests
- complete OEM Agent test suite
- OEM Agent TypeScript check
- dashboard `pnpm lint:fix`
- dashboard `pnpm build`
- deployed K3 canary and inference-log verification

## Rollback

Immediate rollback does not require a new build. An administrator can add database overrides for the six task types, returning them to their former Gemini, Workers AI, and K2.5 routes. A code rollback can follow after service restoration.

## Out of scope

- making K3 the universal model for every OEM Agent task
- adding K3 to sales conversations or long-running autonomous agents
- exposing chain-of-thought or `reasoning_content`
- building a new tool-execution loop
- changing ingestion semantics or generated-page publication rules
