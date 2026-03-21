# Codebase Concerns

**Analysis Date:** 2026-03-21

## Tech Debt

**Unfinished Implementations:**
- Issue: Multiple endpoints marked TODO with partial implementations
- Files: `src/routes/cron.ts:399`, `src/routes/agents.ts:197`, `src/routes/agents.ts:243`, `src/routes/cdp.ts:1870`, `src/orchestrator.ts:3666`, `src/workflows/agent-spawner.ts:366`, `src/workflows/router.ts:351`
- Impact: Features won't work until complete (discovery refresh, agent action execution, rollback, batch Slack messaging, condition evaluation)
- Fix approach: Implement each TODO with proper error handling and testing; block feature flags until ready

**Agent Action Execution Stub:**
- Issue: Agent approval creates background task via `waitUntil()` that simply marks action as "completed" after 1 second delay without actual execution
- Files: `src/routes/agents.ts:197-211`
- Impact: Agent actions are marked complete but never actually execute; workflow system not integrated
- Fix approach: Integrate actual workflow spawner; add proper status tracking (pending → executing → completed); add rollback support

**Agent Rollback Not Implemented:**
- Issue: Rollback endpoint accepts requests but only marks action as "failed" without restoring previous state
- Files: `src/routes/agents.ts:243-254`
- Impact: User has no way to recover from failed automated changes
- Fix approach: Store complete rollback_data with all affected records; implement transaction-like rollback; validate rollback succeeds before committing

**Discovery Refresh Stub:**
- Issue: OEM discovery job endpoint returns "not yet implemented" message
- Files: `src/routes/cron.ts:399-403`
- Impact: API discovery cannot be refreshed on schedule
- Fix approach: Implement refresh logic to rerun API discovery, update discovered_apis table, compare with existing APIs

**CDP Response Body Not Captured:**
- Issue: Fetch.getResponseBody() returns empty body for all responses
- Files: `src/routes/cdp.ts:1869-1872`
- Impact: CDP clients cannot retrieve response bodies; limits debugging and network inspection
- Fix approach: Store response bodies during Fetch.ResponseReceived; implement size limits to prevent memory issues

**Batch Slack Messaging Not Sent:**
- Issue: Code prepares Slack batch message but never sends it
- Files: `src/orchestrator.ts:3666`
- Impact: Multiple change events lose batch notification efficiency
- Fix approach: Call notifier.send() for prepared batch message; add retry logic

**Condition Evaluation Stub:**
- Issue: Workflow condition evaluation returns early without evaluating conditions
- Files: `src/workflows/router.ts:351`
- Impact: Conditional workflows always proceed without checking prerequisites
- Fix approach: Implement condition expression evaluator; add support for field comparisons and logical operators

**Type Casting Issues:**
- Issue: Heavy use of `as any` and type casts to bypass TypeScript checks
- Files: Multiple locations across `src/extract/engine.ts`, `src/orchestrator.ts`, `src/routes/media.ts`
- Impact: Type safety weakened; possible runtime errors from incorrect type assumptions
- Fix approach: Define proper interfaces for dynamic data structures; use type guards instead of casts

---

## Known Bugs

**Dashboard Specs Display Bug (Fixed in Mar 2026):**
- Status: FIXED
- Symptoms: Specs showing as individual characters on dashboard (one character per row)
- Files: `dashboard/src/pages/products.vue`, `dashboard/src/pages/variants.vue`, `dashboard/src/pages/specs.vue`
- Root cause: `specs_json` contains top-level string values (e.g. `brakes: "4-Wheel Antilock Disc"`); code called `Object.entries()` on strings, iterating character-by-character
- Solution applied: Added `typeof section === 'string'` checks before calling `Object.entries()`

**Agents Stuck in Running State:**
- Symptoms: Some agent_actions have `status: 'running'` that never complete or fail
- Files: N/A - data-level issue
- Root cause: Seed data or manual testing creates actions without completion triggers
- Workaround: Direct Supabase update to mark as failed:
  ```sql
  UPDATE agent_actions SET status = 'failed', error_message = 'Stuck state' WHERE status = 'running'
  ```

