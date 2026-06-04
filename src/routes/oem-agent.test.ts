import { describe, expect, it } from 'vitest';

import oemAgentApp from './oem-agent';

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
