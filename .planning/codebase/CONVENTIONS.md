# Coding Conventions

**Analysis Date:** 2026-03-21

## Naming Patterns

**Files:**
- `kebab-case` for all filenames: `extract-engine.ts`, `page-capturer.ts`, `change-detector.ts`, `test-utils.ts`
- Test files: `*.test.ts` suffix (e.g., `jwt.test.ts`, `middleware.test.ts`, `logging.test.ts`)
- Index files: `index.ts` for module exports

**Functions:**
- `camelCase` for function names: `verifyAccessJWT()`, `extractJsonLd()`, `createAccessMiddleware()`, `isDevMode()`
- Private class methods: `camelCase` with no underscore prefix: `private mapper()` not `private _mapper()`
- Helper functions: descriptive names matching action: `extractJWT()`, `findExistingMoltbotProcess()`

**Variables:**
- `camelCase` for all variables and parameters: `teamDomain`, `expectedAud`, `sourcePageId`, `htmlHash`
- Constants: `UPPER_SNAKE_CASE`: `CRAWL_TYPE_TO_PAGE_TYPES` (static readonly), `sensitivePatterns`
- Mock objects in tests: `camelCase`: `mockPayload`, `mockEnv`, `containerFetchMock`

**Types:**
- `PascalCase` for interfaces and types: `MoltbotEnv`, `AccessUser`, `JWTPayload`, `ExtractedProduct`, `CrawlResult`
- Type union names: `PascalCase`: `BuiltInOemId`, `OemId`, `BodyType`, `FuelType`, `EntityType`
- Generic parameters: `PascalCase`: `T`, `E extends Error`

**Classes:**
- `PascalCase`: `OemAgentOrchestrator`, `ExtractionEngine`, `CrawlScheduler`, `ChangeDetector`, `SlackNotifier`

## Code Style

**Formatting:**
- No automatic formatter detected (no `.prettierrc` or `.eslintrc.json`)
- **Inferred style from codebase:**
  - 2-space indentation (TypeScript standard)
  - Semicolons required at end of statements
  - Single quotes for strings in most files
  - Trailing commas in multi-line objects/arrays
  - Line breaks before opening braces for functions and classes

**Linting:**
- No ESLint or Prettier configured in project
- **TypeScript strict mode enabled**: `strict: true` in `tsconfig.json`
- Required type annotations for function parameters and return values
- No implicit `any` types allowed
- Type narrowing and exhaustiveness checks enforced

## Import Organization

**Order:**
1. Type imports from external libraries: `import type { Context, Next } from 'hono'`
2. Default imports from external libraries: `import * as cheerio from 'cheerio'`
3. Named imports from external libraries: `import { jwtVerify, createRemoteJWKSet } from 'jose'`
4. Type imports from local modules: `import type { MoltbotEnv, AppEnv } from '../types'`
5. Named imports from local modules: `import { verifyAccessJWT } from './jwt'`
6. Re-exports via barrel files

**Path Aliases:**
Used consistently throughout codebase (from `tsconfig.json`):
- `@lib/*`: Points to `./lib/*`
- `@shared/*`: Points to `./lib/shared/*`
- `@extractors/*`: Points to `./lib/extractors/*`
- `@ai/*`: Points to `./lib/ai/*`
- `@skills/*`: Points to `./skills/*`

Example: `import { verifyAccessJWT } from './jwt'` (relative path in same directory)

## Error Handling

**Patterns:**
- Explicit error catching with type narrowing: `catch (err) { ... if (err instanceof Error) { ... } }`
- Error logging with context: `console.error('Access JWT verification failed:', err)`
- Structured error responses with both `error` and `details` fields:
  ```typescript
  c.json({
    error: 'Unauthorized',
    details: err instanceof Error ? err.message : 'JWT verification failed'
  }, 401)
  ```
- Try-catch blocks in async functions: `try { ... } catch (e) { ... }`
- Silent error handling in JSON-LD parsing: `catch (e) { /* Invalid JSON-LD, skip */ }`
- Never suppress errors silently — always log or handle meaningfully
- Environment configuration errors return 500 with helpful hints:
  ```typescript
  c.json({
    error: 'Cloudflare Access not configured',
    hint: 'Set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD environment variables'
  }, 500)
  ```

