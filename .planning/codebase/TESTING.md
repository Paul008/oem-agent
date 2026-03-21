# Testing Patterns

**Analysis Date:** 2026-03-21

## Test Framework

**Runner:**
- `vitest` v2.1.0
- Config: `vitest.config.ts`
- Environment: `node` (no DOM/browser environment)

**Assertion Library:**
- `vitest` built-in `expect` (compatible with Jest API)

**Run Commands:**
```bash
npm test              # Run all tests matching **/*.test.ts
npm run test:skill    # Run tests with verbose reporter output
```

**Coverage:**
```bash
npm test -- --coverage  # Generate coverage report (v8 provider)
```

**Configuration** (`vitest.config.ts`):
- Global API enabled: `globals: true` (no need to import `describe`, `it`, `expect`)
- Test files: `src/**/*.test.ts`
- Excluded: `src/client/**` (client-side tests not run in Node environment)
- Coverage: HTML + text reporting, excludes client code and test files

## Test File Organization

**Location:**
- **Co-located with source:** Test files sit alongside implementation in same directory
- Pattern: `feature.ts` paired with `feature.test.ts`

**Naming:**
- `.test.ts` suffix: `jwt.test.ts`, `middleware.test.ts`, `logging.test.ts`, `process.test.ts`
- One test file per source file (minimal exceptions)

**Structure:**
```
src/
├── auth/
│   ├── jwt.ts
│   ├── jwt.test.ts
│   ├── middleware.ts
│   ├── middleware.test.ts
│   └── index.ts
├── gateway/
│   ├── process.ts
│   ├── process.test.ts
│   └── ...
└── logging.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('functionName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do X when Y', () => {
    // Arrange
    const input = createTestInput();

    // Act
    const result = myFunction(input);

    // Assert
    expect(result).toBe(expected);
  });

  it('handles error case Z', async () => {
    // Test error handling
  });
});
```

**Patterns:**
- **Setup:** `beforeEach()` clears mocks before each test
- **Test naming:** Descriptive names starting with "should" or "returns": `'returns gateway process when running'`, `'calls jwtVerify with correct parameters'`
- **Async support:** `async` keyword in test function for `await` operations
- **Error testing:** Use `expect().rejects.toThrow()` for promises

**Examples from codebase:**

**Auth JWT tests** (`src/auth/jwt.test.ts`):
```typescript
describe('verifyAccessJWT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls jwtVerify with correct parameters', async () => {
    const { jwtVerify, createRemoteJWKSet } = await import('jose');
    const mockPayload = { /* ... */ };

    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256' },
    } as never);

    const result = await verifyAccessJWT('test.jwt.token', 'team.cloudflareaccess.com', 'aud');

    expect(createRemoteJWKSet).toHaveBeenCalledWith(
      new URL('https://team.cloudflareaccess.com/cdn-cgi/access/certs'),
    );
    expect(jwtVerify).toHaveBeenCalledWith('test.jwt.token', 'mock-jwks', {
      issuer: 'https://team.cloudflareaccess.com',
      audience: 'aud',
    });
    expect(result.email).toBe('test@example.com');
  });

  it('throws error when jwtVerify fails', async () => {
    const { jwtVerify } = await import('jose');
    vi.mocked(jwtVerify).mockRejectedValue(new Error('Invalid signature'));

    await expect(
      verifyAccessJWT('invalid.jwt.token', 'team.cloudflareaccess.com', 'aud'),
    ).rejects.toThrow('Invalid signature');
  });
});
```

**Middleware tests** (`src/auth/middleware.test.ts`):
- Test all code paths (dev mode, E2E mode, missing JWT, config errors, successful auth)
- Mock Hono context objects: `c.req.header()`, `c.env`, `c.json()`, `c.html()`, `c.set()`
- Use helper functions to construct mock contexts: `createFullMockContext()`

## Mocking

**Framework:** `vitest` (vi module provides mocking)

**Patterns:**

**Module mocking:**
```typescript
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: vi.fn(),
}));
```

**Dynamic imports with mocks:**
```typescript
const { jwtVerify, createRemoteJWKSet } = await import('jose');
vi.mocked(jwtVerify).mockResolvedValue(/* ... */);
```

**Spy mocking:**
```typescript
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
```

**Function mocks:**
```typescript
const mockFn = vi.fn();
const mockFnWithReturn = vi.fn().mockReturnValue(new Response());
const mockFnWithResolve = vi.fn().mockResolvedValue({ data: [] });
```

**Clearing mocks:**
```typescript
beforeEach(() => {
  vi.clearAllMocks();  // Clear all mocks between tests
  vi.resetModules();   // Reset module cache for fresh imports
});
```

**What to Mock:**
- External dependencies: `jose`, `cheerio`, `supabase-js`
- HTTP clients and network calls
- Database queries
- File system operations
- Browser/DOM APIs (when testing server code)

**What NOT to Mock:**
- Pure functions: `redactSensitiveParams()`, utility functions
- Small utility modules that are already tested
- Internal helper functions — test through public API instead

**Mocking Patterns from tests:**

**Environment setup helper** (from `src/test-utils.ts`):
```typescript
export function createMockEnv(overrides: Partial<MoltbotEnv> = {}): MoltbotEnv {
  return {
    Sandbox: {} as any,
    ASSETS: {} as any,
    MOLTBOT_BUCKET: {} as any,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    GROQ_API_KEY: 'test-groq-key',
    TOGETHER_API_KEY: 'test-together-key',
    ...overrides,
  };
}
```

