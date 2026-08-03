import { afterEach, describe, expect, it, vi } from 'vitest';

import oemAgentApp from './oem-agent';

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
              '<section id="grades"><h2>Choose your ARIYA</h2></section>',
            ].join(''),
          },
        },
      },
    };
    const bucket = {
      async get(key: string) {
        return key === latestKey ? jsonObject(pageData) : null;
      },
    };

    const response = await oemAgentApp.request('/pages/nissan-au-ariya/production-body-html', {}, {
      MOLTBOT_BUCKET: bucket,
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      DEV_MODE: 'true',
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('X-OEM-Body-Only')).toBe('true');
    const html = await response.text();
    expect(html).toContain('Choose your ARIYA');
    expect(html).not.toContain('All-electric Nissan ARIYA');
    expect(html).not.toContain('simple-hero-comp');
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