**Validation:**
- Environment validation at middleware level: `if (!teamDomain || !expectedAud)`
- Type guards for runtime validation: `if (!(err instanceof Error))`
- Optional chaining and nullish coalescing: `value ?? defaultValue`

## Logging

**Framework:** `console` (native, no external library)

**Patterns:**
- **Error logging:** `console.error('message', error)` with descriptive context
- **Location:** Middleware and error handlers primarily (see `src/auth/middleware.ts` line 125)
- **Sensitive data redaction:** URL query params redacted before logging via `redactSensitiveParams()`
- **Security-first approach:** Never log token values, JWT payloads, or credentials
- **Example:** `console.error('Access JWT verification failed:', err)` — logs error type but not token details

**Sensitive Parameter Redaction:**
Implemented in `src/utils/logging.ts` via `redactSensitiveParams(url: URL)`:
- Redacts params containing: `secret`, `token`, `key`, `password`, `auth`, `credential` (case-insensitive)
- Replaces values with `[REDACTED]`
- Preserves non-sensitive params
- Used in gateway request logging

## Comments

**When to Comment:**
- **JSDoc for exported functions:** Every public function in `src/auth/jwt.ts` and `src/auth/middleware.ts` has JSDoc
- **Complex logic:** Comments explain non-obvious algorithms or business logic
- **Config sections:** Section headers with `// ===========` separators (see `src/orchestrator.ts`, `src/extract/engine.ts`)
- **Error cases:** Explain why errors are silently caught or handled differently

**JSDoc/TSDoc:**
- Used for all exported functions: `@param`, `@returns`, `@throws`
- Example from `src/auth/jwt.ts`:
  ```typescript
  /**
   * Verify a Cloudflare Access JWT token using the jose library.
   * @param token - The JWT token string
   * @param teamDomain - The Cloudflare Access team domain
   * @param expectedAud - The expected audience
   * @returns The decoded JWT payload if valid
   * @throws Error if the token is invalid, expired, or doesn't match expected values
   */
  ```
- Include link to documentation when implementing standards: `https://developers.cloudflare.com/...`
- Section dividers for large files: `// ============================================================================`

## Function Design

**Size:**
- Small focused functions: Most 15-50 lines of logic
- Single responsibility: Each function does one thing
- Example: `extractJWT()` in `middleware.ts` — 8 lines, single purpose of JWT extraction

**Parameters:**
- Typed explicitly: All parameters have type annotations
- Options objects for multiple parameters: `createAccessMiddleware(options: AccessMiddlewareOptions)`
- Avoid long parameter lists: Use interface for >3 parameters
- Example: `verifyAccessJWT(token: string, teamDomain: string, expectedAud: string)`

**Return Values:**
- Explicit return types: `Promise<JWTPayload>`, `string | null`, `ExtractionResult<T>`
- Consistent return shape: All returns follow defined interfaces
- Null for missing values: `extractJWT(): string | null`
- Generic types for reusable patterns: `ExtractionResult<T>` for extraction results

## Module Design

**Exports:**
- Barrel files (`index.ts`) re-export public APIs from submodules
- Only export functions/types meant for external use
- Keep internal functions private (not exported)
- Example: `src/auth/index.ts` exports from `./jwt.ts` and `./middleware.ts`

**Barrel Files:**
- Used in `src/auth/index.ts`, `src/oem/index.ts` for module organization
- Consolidate related exports: Auth module exports JWT functions and middleware
- Don't create barrels for large modules — keep specific imports

**Directory Structure by Module:**
- `src/auth/` — Authentication and JWT handling
- `src/utils/` — Shared utilities (logging, supabase client, embeddings)
- `src/extract/` — Data extraction engine and logic
- `src/oem/` — OEM registry and type definitions
- `src/routes/` — HTTP route handlers
- `src/gateway/` — Container/sandbox process management

## Dependency Management

**Pattern:**
- Minimal external dependencies
- Critical deps: `hono` (HTTP), `jose` (JWT), `cheerio` (HTML parsing), `@supabase/supabase-js` (database)
- Test deps: `vitest`, `puppeteer`, `playwright-core`

**No circular dependencies:** Module imports follow strict hierarchy (test files import from source, not vice versa)

**Environment Variables:**
- Typed in `MoltbotEnv` interface in `src/types.ts`
- All env vars are optional except `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `TOGETHER_API_KEY`
- Validation happens at route/middleware level, not in module constructors

---

*Convention analysis: 2026-03-21*
