import { afterEach, describe, expect, it, vi } from 'vitest';

import { publicationKeys } from '../design/model-page-publication/storage';
import type { PublicationCandidateSummary, PublicationState } from '../design/model-page-publication/types';
import oemAgentApp, { isAllowedPublicationWebhookUrl } from './oem-agent';

interface RouteStoredObject {
  body: string;
  etag: string;
  httpMetadata?: R2HTTPMetadata;
}

class RouteMemoryR2Bucket {
  readonly objects = new Map<string, RouteStoredObject>();
  readonly reads: string[] = [];
  private etagSequence = 0;

  seed(key: string, value: unknown, contentType = 'application/json'): void {
    this.objects.set(key, {
      body: typeof value === 'string' ? value : JSON.stringify(value),
      etag: `seed-etag-${++this.etagSequence}`,
      httpMetadata: { contentType },
    });
  }

  async get(key: string): Promise<any> {
    this.reads.push(key);
    const stored = this.objects.get(key);
    if (!stored) return null;
    return {
      key,
      etag: stored.etag,
      httpEtag: `"${stored.etag}"`,
      httpMetadata: stored.httpMetadata,
      json: async <T>() => JSON.parse(stored.body) as T,
      text: async () => stored.body,
    };
  }

  async put(key: string, value: unknown, options?: R2PutOptions): Promise<any> {
    const current = this.objects.get(key);
    const onlyIf = options?.onlyIf;
    if (onlyIf instanceof Headers) {
      if (onlyIf.get('if-none-match') === '*' && current) return null;
      if (onlyIf.get('if-match') && onlyIf.get('if-match') !== current?.etag) return null;
    }
    else if (onlyIf?.etagMatches && onlyIf.etagMatches !== current?.etag) {
      return null;
    }
    const body = typeof value === 'string' ? value : String(value);
    const stored = {
      body,
      etag: `put-etag-${++this.etagSequence}`,
      httpMetadata: options?.httpMetadata instanceof Headers ? undefined : options?.httpMetadata,
    };
    this.objects.set(key, stored);
    return { key, etag: stored.etag };
  }

  async list(options?: R2ListOptions): Promise<any> {
    const prefix = options?.prefix || '';
    return {
      objects: [...this.objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, etag: value.etag })),
      delimitedPrefixes: [],
      truncated: false,
    };
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
}

const readyValidation = {
  publishable: true,
  blocking: [],
  warnings: [],
  viewports: [],
  digest: '2976d29373b8c5ff8a0057beedcd49f9d2917bd45d2fa76fefdde544275ca74b',
};

const failedValidation = {
  publishable: false,
  blocking: [{ code: 'visual-mismatch', message: 'Candidate mismatch is blocking' }],
  warnings: [],
  viewports: [],
  digest: '62725a008c945bfeed32893595e8bfbb3482c11a0e7d6dfd61986ebbd8a31226',
};

const publicationRouteEnv = {
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
};

async function seedPublicationRevision(
  bucket: RouteMemoryR2Bucket,
  pageId: string,
  revision: number,
  draftVersion: number,
  body = `<main data-oem-publication-body="true">Revision ${revision}</main>`,
): Promise<void> {
  const keys = publicationKeys(pageId, revision);
  const bodySha256 = await sha256Hex(body);
  bucket.seed(keys.body, body, 'text/html; charset=utf-8');
  bucket.seed(keys.validation, readyValidation);
  bucket.seed(keys.manifest, {
    pageId,
    revision,
    draftVersion,
    format: 'composed-html-body',
    bodyPath: keys.body,
    publishedAt: null,
    publishedBy: null,
    platformRegions: ['hero', 'variants', 'inventory'],
    etag: `"sha256-${bodySha256}"`,
    bodyBytes: new TextEncoder().encode(body).byteLength,
    bodySha256,
    regionRenderers: [{ regionId: 'features', renderer: 'clone', interactionKind: 'none' }],
  });
}

function seedPublicationState(
  bucket: RouteMemoryR2Bucket,
  pageId: string,
  input: {
    publishedRevision: number | null;
    history?: number[];
    nextRevision?: number;
    candidate?: PublicationCandidateSummary | null;
    publishedAt?: string | null;
  },
): void {
  const value: PublicationState = {
    schema_version: 1,
    next_revision: input.nextRevision || Math.max(1, ...(input.history || []), input.candidate?.revision || 0) + 1,
    published_revision: input.publishedRevision,
    published_at: input.publishedAt ?? (input.publishedRevision ? '2026-08-04T01:02:03.000Z' : null),
    published_by: input.publishedRevision ? 'publisher@test' : null,
    candidate: input.candidate || null,
    history: input.history || (input.publishedRevision ? [input.publishedRevision] : []),
  };
  bucket.seed(publicationKeys(pageId).state, value);
}