**Supabase Migration Conflicts:**
- Symptoms: `supabase db push` fails with migration timestamp conflicts
- Root cause: Duplicate local migration timestamps from concurrent development
- Workaround: Use `migration repair --status reverted` then `--include-all`

**CDP WebSocket Connection Limits:**
- Symptoms: Complex sites with Optimizely/Adobe DTM timeout on Lightpanda
- Files: `src/orchestrator.ts:1545-1570`
- Impact: Site data not captured; falls back to Cloudflare Browser (slower)
- Workaround: Cloudflare Browser fallback is automatic; Lightpanda is beta feature

**Ford API Direct Fetch Not Reliable:**
- Symptoms: Ford product titles sometimes missing from direct API calls
- Files: `src/orchestrator.ts:377-452`
- Root cause: API endpoint timing issues; network capture catches more responses
- Current state: Debug logging added; network capture is primary method

---

## Security Considerations

**Unvalidated Secret Handling in CDP:**
- Risk: CDP endpoint accepts secret as query parameter `?secret=<CDP_SECRET>`
- Files: `src/routes/cdp.ts:68-75`
- Current mitigation: Intentionally NOT protected by Cloudflare Access per design; secret passed in URL
- Recommendations:
  - Move secret to Authorization header instead of query param
  - Add rate limiting to prevent brute force
  - Log all CDP connection attempts
  - Consider using Cloudflare Access despite comment saying it's excluded

**Console Output in Production:**
- Risk: 591 console.log/error/warn calls across codebase; may leak sensitive data
- Files: Widespread across all major modules
- Current mitigation: Basic filtering in logging module
- Recommendations:
  - Use structured logger (Winston, Pino) instead of console
  - Log only non-sensitive fields for products/offers/colors
  - Strip API response bodies that contain credentials
  - Different log levels for dev vs. production

**No Input Validation on Dynamic Fields:**
- Risk: OEM registry entries, API responses, and user uploads not validated against schema
- Files: `src/oem/registry.ts`, `src/extract/engine.ts`, `src/routes/onboarding.ts`
- Current mitigation: Type checking at compile time only
- Recommendations:
  - Add runtime validation for all Supabase inserts
  - Use Zod or similar for schema validation
  - Validate API response shapes before processing

**No Rate Limiting on Public Routes:**
- Risk: Public API endpoints (health, oems, dealer-api) have no rate limiting
- Files: `src/routes/oem-agent.ts`, `src/routes/dealer-api.ts`
- Impact: Vulnerable to DoS attacks; can exhaust database query limits
- Recommendations:
  - Add rate limiting middleware per IP/API key
  - Implement request throttling for database queries
  - Cache static responses (OEM list, dealer locations)

**Secrets in Memory (Lightpanda CDP Connection):**
- Risk: Lightpanda WebSocket credentials stored in process memory during browser lifecycle
- Files: `src/orchestrator.ts:1560-1570`
- Current mitigation: Credentials from environment variables only
- Recommendations:
  - Rotate Lightpanda credentials regularly
  - Clear WebSocket session data explicitly on connection close
  - Use temporary/scoped credentials when possible

---

## Performance Bottlenecks

**Orchestrator File Too Large:**
- Problem: `src/orchestrator.ts` = 3808 lines; contains multiple concerns (crawling, extraction, processing, API discovery, notifications)
- Files: `src/orchestrator.ts`
- Cause: Monolithic design; mixing infrastructure orchestration with business logic
- Improvement path: Split into focused modules (crawl-executor.ts, change-processor.ts, api-analyzer.ts, notification-sender.ts)

**Network Capture Response Promises Not Drained:**
- Problem: `Promise.all(responsePromises)` waits for all network responses but may timeout waiting for slow APIs
- Files: `src/orchestrator.ts:1405-1408`
- Cause: No timeout on individual response promises; single slow API blocks entire page capture
- Improvement path: Implement Promise.race with 3s timeout per response; collect what's available on timeout