**Context/request mocking** (from `src/auth/middleware.test.ts`):
```typescript
function createFullMockContext(options: {
  env?: Partial<MoltbotEnv>;
  jwtHeader?: string;
  cookies?: string;
}): { c: Context<AppEnv>; jsonMock: ReturnType<typeof vi.fn>; /* ... */ } {
  const headers = new Headers();
  if (options.jwtHeader) {
    headers.set('CF-Access-JWT-Assertion', options.jwtHeader);
  }

  const jsonMock = vi.fn().mockReturnValue(new Response());

  const c = {
    req: { header: (name: string) => headers.get(name), raw: { headers } },
    env: createMockEnv(options.env),
    json: jsonMock,
    // ...
  } as unknown as Context<AppEnv>;

  return { c, jsonMock, /* ... */ };
}
```

## Fixtures and Factories

**Test Data:**
Test data created inline or via factory functions. Common patterns:

**Mock payloads:**
```typescript
const mockPayload = {
  email: 'test@example.com',
  aud: ['test-aud'],
  iss: 'https://myteam.cloudflareaccess.com',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  sub: 'user-id',
  type: 'app',
};
```

**Factory functions:**
```typescript
function createFullMockProcess(overrides: Partial<Process> = {}): Process {
  return {
    id: 'test-id',
    command: 'openclaw gateway',
    status: 'running',
    startTime: new Date(),
    exitCode: undefined,
    getLogs: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
    ...overrides,
  } as Process;
}
```

**Location:**
- Small fixtures: Inline in test file
- Reusable factories: `src/test-utils.ts` (mock env, mock sandbox, mock process)
- No separate fixtures directory

## Coverage

**Requirements:** No enforcement (no coverage thresholds configured)

**View Coverage:**
```bash
npm test -- --coverage
```

**Output formats:** `text` (console) and `html` (in `coverage/` directory)

**Current coverage:**
- Test files exist for critical paths: auth (JWT, middleware), gateway (process management), logging (sensitive param redaction)
- No coverage gaps identified in security-critical code
- Coverage excludes: `src/client/**` (frontend), `**/*.test.ts` (test files themselves)

## Test Types

**Unit Tests:**
- **Scope:** Individual functions and modules
- **Approach:** Mocking dependencies, testing pure logic paths
- **Examples:**
  - `jwt.test.ts` — Testing JWT verification with mocked `jose` library
  - `logging.test.ts` — Testing `redactSensitiveParams()` with URL inputs
  - `process.test.ts` — Testing process finding logic with mocked sandbox

**Integration Tests:**
- **Scope:** Multiple modules working together
- **Approach:** Real or semi-mocked dependencies
- **Examples:**
  - `middleware.test.ts` — Tests middleware with mocked context and JWT verification
  - Gateway process tests with mocked sandbox but real process finding logic

**E2E Tests:**
- **Framework:** Not currently implemented (would use Playwright)
- **Current:** Integration tests with mocked HTTP layer serve as semi-E2E

## Common Patterns

**Async Testing:**
```typescript
it('verifies JWT successfully', async () => {
  const { jwtVerify } = await import('jose');
  vi.mocked(jwtVerify).mockResolvedValue({
    payload: mockPayload,
    protectedHeader: { alg: 'RS256' },
  } as never);

  const result = await verifyAccessJWT(token, teamDomain, aud);
  expect(result.email).toBe('test@example.com');
});
```

**Error Testing:**
```typescript
it('throws error when jwtVerify fails', async () => {
  const { jwtVerify } = await import('jose');
  vi.mocked(jwtVerify).mockRejectedValue(new Error('Invalid signature'));

  await expect(
    verifyAccessJWT('invalid.token', teamDomain, aud),
  ).rejects.toThrow('Invalid signature');
});
```

**Multiple test cases same function:**
```typescript
describe('extractJWT', () => {
  it('extracts JWT from CF-Access-JWT-Assertion header', () => {
    const jwt = 'header.payload.signature';
    const c = createMockContext({ jwtHeader: jwt });
    expect(extractJWT(c)).toBe(jwt);
  });

  it('extracts JWT from CF_Authorization cookie', () => {
    const jwt = 'cookie.payload.signature';
    const c = createMockContext({ cookies: `CF_Authorization=${jwt}` });
    expect(extractJWT(c)).toBe(jwt);
  });

  it('prefers header over cookie', () => {
    const headerJwt = 'header.jwt.token';
    const cookieJwt = 'cookie.jwt.token';
    const c = createMockContext({ jwtHeader: headerJwt, cookies: `CF_Authorization=${cookieJwt}` });
    expect(extractJWT(c)).toBe(headerJwt);
  });
});
```

**Testing environment modes:**
```typescript
describe('middleware behavior by env', () => {
  it('skips auth and sets dev user when DEV_MODE is true', async () => {
    const { c, setMock } = createFullMockContext({ env: { DEV_MODE: 'true' } });
    const middleware = createAccessMiddleware({ type: 'json' });
    const next = vi.fn();

    await middleware(c, next);

    expect(next).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith('accessUser', {
      email: 'dev@localhost',
      name: 'Dev User',
    });
  });
});
```

---

*Testing analysis: 2026-03-21*