function jsonObject(value: unknown) {
  return {
    async json() {
      return JSON.parse(JSON.stringify(value));
    },
  };
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function scopedHtml(oemId: string, modelSlug: string, innerHtml: string): string {
  return `<div class="oem-production-scope" data-oem-id="${oemId}" data-model-slug="${modelSlug}">${innerHtml}</div>`;
}

function throwingBucket() {
  return {
    get() {
      throw new Error('bucket.get should not be called for protected model page writes');
    },
    head() {
      throw new Error('bucket.head should not be called for protected model page writes');
    },
    put() {
      throw new Error('bucket.put should not be called for protected model page writes');
    },
    delete() {
      throw new Error('bucket.delete should not be called for protected model page writes');
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('oem-agent production HTML route', () => {
  it('serves edited clone HTML as the production artifact even when sections mode is active', async () => {
    const latestKey = 'pages/definitions/mitsubishi-au/outlander/latest.json';
    const pageData = {
      active_mode: 'sections',
      version: 12,
      content: {
        rendered: '<main>Legacy Clone</main>',
        sections: [{ type: 'variant-color-explorer' }],
        modes: {
          clone: {
            rendered: '<main><img src="/media/pages/assets/mitsubishi-au/outlander/original.jpg">Original Clone</main>',
            edited_rendered: '<main><img src="/media/pages/assets/mitsubishi-au/outlander/edited.jpg">Edited Clone</main>',
          },
          sections: {
            items: [{ type: 'variant-color-explorer', heading: 'Structured renderer' }],
          },
        },
      },
    };
    const bucket = {
      async get(key: string) {
        return key === latestKey ? jsonObject(pageData) : null;
      },
    };

    const response = await oemAgentApp.request('/pages/mitsubishi-au-outlander/production-html', {}, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('X-OEM-Page-Mode')).toBe('clone');
    expect(response.headers.get('X-OEM-Page-Version')).toBe('12');

    const html = await response.text();
    const expectedSha = await sha256Hex(html);

    expect(html).toContain('Edited Clone');
    expect(html).not.toContain('Original Clone');
    expect(html).not.toContain('Structured renderer');
    expect(html).toContain('http://localhost/media/pages/assets/mitsubishi-au/outlander/edited.jpg');
    expect(response.headers.get('X-OEM-Content-Bytes')).toBe(String(new TextEncoder().encode(html).byteLength));
    expect(response.headers.get('X-OEM-Content-SHA256')).toBe(expectedSha);
    expect(response.headers.get('ETag')).toBe(`"sha256-${expectedSha}"`);
  });

  it('falls back to original clone HTML when no edited clone exists', async () => {
    const latestKey = 'pages/definitions/ford-au/mustang/latest.json';
    const pageData = {
      active_mode: 'clone',
      version: 3,
      content: {
        modes: {
          clone: {
            rendered: '<main>Original Mustang Clone</main>',
          },
        },
      },
    };
    const bucket = {
      async get(key: string) {
        return key === latestKey ? jsonObject(pageData) : null;
      },
    };

    const response = await oemAgentApp.request('/pages/ford-au-mustang/production-html', {}, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(scopedHtml('ford-au', 'mustang', '<main>Original Mustang Clone</main>'));
  });

  it('inlines and scopes captured stylesheets stored outside the clone HTML', async () => {
    const latestKey = 'pages/definitions/nissan-au/ariya/latest.json';
    const stylesheetUrl = 'https://cdn.nissan.test/ariya.css';
    const pageData = {
      active_mode: 'clone',
      version: 14,
      content: {
        modes: {
          clone: {
            rendered: '<main class="ariya-body">Styled ARIYA</main>',
            stylesheet_urls: [stylesheetUrl],
          },
        },
      },
    };
    const bucket = {
      async get(key: string) {
        return key === latestKey ? jsonObject(pageData) : null;
      },
    };
    const fetchMock = vi.fn(async () => new Response('.ariya-body { color: red; background-image: url("./ariya-bg.png"); }', {
      headers: { 'Content-Type': 'text/css' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await oemAgentApp.request('/pages/nissan-au-ariya/production-html', {}, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(fetchMock).toHaveBeenCalledWith(stylesheetUrl);
    expect(html).toContain(`data-oem-scoped-stylesheet-href="${stylesheetUrl}"`);
    expect(html).toContain('.oem-production-scope[data-oem-id="nissan-au"][data-model-slug="ariya"] .ariya-body');
    expect(html).toContain('https://cdn.nissan.test/ariya-bg.png');
  });

  it('reuses the derived production artifact while the page object fingerprint is unchanged', async () => {
    const latestKey = 'pages/definitions/nissan-au/ariya/latest.json';
    const stylesheetUrl = 'https://cdn.nissan.test/ariya.css';
    const pageData = {
      active_mode: 'clone',
      version: 14,
      content: {
        modes: {
          clone: {
            rendered: '<main class="ariya-body">Cached ARIYA</main>',
            stylesheet_urls: [stylesheetUrl],
          },
        },
      },
    };
    const bucket = {
      async get(key: string) {
        return key === latestKey
          ? { ...jsonObject(pageData), httpEtag: '"ariya-page-v14"' }
          : null;
      },
    };
    const entries = new Map<string, Response>();
    const cache = {
      async match(request: Request) {
        return entries.get(request.url)?.clone();
      },
      async put(request: Request, response: Response) {
        entries.set(request.url, response.clone());
      },
    };
    vi.stubGlobal('caches', { default: cache });
    const fetchMock = vi.fn(async () => new Response('.ariya-body { color: red; }', {
      headers: { 'Content-Type': 'text/css' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never;
    const executionCtx = { waitUntil: (promise: Promise<unknown>) => promise } as never;

    const first = await oemAgentApp.request(
      '/pages/nissan-au-ariya/production-html',
      {},
      env,
      executionCtx,
    );
    await first.text();
    const second = await oemAgentApp.request(
      '/pages/nissan-au-ariya/production-html',
      {},
      env,
      executionCtx,
    );

    expect(second.status).toBe(200);
    expect(second.headers.get('X-OEM-Artifact-Cache')).toBe('HIT');
    expect(await second.text()).toContain('Cached ARIYA');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders normally when the edge artifact cache lookup is unavailable', async () => {
    const latestKey = 'pages/definitions/nissan-au/ariya/latest.json';
    const stylesheetUrl = 'https://cdn.nissan.test/ariya.css';
    const pageData = {
      active_mode: 'clone',
      version: 14,
      content: {
        modes: {
          clone: {
            rendered: '<main class="ariya-body">Resilient ARIYA</main>',
            stylesheet_urls: [stylesheetUrl],
          },
        },
      },
    };
    const bucket = {
      async get(key: string) {
        return key === latestKey
          ? { ...jsonObject(pageData), httpEtag: '"ariya-page-v14"' }
          : null;
      },
    };
    vi.stubGlobal('caches', {
      default: {
        async match() {
          throw new Error('cache unavailable');
        },
        async put() {},
      },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('.ariya-body { color: red; }', {
      headers: { 'Content-Type': 'text/css' },
    })));

    const response = await oemAgentApp.request('/pages/nissan-au-ariya/production-html', {}, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('X-OEM-Artifact-Cache')).toBe('SKIP');
    expect(await response.text()).toContain('Resilient ARIYA');
  });

  it('serves a body-only artifact without duplicating the captured hero', async () => {
    const latestKey = 'pages/definitions/nissan-au/ariya/latest.json';
    const pageData = {
      active_mode: 'clone',
      version: 14,
      content: {
        modes: {
          clone: {
            rendered: [
              '<div data-compid="simple-hero-comp"><h1>All-electric Nissan ARIYA</h1></div>',
              '<section data-compid="grade-walk-comp" id="grades"><h2>Choose your ARIYA</h2></section>',
              '<section data-compid="story-section-comp"><div class="full-viewport-height">Story</div></section>',
              '<section data-compid="faq-level1-comp" data-compprops="{&quot;faqItems&quot;:[{&quot;faqQuestion&quot;:&quot;FAQ question&quot;,&quot;faqAnswer&quot;:&quot;&lt;p&gt;FAQ answer&lt;/p&gt;&quot;}]}">',
              '<div class="question-container"><div class="question"><h3 aria-expanded="false" role="button" tabindex="0">FAQ question</h3><img src="" alt="expand-icon"></div><p class="answer" id="answer-0"></p></div>',
              '</section>',
              '<section id="features"><h2>Explore ARIYA</h2></section>',
            ].join(''),
            stylesheet_urls: ['https://cdn.nissan.test/ariya.css'],
          },
        },
      },
    };
    const bucket = {
      async get(key: string) {
        return key === latestKey ? jsonObject(pageData) : null;
      },
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await oemAgentApp.request('/pages/nissan-au-ariya/production-body-html', {}, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('X-OEM-Body-Only')).toBe('true');
    const html = await response.text();
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<link rel="stylesheet" href="https://cdn.nissan.test/ariya.css">');
    expect(html).toContain('oem-production-body-height');
    expect(html).toContain('data-compid="story-section-comp"');
    expect(html).toContain('height:clamp(420px,56.25vw,720px)!important');
    expect(html).not.toContain('max-width:1440px');
    expect(html).toContain('data-oem-faq-trigger="true"');
    expect(html).toContain('<p>FAQ answer</p>');
    expect(html).toContain('data-oem-production-interactions="true"');
    expect(html).not.toContain('src=""');
    expect(html).toContain('Explore ARIYA');
    expect(html).not.toContain('All-electric Nissan ARIYA');
    expect(html).not.toContain('Choose your ARIYA');
    expect(html).not.toContain('simple-hero-comp');
    expect(html).not.toContain('grade-walk-comp');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves an explicitly selected published revision as an immutable body artifact', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: 21,
      history: [21],
      nextRevision: 22,
    });

    const response = await oemAgentApp.request('/pages/nissan-au-ariya/production-body-html?revision=21', {}, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: throwingBucket(),
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('X-OEM-Published-Revision')).toBe('21');
    expect(response.headers.get('ETag')).toMatch(/^"sha256-/);
    expect(await response.text()).toContain('Revision 21');
  });

  it('serves the current published alias without marking the unversioned URL immutable', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: 21,
      history: [21],
      nextRevision: 22,
    });

    const response = await oemAgentApp.request('/pages/nissan-au-ariya/production-body-html', {}, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: throwingBucket(),
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: ' nissan-au-ariya ',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=86400');
    expect(response.headers.get('Cache-Control')).not.toContain('immutable');
    expect(response.headers.get('X-OEM-Published-Revision')).toBe('21');
  });

  it('revalidates the current body alias with normal, weak, and listed If-None-Match values', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: 21,
      history: [21],
      nextRevision: 22,
    });
    const env = {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: throwingBucket(),
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never;
    const path = '/pages/nissan-au-ariya/production-body-html';

    const first = await oemAgentApp.request(path, {}, env);
    const etag = first.headers.get('ETag');
    const conditional = await oemAgentApp.request(path, {
      headers: { 'If-None-Match': `"stale", W/${etag}` },
    }, env);
    const head = await oemAgentApp.request(path, {
      method: 'HEAD',
      headers: { 'If-None-Match': etag! },
    }, env);

    expect(first.status).toBe(200);
    expect(etag).toMatch(/^"sha256-/);
    expect(conditional.status).toBe(304);
    expect(conditional.headers.get('ETag')).toBe(etag);
    expect(conditional.headers.get('Cache-Control')).toBe(first.headers.get('Cache-Control'));
    expect(conditional.headers.get('X-OEM-Published-Revision')).toBe('21');
    expect(await conditional.text()).toBe('');
    expect(head.status).toBe(conditional.status);
    expect([...head.headers.entries()]).toEqual([...conditional.headers.entries()]);
    expect(await head.text()).toBe('');
  });

  it('mirrors the selected revision GET status and headers on HEAD', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: 21,
      history: [21],
      nextRevision: 22,
    });
    const env = {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: throwingBucket(),
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never;

    const get = await oemAgentApp.request('/pages/nissan-au-ariya/production-body-html?revision=21', {}, env);
    const head = await oemAgentApp.request('/pages/nissan-au-ariya/production-body-html?revision=21', {
      method: 'HEAD',
    }, env);

    expect(head.status).toBe(get.status);
    expect(head.headers.get('Cache-Control')).toBe(get.headers.get('Cache-Control'));
    expect(head.headers.get('Content-Type')).toBe(get.headers.get('Content-Type'));
    expect(head.headers.get('ETag')).toBe(get.headers.get('ETag'));
    expect(head.headers.get('X-OEM-Published-Revision')).toBe('21');
    expect(await head.text()).toBe('');
  });

  it('returns the canonical composed manifest with legacy aliases and pointer publication time', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: 21,
      history: [21],
      nextRevision: 22,
      publishedAt: '2026-08-04T03:04:05.000Z',
    });

    const response = await oemAgentApp.request('/pages/nissan-au-ariya/production-manifest', {}, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: throwingBucket(),
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      pageId: 'nissan-au-ariya',
      revision: 21,
      format: 'composed-html-body',
      bodyUrl: 'http://localhost/api/v1/oem-agent/pages/nissan-au-ariya/production-body-html?revision=21',
      platformRegions: ['hero', 'variants', 'inventory'],
      publishedAt: '2026-08-04T03:04:05.000Z',
      body_html_url: 'http://localhost/api/v1/oem-agent/pages/nissan-au-ariya/production-body-html?revision=21',
      mode: 'composed',
    });
  });

  it('uses a content-correct manifest ETag and returns 304 for a matching If-None-Match list', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: 21,
      history: [21],
      nextRevision: 22,
      publishedAt: '2026-08-04T03:04:05.000Z',
    });
    const env = {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: throwingBucket(),
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never;
    const path = '/pages/nissan-au-ariya/production-manifest';

    const first = await oemAgentApp.request(path, {}, env);
    const firstEtag = first.headers.get('ETag');
    const firstBody = await first.json() as { etag: string };
    const matching = await oemAgentApp.request(path, {
      headers: { 'If-None-Match': `"stale", W/${firstEtag}` },
    }, env);

    expect(first.status).toBe(200);
    expect(firstEtag).toMatch(/^"sha256-/);
    expect(firstEtag).not.toBe(firstBody.etag);
    expect(matching.status).toBe(304);
    expect(matching.headers.get('ETag')).toBe(firstEtag);
    expect(matching.headers.get('Cache-Control')).toBe(first.headers.get('Cache-Control'));
    expect(matching.headers.get('X-OEM-Published-Revision')).toBe('21');
    expect(await matching.text()).toBe('');

    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: 21,
      history: [21],
      nextRevision: 22,
      publishedAt: '2026-08-04T04:05:06.000Z',
    });
    const changed = await oemAgentApp.request(path, {
      headers: { 'If-None-Match': firstEtag! },
    }, env);
    expect(changed.status).toBe(200);
    expect(changed.headers.get('ETag')).not.toBe(firstEtag);
  });

  it('rejects invalid or unpublished explicit revisions without exposing candidates', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 22, 25);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: 21,
      history: [21],
      nextRevision: 23,
      candidate: {
        revision: 22,
        draft_version: 25,
        status: 'ready',
        validation_digest: readyValidation.digest,
        created_at: '2026-08-04T03:04:05.000Z',
        created_by: 'editor@test',
      },
    });
    const env = {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: throwingBucket(),
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never;

    const invalid = await oemAgentApp.request('/pages/nissan-au-ariya/production-body-html?revision=latest', {}, env);
    const candidate = await oemAgentApp.request('/pages/nissan-au-ariya/production-body-html?revision=22', {}, env);

    expect(invalid.status).toBe(400);
    expect(candidate.status).toBe(404);
  });

  it('keeps allowlisted legacy clone behavior when publication state is absent', async () => {
    const latestKey = 'pages/definitions/nissan-au/ariya/latest.json';
    const pageData = {
      active_mode: 'clone',
      version: 14,
      content: { modes: { clone: { rendered: '<main>Legacy ARIYA Clone</main>' } } },
    };
    const definitionBucket = {
      async get(key: string) {
        return key === latestKey ? jsonObject(pageData) : null;
      },
    };

    const response = await oemAgentApp.request('/pages/nissan-au-ariya/production-body-html', {}, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: definitionBucket,
      OEM_PAGE_BUCKET: new RouteMemoryR2Bucket(),
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('X-OEM-Page-Mode')).toBe('clone');
    expect(await response.text()).toContain('Legacy ARIYA Clone');
  });

  it('keeps the allowlisted no-publication manifest identical to the legacy manifest', async () => {
    const latestKey = 'pages/definitions/nissan-au/ariya/latest.json';
    const pageData = {
      active_mode: 'clone',
      version: 14,
      updated_at: '2026-08-04T01:02:03.000Z',
      content: { modes: { clone: { rendered: '<main>Legacy ARIYA Clone</main>' } } },
    };
    const definitionBucket = {
      async get(key: string) {
        return key === latestKey ? jsonObject(pageData) : null;
      },
    };
    const commonEnv = {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: definitionBucket,
      DEV_MODE: 'true',
    };

    const legacy = await oemAgentApp.request('/pages/nissan-au-ariya/production-manifest', {}, commonEnv as never);
    const allowlisted = await oemAgentApp.request('/pages/nissan-au-ariya/production-manifest', {}, {
      ...commonEnv,
      OEM_PAGE_BUCKET: new RouteMemoryR2Bucket(),
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
    } as never);

    expect(allowlisted.status).toBe(legacy.status);
    expect(allowlisted.headers.get('Cache-Control')).toBe(legacy.headers.get('Cache-Control'));
    expect(await allowlisted.json()).toEqual(await legacy.json());
  });

  it('never reads publication storage for a page outside the exact allowlist', async () => {
    const latestKey = 'pages/definitions/mitsubishi-au/outlander/latest.json';
    const publicationBucket = new RouteMemoryR2Bucket();
    const response = await oemAgentApp.request('/pages/mitsubishi-au-outlander/production-body-html', {}, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: {
        async get(key: string) {
          return key === latestKey
            ? jsonObject({ version: 1, content: { modes: { clone: { rendered: '<main>Legacy Outlander</main>' } } } })
            : null;
        },
      },
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('X-OEM-Page-Mode')).toBe('clone');
    expect(publicationBucket.reads).toEqual([]);
  });

  it('returns service unavailable when an allowlisted public request has no publication bucket', async () => {
    const response = await oemAgentApp.request('/pages/nissan-au-ariya/production-body-html', {}, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: throwingBucket(),
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(503);
  });

  it('returns production HTML metadata on HEAD without downloading the body', async () => {
    const latestKey = 'pages/definitions/mitsubishi-au/outlander/latest.json';
    const pageData = {
      active_mode: 'clone',
      version: 11,
      content: {
        modes: {
          clone: {
            rendered: '<main><img src="/media/pages/assets/mitsubishi-au/outlander/head.jpg">Outlander Clone</main>',
          },
        },
      },
    };
    const bucket = {
      async get(key: string) {
        return key === latestKey ? jsonObject(pageData) : null;
      },
    };

    const response = await oemAgentApp.request('/pages/mitsubishi-au-outlander/production-html', {
      method: 'HEAD',
    }, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never);

    const expectedHtml = scopedHtml(
      'mitsubishi-au',
      'outlander',
      '<main><img src="http://localhost/media/pages/assets/mitsubishi-au/outlander/head.jpg">Outlander Clone</main>',
    );
    const expectedSha = await sha256Hex(expectedHtml);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('X-OEM-Page-Mode')).toBe('clone');
    expect(response.headers.get('X-OEM-Page-Version')).toBe('11');
    expect(response.headers.get('X-OEM-CSS-Scope')).toBe('.oem-production-scope[data-oem-id="mitsubishi-au"][data-model-slug="outlander"]');
    expect(response.headers.get('X-OEM-Content-Bytes')).toBe(String(new TextEncoder().encode(expectedHtml).byteLength));
    expect(response.headers.get('X-OEM-Content-SHA256')).toBe(expectedSha);
    expect(response.headers.get('ETag')).toBe(`"sha256-${expectedSha}"`);
    expect(await response.text()).toBe('');
  });

  it('does not silently serve structured sections when clone HTML is missing', async () => {
    const latestKey = 'pages/definitions/mitsubishi-au/outlander/latest.json';
    const pageData = {
      active_mode: 'sections',
      version: 5,
      content: {
        sections: [{ type: 'variant-color-explorer' }],
        modes: {
          sections: {
            items: [{ type: 'variant-color-explorer', heading: 'Structured renderer' }],
          },
        },
      },
    };
    const bucket = {
      async get(key: string) {
        return key === latestKey ? jsonObject(pageData) : null;
      },
    };

    const response = await oemAgentApp.request('/pages/mitsubishi-au-outlander/production-html', {}, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(409);
    const body = await response.json() as { error: string };
    expect(body.error).toContain('Production clone HTML is not available');
  });

  it('returns a production manifest for linked apps without serving the HTML body', async () => {
    const latestKey = 'pages/definitions/mitsubishi-au/outlander/latest.json';
    const pageData = {
      active_mode: 'clone',
      version: 10,
      updated_at: '2026-06-09T01:02:03.000Z',
      generated_at: '2026-06-08T01:02:03.000Z',
      content: {
        modes: {
          clone: {
            rendered: '<main><img src="/media/pages/assets/mitsubishi-au/outlander/hero.jpg">Make Your Mark.</main>',
          },
        },
      },
    };
    const bucket = {
      async get(key: string) {
        return key === latestKey ? jsonObject(pageData) : null;
      },
    };

    const response = await oemAgentApp.request('/pages/mitsubishi-au-outlander/production-manifest', {}, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('max-age=300');

    const expectedHtml = scopedHtml(
      'mitsubishi-au',
      'outlander',
      '<main><img src="http://localhost/media/pages/assets/mitsubishi-au/outlander/hero.jpg">Make Your Mark.</main>',
    );
    const expectedSha = await sha256Hex(expectedHtml);
    const body = await response.json() as Record<string, unknown>;

    expect(body).toMatchObject({
      slug: 'mitsubishi-au-outlander',
      oem_id: 'mitsubishi-au',
      model_slug: 'outlander',
      mode: 'clone',
      active_mode: 'clone',
      version: 10,
      html_url: 'http://localhost/api/v1/oem-agent/pages/mitsubishi-au-outlander/production-html',
      body_html_url: 'http://localhost/api/v1/oem-agent/pages/mitsubishi-au-outlander/production-body-html',
      html_bytes: new TextEncoder().encode(expectedHtml).byteLength,
      html_sha256: expectedSha,
      etag: `"sha256-${expectedSha}"`,
      scope: {
        selector: '.oem-production-scope[data-oem-id="mitsubishi-au"][data-model-slug="outlander"]',
        style_tags_scoped: 0,
        external_stylesheets_scoped: 0,
        external_stylesheets_blocked: 0,
        rules_scoped: 0,
        rules_skipped: 0,
      },
      updated_at: '2026-06-09T01:02:03.000Z',
      generated_at: '2026-06-08T01:02:03.000Z',
    });
    expect(JSON.stringify(body)).not.toContain('Make Your Mark.');
  });
});

describe('oem-agent model page publication admin routes', () => {
  it.each([
    ['missing allowlist', undefined, 'https://dealer.test/page-updated'],
    ['empty allowlist', '', 'https://dealer.test/page-updated'],
    ['malformed allowlist', 'not a URL', 'https://dealer.test/page-updated'],
    ['HTTP registered URL', 'https://dealer.test', 'http://dealer.test/page-updated'],
    ['credential-bearing registered URL', 'https://dealer.test', 'https://user:pass@dealer.test/page-updated'],
    ['unapproved origin', 'https://other.test', 'https://dealer.test/page-updated'],
  ])('does not send the webhook secret for %s', async (_case, allowedOrigins, webhookUrl) => {
    const publicationBucket = new RouteMemoryR2Bucket();
    const definitions = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: null,
      history: [],
      nextRevision: 22,
      candidate: {
        revision: 21,
        draft_version: 24,
        status: 'ready',
        validation_digest: readyValidation.digest,
        created_at: '2026-08-04T03:04:05.000Z',
        created_by: 'editor@test',
      },
    });
    definitions.seed('pages/definitions/nissan-au/ariya/latest.json', { version: 24 });
    definitions.seed('config/webhooks.json', [{
      id: 'dealer-a', url: webhookUrl, events: ['page.updated'], created_at: 'now',
    }]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await oemAgentApp.request('/admin/pages/nissan-au-ariya/publication/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 21, expectedDraftVersion: 24, validationDigest: readyValidation.digest }),
    }, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: definitions,
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      MODEL_PAGE_WEBHOOK_SECRET: 'must-not-leak',
      MODEL_PAGE_WEBHOOK_ALLOWED_ORIGINS: allowedOrigins,
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ propagation: 'failed', published_revision: 21 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'http://dealer.test',
    'https://user:pass@dealer.test',
    'https://dealer.test/path',
    'https://dealer.test?token=x',
    'https://dealer.test#fragment',
    'https://dealer.test,not a URL',
  ])('rejects a non-canonical webhook allowlist entry: %s', (allowedOrigins) => {
    expect(isAllowedPublicationWebhookUrl('https://dealer.test/page-updated', allowedOrigins)).toBe(false);
  });

  it('canonicalizes the default HTTPS port when matching an approved origin', () => {
    expect(isAllowedPublicationWebhookUrl(
      'https://dealer.test:443/page-updated',
      'https://dealer.test',
    )).toBe(true);
  });

  it('keeps candidate routes authenticated outside DEV_MODE', async () => {
    const response = await oemAgentApp.request('/admin/pages/nissan-au-ariya/publication/candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedDraftVersion: 24 }),
    }, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: new RouteMemoryR2Bucket(),
      OEM_PAGE_BUCKET: new RouteMemoryR2Bucket(),
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'false',
    } as never);

    expect(response.status).toBe(401);
  });

  it('allows the Nissan manual editor path and maps a stale saved draft to conflict', async () => {
    const definitions = new RouteMemoryR2Bucket();
    definitions.seed('pages/definitions/nissan-au/ariya/latest.json', { version: 25 });

    const response = await oemAgentApp.request('/admin/pages/nissan-au-ariya/publication/candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedDraftVersion: 24 }),
    }, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: definitions,
      OEM_PAGE_BUCKET: new RouteMemoryR2Bucket(),
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'draft_version_conflict' });
  });

  it('serves candidate HTML only from the authenticated admin route', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 22, 25, '<main>Candidate 22</main>');
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: 21,
      history: [21],
      nextRevision: 23,
      candidate: {
        revision: 22,
        draft_version: 25,
        status: 'ready',
        validation_digest: readyValidation.digest,
        created_at: '2026-08-04T03:04:05.000Z',
        created_by: 'editor@test',
      },
    });

    const response = await oemAgentApp.request('/admin/pages/nissan-au-ariya/publication/candidate-html?revision=22', {}, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: new RouteMemoryR2Bucket(),
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-OEM-Candidate-Revision')).toBe('22');
    expect(response.headers.get('ETag')).toMatch(/^"sha256-/);
    expect(await response.text()).toBe('<main>Candidate 22</main>');
  });

  it('publishes through the service and reports failed webhook propagation without reversing the pointer', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    const definitions = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: null,
      history: [],
      nextRevision: 22,
      candidate: {
        revision: 21,
        draft_version: 24,
        status: 'ready',
        validation_digest: readyValidation.digest,
        created_at: '2026-08-04T03:04:05.000Z',
        created_by: 'editor@test',
      },
    });
    definitions.seed('pages/definitions/nissan-au/ariya/latest.json', { version: 24 });
    definitions.seed('config/webhooks.json', [{
      id: 'dealer-a',
      url: 'https://dealer.test/page-updated',
      events: ['page.updated'],
      created_at: '2026-08-04T00:00:00.000Z',
    }]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));

    const response = await oemAgentApp.request('/admin/pages/nissan-au-ariya/publication/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        revision: 21,
        expectedDraftVersion: 24,
        validationDigest: readyValidation.digest,
      }),
    }, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: definitions,
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      MODEL_PAGE_WEBHOOK_SECRET: 'route-test-secret',
      MODEL_PAGE_WEBHOOK_ALLOWED_ORIGINS: 'https://dealer.test',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      published_revision: 21,
      propagation: 'failed',
    });
    const state = await (await publicationBucket.get(publicationKeys('nissan-au-ariya').state)).json() as PublicationState;
    expect(state.published_revision).toBe(21);
    await vi.waitFor(() => {
      const auditObjects = [...definitions.objects.entries()]
        .filter(([key]) => /^audit\/\d{4}-\d{2}-\d{2}\.jsonl$/.test(key));
      expect(auditObjects).toHaveLength(1);
      const entries = auditObjects[0][1].body.split('\n').map(line => JSON.parse(line));
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        page_id: 'nissan-au-ariya',
        draft_revision: 24,
        candidate_revision: 21,
        published_revision: 21,
        action: 'publication.publish',
      });
    });
  });

  it('sends the signed canonical model identity envelope only to a registered webhook', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    const definitions = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: null,
      history: [],
      nextRevision: 22,
      candidate: {
        revision: 21,
        draft_version: 24,
        status: 'ready',
        validation_digest: readyValidation.digest,
        created_at: '2026-08-04T03:04:05.000Z',
        created_by: 'editor@test',
      },
    });
    definitions.seed('pages/definitions/nissan-au/ariya/latest.json', { version: 24 });
    definitions.seed('config/webhooks.json', [{
      id: 'dealer-a',
      url: 'https://dealer.test/page-updated',
      events: ['page.updated'],
      created_at: '2026-08-04T00:00:00.000Z',
    }]);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response(null, { status: 204 })
    ));
    vi.stubGlobal('fetch', fetchMock);

    const response = await oemAgentApp.request('/admin/pages/nissan-au-ariya/publication/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        revision: 21,
        expectedDraftVersion: 24,
        validationDigest: readyValidation.digest,
      }),
    }, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: definitions,
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      MODEL_PAGE_WEBHOOK_SECRET: 'route-test-secret',
      MODEL_PAGE_WEBHOOK_ALLOWED_ORIGINS: 'https://dealer.test',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ propagation: 'delivered' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://dealer.test/page-updated');
    expect(init?.redirect).toBe('error');
    expect(new Headers(init?.headers).get('x-oem-model-page-webhook-secret')).toBe('route-test-secret');
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      event: 'page.updated',
      oem_code: 'nissan-au',
      model_slug: 'ariya',
      data: {
        page_id: 'nissan-au-ariya',
        published_revision: 21,
        action: 'publish',
      },
    });
  });

  it('fails webhook propagation closed without sending when the OEM secret is missing', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    const definitions = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: null,
      history: [],
      nextRevision: 22,
      candidate: {
        revision: 21,
        draft_version: 24,
        status: 'ready',
        validation_digest: readyValidation.digest,
        created_at: '2026-08-04T03:04:05.000Z',
        created_by: 'editor@test',
      },
    });
    definitions.seed('pages/definitions/nissan-au/ariya/latest.json', { version: 24 });
    definitions.seed('config/webhooks.json', [{
      id: 'dealer-a', url: 'https://dealer.test/page-updated', events: ['page.updated'], created_at: 'now',
    }]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await oemAgentApp.request('/admin/pages/nissan-au-ariya/publication/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 21, expectedDraftVersion: 24, validationDigest: readyValidation.digest }),
    }, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: definitions,
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      MODEL_PAGE_WEBHOOK_ALLOWED_ORIGINS: 'https://dealer.test',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ propagation: 'failed', published_revision: 21 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bounds registered webhook delivery with a five second abort signal', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    const definitions = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: null,
      history: [],
      nextRevision: 22,
      candidate: {
        revision: 21, draft_version: 24, status: 'ready', validation_digest: readyValidation.digest,
        created_at: '2026-08-04T03:04:05.000Z', created_by: 'editor@test',
      },
    });
    definitions.seed('pages/definitions/nissan-au/ariya/latest.json', { version: 24 });
    definitions.seed('config/webhooks.json', [{
      id: 'dealer-a', url: 'https://dealer.test/page-updated', events: ['page.updated'], created_at: 'now',
    }]);
    const timeoutSignal = AbortSignal.abort(new DOMException('timed out', 'TimeoutError'));
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal);
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) throw init.signal.reason;
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await oemAgentApp.request('/admin/pages/nissan-au-ariya/publication/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 21, expectedDraftVersion: 24, validationDigest: readyValidation.digest }),
    }, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: definitions,
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      MODEL_PAGE_WEBHOOK_SECRET: 'route-test-secret',
      MODEL_PAGE_WEBHOOK_ALLOWED_ORIGINS: 'https://dealer.test',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ propagation: 'failed', published_revision: 21 });
    expect(timeoutSpy).toHaveBeenCalledWith(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns publication state and immutable manifest history', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 22, 25);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: 21,
      history: [21],
      nextRevision: 23,
      candidate: {
        revision: 22,
        draft_version: 25,
        status: 'ready',
        validation_digest: readyValidation.digest,
        created_at: '2026-08-04T03:04:05.000Z',
        created_by: 'editor@test',
      },
    });

    const response = await oemAgentApp.request('/admin/pages/nissan-au-ariya/publication/history', {}, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: new RouteMemoryR2Bucket(),
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json() as { state: PublicationState; history: Array<{ revision: number }> };
    expect(body).toMatchObject({
      state: { published_revision: 21 },
      history: [{ pageId: 'nissan-au-ariya', revision: 21, draftVersion: 24 }],
    });
    expect(body.history.map(entry => entry.revision)).toEqual([21]);
  });

  it('returns canonical failed candidate validation with publication history', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 22, 25);
    publicationBucket.seed(publicationKeys('nissan-au-ariya', 22).validation, failedValidation);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: null,
      history: [],
      nextRevision: 23,
      candidate: {
        revision: 22,
        draft_version: 25,
        status: 'failed',
        validation_digest: failedValidation.digest,
        created_at: '2026-08-04T03:04:05.000Z',
        created_by: 'editor@test',
      },
    });

    const response = await oemAgentApp.request('/admin/pages/nissan-au-ariya/publication/history', {}, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: new RouteMemoryR2Bucket(),
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: { candidate: { revision: 22, status: 'failed' } },
      candidateValidation: {
        revision: 22,
        status: 'failed',
        validation: failedValidation,
      },
    });
  });

  it('rolls production back to a retained published revision', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 22, 25);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: 22,
      history: [22, 21],
      nextRevision: 23,
    });

    const response = await oemAgentApp.request('/admin/pages/nissan-au-ariya/publication/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetRevision: 21, expectedPublishedRevision: 22 }),
    }, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: new RouteMemoryR2Bucket(),
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ published_revision: 21, propagation: 'delivered' });
    const state = await (await publicationBucket.get(publicationKeys('nissan-au-ariya').state)).json() as PublicationState;
    expect(state.published_revision).toBe(21);
  });

  it('rejects a stale rollback expectation with 409 and preserves production', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 21, 24);
    await seedPublicationRevision(publicationBucket, 'nissan-au-ariya', 22, 25);
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: 22,
      history: [22, 21],
      nextRevision: 23,
    });

    const response = await oemAgentApp.request('/admin/pages/nissan-au-ariya/publication/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetRevision: 21, expectedPublishedRevision: 21 }),
    }, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: new RouteMemoryR2Bucket(),
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'published_revision_conflict' });
    const state = await (await publicationBucket.get(publicationKeys('nissan-au-ariya').state)).json() as PublicationState;
    expect(state.published_revision).toBe(22);
  });

  it('returns not found for a known publication revision with missing immutable artifacts', async () => {
    const publicationBucket = new RouteMemoryR2Bucket();
    seedPublicationState(publicationBucket, 'nissan-au-ariya', {
      publishedRevision: 21,
      history: [21],
      nextRevision: 22,
    });

    const response = await oemAgentApp.request('/pages/nissan-au-ariya/production-body-html?revision=21', {}, {
      ...publicationRouteEnv,
      MOLTBOT_BUCKET: throwingBucket(),
      OEM_PAGE_BUCKET: publicationBucket,
      MODEL_PAGE_PUBLICATION_ENABLED_PAGE_IDS: 'nissan-au-ariya',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(404);
  });
});