**Heavy Use of console.log in Hot Paths:**
- Problem: 591 console calls scattered throughout; logging in render loop / network handlers
- Files: Widespread across core modules
- Cause: Debug logging left in production code
- Improvement path: Replace with structured logging; use debug-level to minimize overhead

**No Caching of Extracted Data:**
- Problem: Each crawl re-fetches and re-extracts same pages; no cache invalidation strategy
- Files: `src/extract/cache.ts` exists but integration is incomplete
- Cause: Cache implementation present but not systematically used
- Improvement path: Enable caching layer by default; implement TTL-based invalidation; add cache warming on schedule

**Lightpanda Browser Lifecycle Not Managed:**
- Problem: Browser processes may accumulate if connections fail; no cleanup guarantee
- Files: `src/orchestrator.ts:1545-1570`
- Cause: Raw CDP WebSocket without resource cleanup guarantees
- Improvement path: Implement process pooling with lifecycle management; add graceful shutdown handler

**Supabase Client Re-initialization on Every Request:**
- Problem: OrchestratorConfig creates new Supabase client per request instead of reusing
- Files: `src/orchestrator.ts:3765-3784`
- Cause: Factory pattern instantiates fresh client
- Improvement path: Use singleton pattern or request-scoped pooling

**N+1 Queries in Product Relationship Loading:**
- Problem: Loading products with nested colors/pricing likely fetches records individually
- Files: Potential issue in `src/routes/oem-agent.ts` product query endpoints
- Cause: Supabase queries may not be fully specifying joins
- Improvement path: Always use `select()` with foreign key expansion; avoid subsequent queries per record

**Memory Accumulation in In-Memory Cache:**
- Problem: `memoryCache = new Map()` in extract/cache.ts never evicts old entries
- Files: `src/extract/cache.ts:97-110`
- Cause: No LRU or TTL eviction policy
- Improvement path: Implement bounded cache with LRU eviction; periodic cleanup task

---

## Fragile Areas

**Extract Engine Coverage Scoring Logic:**
- Files: `src/extract/engine.ts:410-454`
- Why fragile: Coverage percentages (0.2 per required field, 0.1 per optional) are hardcoded; no validation that coverage actually reflects data quality; easy to trick with minimal data
- Safe modification: Add integration tests for extraction quality; validate coverage against manual QA; implement threshold alerts
- Test coverage: Gaps in edge case testing for malformed product data
- Risk: Extraction coverage can be high while actual data is incomplete or incorrect

**API Candidate Analysis:**
- Files: `src/orchestrator.ts:1410-1450`
- Why fragile: Heuristics for API detection based on URL patterns and response content-type; easily breaks with new OEM API structures
- Safe modification: Document all heuristics; add integration tests per OEM; maintain curated API list in registry
- Test coverage: No integration tests for API discovery against real OEM sites
- Risk: New OEM APIs silently missed; no alerting when API detection fails

**Page Type Classification:**
- Files: `src/oem/registry.ts` (definitions), extraction logic depends on accurate page types
- Why fragile: PageType is string union; misclassified pages extract wrong data
- Safe modification: Add validation stage that verifies extracted data matches expected page type; flag mismatches
- Test coverage: No automated testing of page type accuracy
- Risk: Silent data corruption from misclassified pages

**Lightpanda CDP Protocol Mapping:**
- Files: `src/routes/cdp.ts:100-1878`
- Why fragile: Hand-written CDP protocol implementation; protocol changes in Chrome may break clients
- Safe modification: Add versioning header; implement protocol negotiation; extensive integration tests with real CDP clients
- Test coverage: Minimal testing of CDP command parsing and response generation
- Risk: Out-of-sync protocol implementations cause silent failures

**Dynamic Supabase Query Building:**
- Files: Throughout routes (agents, oem-agent, dealer-api)
- Why fragile: Queries built via chained method calls; easy to accidentally omit filters or joins
- Safe modification: Add query builder validation; test all query paths with multiple data states
- Test coverage: Database unit tests are minimal (4 test files with ~1160 lines total)
- Risk: Leaked data from missing query filters; N+1 query performance issues

