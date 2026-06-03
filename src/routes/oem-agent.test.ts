import { describe, expect, it } from 'vitest';

import oemAgentApp from './oem-agent';

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