describe('oem-agent AI model canary route', () => {
  it('runs a fixed non-publishing Kimi K3 structuring inference', async () => {
    let moonshotRequestBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/rest/v1/workflow_settings')) {
        return new Response(JSON.stringify({ config: { ai_model_overrides: {} } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/v1/chat/completions')) {
        moonshotRequestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/rest/v1/ai_inference_log')) {
        return new Response(JSON.stringify([]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await oemAgentApp.request('/admin/ai-model-canary', {
      method: 'POST',
    }, {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      MOONSHOT_API_KEY: 'moonshot-test-key',
      DEV_MODE: 'true',
    } as never);

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
  });
});

describe('oem-agent compile status route', () => {
  it('returns a queued placeholder when no compile run has been recorded', async () => {
    const bucket = {
      async get(key: string) {
        expect(key).toBe('pages/compile-runs/volkswagen-au/amarok/latest.json');
        return null;
      },
    };

    const response = await oemAgentApp.request('/admin/compile-status/volkswagen-au/amarok', {}, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runId: 'volkswagen-au:amarok:none',
      status: 'queued',
      stageLabel: 'No compile run recorded',
      error: null,
      warnings: [],
      artifacts: [],
    });
  });

  it('returns the latest compile run status artifact from R2', async () => {
    const status = {
      runId: 'volkswagen-au:amarok:1783000000000',
      status: 'capturing',
      stageLabel: 'Capturing source page',
      startedAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-03T00:00:01.000Z',
      completedAt: null,
      error: null,
      warnings: [],
      artifacts: [],
    };
    const bucket = {
      async get(key: string) {
        expect(key).toBe('pages/compile-runs/volkswagen-au/amarok/latest.json');
        return jsonObject(status);
      },
    };

    const response = await oemAgentApp.request('/admin/compile-status/volkswagen-au/amarok', {}, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(status);
  });
});

describe('oem-agent Tailwind recipe compiler route', () => {
  const env = {
    MOLTBOT_BUCKET: {},
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    DEV_MODE: 'true',
  } as never;

  it('compiles a captured Mitsubishi region artifact into a section draft', async () => {
    const response = await oemAgentApp.request('/admin/compile-tailwind-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artifact: {
          oem_id: 'mitsubishi-au',
          model_slug: 'outlander',
          source_url: 'https://www.mitsubishi-motors.com.au/vehicles/outlander.html',
          region_id: 'outlander-variant-picker',
          viewport: { name: 'desktop', width: 1440, height: 1200 },
          root: {
            path: '0',
            tag: 'section',
            text: 'PETROL RANGE Make Your Mark. ES LS White Key Features Build your own',
            attributes: { class: 'range-selector colour-picker' },
            computed_style: { display: 'grid', color: 'rgb(0, 0, 0)', 'font-size': '20px' },
            children: [
              {
                path: '0.0',
                tag: 'button',
                text: 'ES',
                attributes: { class: 'tab active', 'aria-selected': 'true' },
                computed_style: { 'font-weight': '700' },
                children: [],
              },
              {
                path: '0.1',
                tag: 'button',
                text: 'White',
                attributes: { class: 'colour-swatch active' },
                computed_style: { 'background-color': 'rgb(255, 255, 255)' },
                children: [],
              },
              {
                path: '0.2',
                tag: 'img',
                text: '',
                attributes: { src: 'https://example.test/outlander-white.png' },
                computed_style: {},
                children: [],
              },
            ],
          },
        },
      }),
    }, env);

    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.success).toBe(true);
    expect(body.result.section_type).toBe('variant-color-explorer');
    expect(body.result.section.oem_id).toBe('mitsubishi-au');
    expect(body.result.section.model_slug).toBe('outlander');
    expect(body.result.section.heading).toBe('Make Your Mark.');
    expect(body.result.section.fallback_image_url).toBe('https://example.test/outlander-white.png');
    expect(body.result.section.variants).toEqual([
      {
        title: 'ES',
        description: '',
        image_url: 'https://example.test/outlander-white.png',
        key_features: [],
        colors: [
          { name: 'White', hero_image_url: 'https://example.test/outlander-white.png', hex: 'rgb(255, 255, 255)' },
        ],
      },
    ]);
  });

  it('rejects invalid Tailwind recipe artifacts', async () => {
    const response = await oemAgentApp.request('/admin/compile-tailwind-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifact: { root: null } }),
    }, env);

    expect(response.status).toBe(400);
    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(body.error).toContain('Invalid Tailwind recipe artifact');
  });
});