**Workflow Execution State Machine:**
- Files: `src/workflows/agent-spawner.ts:366`, `src/routes/agents.ts:197-211`
- Why fragile: State transitions (pending → executing → completed) not atomic; concurrent approvals can race
- Safe modification: Implement database-level locks; add idempotency keys; test concurrent request scenarios
- Test coverage: No tests for concurrent agent action processing
- Risk: Duplicate execution; lost state; data inconsistency

---

## Scaling Limits

**Concurrent Browser Processes:**
- Current capacity: Lightpanda handles 1 connection per process; Cloudflare Browser handles ~10-20 concurrent pages
- Limit: Single worker instance can handle ~20 OEMs × ~5 pages each = ~100 concurrent pages without scaling
- Scaling path: Implement worker pool pattern; distribute crawls across Durable Objects; add priority queue for burst traffic

**Supabase Database Connections:**
- Current capacity: Supabase free tier = 2 concurrent connections; paid tier = higher
- Limit: Each worker/route creates independent connections; quickly exhausts pool with multiple concurrent requests
- Scaling path: Connection pooling; query batching; read replicas for high-frequency queries

**R2 Bucket Operations:**
- Current capacity: R2 has per-second rate limits (~1000 ops/sec)
- Limit: Crawling 17 OEMs × 100+ pages each = potentially 1700+ writes per crawl cycle
- Scaling path: Batch writes; implement write coalescing; background sync task

**Memory Usage Under Load:**
- Current capacity: Cloudflare Worker memory = ~128MB
- Limit: Extracting from large HTML pages + network capture + caching can exceed limits
- Scaling path: Stream-based parsing instead of loading entire DOM; external caching (Redis); reduce in-process cache size

**CDP WebSocket Message Queue:**
- Current capacity: No explicit queue limits; messages processed sequentially
- Limit: High-frequency updates (network events, page updates) can build unbounded queue
- Scaling path: Implement backpressure mechanism; drop low-priority events; batch multiple events

---

## Dependencies at Risk

**Lightpanda Browser (Beta):**
- Risk: Lightpanda is nightly/beta build; protocol changes break clients; limited community support
- Impact: Crawl failures on complex sites; fallback to slower Cloudflare Browser
- Migration plan: Maintain Cloudflare Browser as long-term default; use Lightpanda only for high-throughput scenarios with fallback

**Puppeteer for Cloudflare Workers:**
- Risk: Cloudflare Puppeteer package may diverge from upstream; limited to Cloudflare Browser API
- Impact: Cannot use standard Puppeteer features; vendor lock-in
- Migration plan: Maintain compatibility layer; consider headless-chrome alternatives if Cloudflare deprecates

**Cheerio HTML Parsing:**
- Risk: Cheerio is mostly stable but newer versions have breaking changes; jQuery-style API limits performance
- Impact: Extraction may fail on unusual HTML; performance on large documents
- Migration plan: Consider jsdom or linkedom for better standards compliance; profile extraction bottlenecks

**Supabase JS Client:**
- Risk: Beta versioning; occasional breaking changes in query API
- Impact: Query methods may fail after client updates; type definitions may be inaccurate
- Migration plan: Pin supabase version; test updates in staging before production; maintain compatibility layer

---

## Missing Critical Features

**No Idempotency Keys for Agent Actions:**
- Problem: Approving same action twice can create duplicate executions
- Blocks: Reliable agent action execution; retry logic without duplication
- Fix: Add idempotency_key column to agent_actions; check key before executing; implement deterministic execution

**No Rollback Data Validation:**
- Problem: Rollback data stored but never validated; may be stale or incomplete
- Blocks: Safe rollback functionality; multi-step transaction support
- Fix: Implement rollback data schema validation; add checksums; test rollback paths

**No API Versioning:**
- Problem: Version hardcoded as "0.2.0" in health endpoint; no way to track breaking changes
- Blocks: Multiple client versions; safe API deprecation
- Fix: Add version header to all responses; implement semantic versioning; deprecation warnings