describe('oem-agent clone update route', () => {
  it.each([
    {
      name: 'omitted',
      requestBody: { edited_rendered: '<main>Edited Clone Content</main>' },
    },
    {
      name: 'not an array',
      requestBody: { edited_rendered: '<main>Edited Clone Content</main>', section_index: { id: 'invalid' } },
    },
  ])('preserves existing clone regions when section_index is $name', async ({ requestBody }) => {
    const latestKey = 'pages/definitions/ford-au/mustang/latest.json';
    const existingSectionIndex = [
      { id: 'clone-1', label: 'Hero', selector: 'main', tag: 'main', classes: ['hero'], top: 0, height: 400, editable_fields: [] },
    ];
    const pageData = {
      active_mode: 'clone',
      version: 2,
      content: {
        rendered: '<main>Original Clone</main>',
        modes: {
          clone: {
            rendered: '<main>Original Clone</main>',
            source_url: 'https://www.ford.com.au/showroom/cars/mustang/',
            captured_at: '2026-06-03T00:00:00.000Z',
            viewport: { width: 1440, height: 1080 },
            asset_map: {},
            stylesheet_urls: [],
            section_index: existingSectionIndex,
            stripped_selectors: [],
            warnings: [],
          },
        },
      },
    };
    const puts: Array<{ key: string; value: string }> = [];
    const bucket = {
      async get(key: string) {
        if (key === latestKey) {
          return {
            async json() {
              return JSON.parse(JSON.stringify(pageData));
            },
          };
        }

        return null;
      },
      async put(key: string, value: string) {
        puts.push({ key, value });
        return null;
      },
    };
    const waitUntilPromises: Promise<unknown>[] = [];

    const response = await oemAgentApp.request('/admin/update-clone/ford-au/mustang', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never, {
      waitUntil: (promise: Promise<unknown>) => waitUntilPromises.push(promise),
    } as never);

    await Promise.all(waitUntilPromises);

    expect(response.status).toBe(200);
    const body = await response.json() as { clone_regions_count: number };
    expect(body.clone_regions_count).toBe(1);

    const latestPut = puts.find(put => put.key === latestKey);
    expect(latestPut).toBeDefined();
    const savedPage = JSON.parse(latestPut!.value);
    expect(savedPage.content.modes.clone.section_index).toEqual(existingSectionIndex);
  });
});

describe('oem-agent protected model page writes', () => {
  it('allows a versioned manual clone edit for a live Nissan model page', async () => {
    const latestKey = 'pages/definitions/nissan-au/ariya/latest.json';
    const pageData = {
      id: 'nissan-au-ariya',
      oem_id: 'nissan-au',
      slug: 'ariya',
      active_mode: 'clone',
      version: 14,
      content: {
        rendered: '<main>Original ARIYA clone</main>',
        modes: {
          clone: {
            rendered: '<main>Original ARIYA clone</main>',
            section_index: [],
          },
        },
      },
    };
    const puts: Array<{ key: string; value: string }> = [];
    const bucket = {
      async get(key: string) {
        return key === latestKey ? jsonObject(pageData) : null;
      },
      async put(key: string, value: string) {
        puts.push({ key, value });
        return null;
      },
    };
    const waitUntilPromises: Promise<unknown>[] = [];

    const response = await oemAgentApp.request('/admin/update-clone/nissan-au/ariya', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        edited_rendered: '<main>Manually edited ARIYA clone markup</main>',
        section_index: [],
      }),
    }, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never, {
      waitUntil: (promise: Promise<unknown>) => waitUntilPromises.push(promise),
    } as never);

    await Promise.all(waitUntilPromises);

    expect(response.status).toBe(200);
    expect(puts.some(put => put.key === latestKey)).toBe(true);
    expect(puts.some(put => /^pages\/definitions\/nissan-au\/ariya\/v\d+\.json$/.test(put.key))).toBe(true);

    const latestPut = puts.find(put => put.key === latestKey);
    const savedPage = JSON.parse(latestPut!.value);
    expect(savedPage.version).toBe(15);
    expect(savedPage.manually_edited).toBe(true);
    expect(savedPage.content.modes.clone.edited_rendered).toContain('Manually edited ARIYA');
  });

  it('allows a versioned manual sections edit for a live Nissan model page', async () => {
    const latestKey = 'pages/definitions/nissan-au/ariya/latest.json';
    const pageData = {
      id: 'nissan-au-ariya',
      oem_id: 'nissan-au',
      slug: 'ariya',
      active_mode: 'sections',
      version: 14,
      header: { slides: [{ heading: 'ARIYA' }] },
      content: {
        sections: [{ id: 'hero-1', type: 'hero', heading: 'Original ARIYA' }],
      },
    };
    const puts: Array<{ key: string; value: string }> = [];
    const bucket = {
      async get(key: string) {
        return key === latestKey ? jsonObject(pageData) : null;
      },
      async put(key: string, value: string) {
        puts.push({ key, value });
        return null;
      },
    };
    const waitUntilPromises: Promise<unknown>[] = [];

    const response = await oemAgentApp.request('/admin/update-sections/nissan-au/ariya', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sections: [{ id: 'hero-1', type: 'hero', heading: 'Manually edited ARIYA' }],
      }),
    }, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never, {
      waitUntil: (promise: Promise<unknown>) => waitUntilPromises.push(promise),
    } as never);

    await Promise.all(waitUntilPromises);

    expect(response.status).toBe(200);
    expect(puts.some(put => put.key === latestKey)).toBe(true);
    expect(puts.some(put => /^pages\/definitions\/nissan-au\/ariya\/v\d+\.json$/.test(put.key))).toBe(true);

    const latestPut = puts.find(put => put.key === latestKey);
    const savedPage = JSON.parse(latestPut!.value);
    expect(savedPage.version).toBe(15);
    expect(savedPage.manually_edited).toBe(true);
    expect(savedPage.content.sections[0].heading).toBe('Manually edited ARIYA');
  });

  it.each([
    {
      method: 'POST',
      path: '/admin/capture-screenshot',
      body: { url: 'https://example.test/emkoo', oem_id: 'gac-au' },
    },
    { method: 'POST', path: '/admin/generate-page/gac-au/emkoo' },
    { method: 'POST', path: '/admin/clone-page/foton-au/tunland' },
    { method: 'POST', path: '/admin/structure-page/gac-au/emkoo' },
    { method: 'PUT', path: '/admin/update-sections/foton-au/tunland' },
    { method: 'PUT', path: '/admin/update-clone/gac-au/emkoo' },
    { method: 'POST', path: '/admin/import-legacy/foton-au/tunland' },
    { method: 'POST', path: '/admin/scrape-oem/gac-au/emkoo' },
    { method: 'POST', path: '/admin/scrape-gac/gac-au/emkoo' },
    { method: 'POST', path: '/admin/upload-media/foton-au/tunland' },
    { method: 'POST', path: '/admin/regenerate-section/gac-au/emkoo' },
    { method: 'PUT', path: '/admin/screenshot/foton-au/tunland' },
    { method: 'PUT', path: '/admin/dealer-overrides/gac-au/emkoo' },
    {
      method: 'POST',
      path: '/admin/page-templates/apply',
      body: { template_id: 'basic-landing', oem_id: 'foton-au', model_slug: 'tunland' },
    },
    { method: 'POST', path: '/admin/adaptive-pipeline/gac-au/emkoo' },
    { method: 'POST', path: '/admin/adaptive-pipeline/nissan-au/ariya' },
    { method: 'POST', path: '/admin/create-custom-page/foton-au/warranty' },
    { method: 'POST', path: '/admin/create-subpage/gac-au/emkoo/specs' },
    { method: 'DELETE', path: '/admin/delete-subpage/foton-au/tunland/specs' },
    { method: 'DELETE', path: '/admin/delete-custom-page/gac-au/warranty' },
  ])('blocks $method $path before mutating storage', async ({ method, path, body }) => {
    const response = await oemAgentApp.request(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }, {
      MOLTBOT_BUCKET: throwingBucket(),
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(403);
    const json = await response.json() as { protected: boolean; error: string };
    expect(json.protected).toBe(true);
    expect(json.error).toContain('protected from admin writes');
  });
});