**No Health Check for Dependencies:**
- Problem: No way to know if Supabase, R2, browser, LLM providers are available
- Blocks: Graceful degradation; operational visibility
- Fix: Implement dependency health checks; add timeout limits; expose status endpoint

**No Observability for Long-Running Operations:**
- Problem: Background tasks (crawls, design captures) have no progress reporting
- Blocks: User visibility; debugging stuck operations
- Fix: Implement progress tracking; expose operation status endpoint; add cancellation support

**No Circuit Breaker for Failing OEMs:**
- Problem: If OEM site is down, cron job spends time on all requests timing out
- Blocks: Efficient crawl scheduling; fast failure recovery
- Fix: Implement circuit breaker pattern; track OEM health; skip unhealthy OEMs temporarily

---

## Test Coverage Gaps

**Missing Integration Tests for Page Extraction:**
- What's not tested: End-to-end extraction for all OEM page types
- Files: `src/extract/engine.ts`, `src/extract/orchestrator.ts`
- Risk: Silent extraction failures; data loss for new OEM sites
- Priority: HIGH - extraction is critical path

**Missing Browser Rendering Tests:**
- What's not tested: Lightpanda vs Cloudflare Browser fallback; network capture reliability
- Files: `src/orchestrator.ts:1545-1650`, `src/routes/cdp.ts`
- Risk: Rendering failures go undetected; fallback may not work correctly
- Priority: HIGH - affects all crawl reliability

**Missing CDP Protocol Tests:**
- What's not tested: All CDP commands; error handling; WebSocket reconnection
- Files: `src/routes/cdp.ts`
- Risk: Protocol violations; clients unable to debug issues
- Priority: MEDIUM - affects debugging workflows

**Missing Database Transaction Tests:**
- What's not tested: Concurrent upserts; constraint violations; rollback scenarios
- Files: `src/orchestrator.ts` (upsert calls), `src/routes/agents.ts` (action execution)
- Risk: Data inconsistency; lost updates
- Priority: HIGH - affects data integrity

**Missing Agent Action State Machine Tests:**
- What's not tested: Concurrent approvals; status transitions; stuck states
- Files: `src/routes/agents.ts`, `src/workflows/agent-spawner.ts`
- Risk: Duplicate execution; lost actions
- Priority: HIGH - affects automation reliability

**Missing OEM Onboarding Workflow Tests:**
- What's not tested: End-to-end onboarding; discovery accuracy; page classification
- Files: `src/routes/onboarding.ts`
- Risk: Onboarding fails silently for new OEM structure; incomplete data
- Priority: MEDIUM - affects new OEM setup

**Test Infrastructure Incomplete:**
- Current state: 648 test files but only ~1160 lines for critical path (gateway tests)
- Gap: Most test files are shell/empty; missing mocks for Supabase, R2, browser
- Recommendations: Establish test fixtures; add mock factories; implement test data builders

---

## Summary of Highest-Risk Areas

| Area | Risk Level | Impact | Effort to Fix |
|------|-----------|--------|---------------|
| Agent action execution not implemented | HIGH | Autonomous agents don't work | MEDIUM |
| No idempotency for agent actions | HIGH | Duplicate execution possible | MEDIUM |
| Specs display bug (fixed Mar 2026) | ✅ RESOLVED | Dashboard now shows data correctly | — |
| Extraction coverage heuristics | HIGH | Silent data loss on new OEM formats | HIGH |
| Agent stuck in running state | MEDIUM | Manual recovery required | LOW |
| No rollback implementation | MEDIUM | Cannot revert failed actions | HIGH |
| Type safety via `as any` casts | MEDIUM | Runtime errors possible | MEDIUM |
| Missing integration tests | HIGH | Regressions go undetected | HIGH |
| No circuit breaker for OEMs | MEDIUM | Slow crawl performance when OEM down | MEDIUM |
| Large monolithic modules | MEDIUM | Hard to test and maintain | HIGH |

---

*Concerns audit: 2026-03-21*