describe('oem-agent production embed routes', () => {
  const latestKey = 'pages/definitions/mitsubishi-au/outlander/latest.json';
  const embedPage = {
    version: 7,
    content: {
      modes: {
        clone: {
          rendered: '<main><section data-compid="simple-hero-comp">Hero</section><section class="body-copy"><a href="http://mitsubishi.test/warranty">Warranty</a><script>alert(1)</script>Copy</section></main>',
          stylesheet_urls: ['https://cdn.mitsubishi.test/site.css'],
          source_url: 'https://www.mitsubishi.test/outlander',
        },
      },
    },
  };

  it('serves scoped script-free embed HTML without inlining stylesheets', async () => {
    const bucket = { async get(key: string) { return key === latestKey ? jsonObject(embedPage) : null; } };
    const response = await oemAgentApp.request('/pages/mitsubishi-au-outlander/production-embed-html', {}, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('class="oem-production-scope"');
    expect(html).toContain('Copy');
    expect(html).not.toContain('simple-hero-comp');
    expect(html).not.toContain('<script');
    expect(html.match(/<style/g) || []).toHaveLength(1);
    expect(html).toContain('data-oem-embed-fixups');
    expect(html).toContain('[data-oem-pseudo]{display:none !important}');
    expect(response.headers.get('X-OEM-CSS-Scope')).toContain('data-oem-id="mitsubishi-au"');
  });

  it('serves concatenated scoped CSS for the page stylesheets', async () => {
    const stored = new Map<string, string>();
    const bucket = {
      async get(key: string) {
        if (key === latestKey) return jsonObject(embedPage);
        const cached = stored.get(key);
        return cached === undefined ? null : { async text() { return cached; } };
      },
      async put(key: string, value: string) { stored.set(key, value); },
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response('.hero { color: red; }', { headers: { 'content-type': 'text/css' } })));

    const response = await oemAgentApp.request('/pages/mitsubishi-au-outlander/production-embed-css', {}, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    const css = await response.text();
    expect(css).toContain('.oem-production-scope[data-oem-id="mitsubishi-au"][data-model-slug="outlander"] .hero');
    expect(response.headers.get('Content-Type')).toContain('text/css');
    expect(stored.size).toBe(1);
  });
});
