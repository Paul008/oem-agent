import { describe, expect, it, vi } from 'vitest';
import {
  NissanOfficialClient,
  assertNissanOfficialUrl,
  buildChoicesStatePricing,
  buildHeliosFrameUrls,
  assessNissanCatalogDrift,
  buildNissanSnapshot,
  eimToSa,
  NISSAN_STATE_POSTCODES,
  normalizeNissanOffers,
  syncNissanOffers,
  syncNissanPaceCatalog,
} from './nissan-sync';

describe('Nissan official API connector', () => {
  it('rejects zero and materially shrunken version catalogs unless explicitly approved', () => {
    expect(assessNissanCatalogDrift({ existingCount: 8, incomingCount: 0 })).toMatchObject({
      accepted: false,
      reason: expect.stringContaining('zero versions'),
    });
    expect(assessNissanCatalogDrift({ existingCount: 10, incomingCount: 6 })).toMatchObject({
      accepted: false,
      shrinkRatio: 0.4,
      reason: expect.stringContaining('40.0%'),
    });
    expect(assessNissanCatalogDrift({ existingCount: 10, incomingCount: 7 })).toMatchObject({
      accepted: true,
      shrinkRatio: 0.3,
    });
    expect(assessNissanCatalogDrift({
      existingCount: 10,
      incomingCount: 2,
      approveMaterialShrink: true,
    })).toMatchObject({
      accepted: true,
      approvalRequired: true,
      shrinkRatio: 0.8,
    });
  });

  it('allows only reviewed Nissan first-party HTTPS hosts', () => {
    expect(() => assertNissanOfficialUrl('https://gq-apn-prod.nissanpace.com/graphql')).not.toThrow();
    expect(() => assertNissanOfficialUrl('https://ap.nissan-api.net/v2/models')).not.toThrow();
    expect(() => assertNissanOfficialUrl('https://www.nissan.com.au/vehicles/browse-range.html')).not.toThrow();
    expect(() => assertNissanOfficialUrl('https://www-asia.nissan-cdn.net/media/image.webp')).not.toThrow();
    expect(() => assertNissanOfficialUrl('https://ms-prd.apn.mediaserver.heliosnissan.net/iris/iris')).not.toThrow();

    expect(() => assertNissanOfficialUrl('http://gq-apn-prod.nissanpace.com/graphql')).toThrow('HTTPS');
    expect(() => assertNissanOfficialUrl('https://gq-apn-prod.nissanpace.com.evil.test/graphql')).toThrow('not allowlisted');
    expect(() => assertNissanOfficialUrl('https://legacy-source.invalid/api')).toThrow('not allowlisted');
  });

  it('decodes EIM values and preserves empty SA positions', () => {
    expect(eimToSa('TDZARDWJ12UMA-----', '2025')).toBe(
      '1_T,2_DZ,4_A,5_R,6_D,7_W,11_U,12_M,13_A,14_,15_,16_,17_,18_,2025,,AU,PE_ON',
    );
    expect(eimToSa('too-short', '2025')).toBeNull();
  });

  it('builds complete exterior and interior Helios frame sets', () => {
    const exterior = buildHeliosFrameUrls({
      vehicle: '8_T33',
      paint: 'QBE',
      sa: '1_T,2_DZ,2026,,AU,PE_ON',
      view: 'exterior',
      width: 2000,
    });
    const interior = buildHeliosFrameUrls({
      vehicle: '8_T33',
      paint: 'QBE',
      view: 'interior',
    });

    expect(exterior).toHaveLength(36);
    expect(interior).toHaveLength(36);
    expect(new URL(exterior[0]).searchParams.get('pov')).toBe('E01');
    expect(new URL(exterior[35]).searchParams.get('pov')).toBe('E36');
    expect(new URL(interior[0]).searchParams.get('pov')).toBe('I01');
    expect(new URL(interior[35]).searchParams.get('pov')).toBe('I36');
    expect(new URL(exterior[0]).searchParams).toMatchObject(expect.any(URLSearchParams));
    expect(new URL(exterior[0]).searchParams.get('brand')).toBe('nisglo');
    expect(new URL(exterior[0]).searchParams.get('width')).toBe('2000');
  });

  it('posts the Nissan PACE GetVersions operation without following redirects', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe('manual');
      expect(init?.headers).toMatchObject({ 'x-api-key': 'pace-test-key' });
      return new Response(JSON.stringify({
        data: {
          getVersionExplorerInformation: {
            model: {
              modelName: 'QASHQAI',
              programCode: 'J12',
              phase: '1',
              modelKind: 'passenger',
              commercialKind: null,
              choiceId: '30128',
            },
            versions: [{
              specCode: 'QASHQAI-ST-L',
              name: 'QASHQAI ST-L',
              gradeName: 'ST-L',
              gradeId: 'st-l',
              eimCode: 'TDZARDWJ12UMA-----',
              powerTrainName: 'Petrol',
              engine: { fuelType: 'Petrol' },
              price: { label: 'MLP', amount: 42490, amountFormatted: '$42,490' },
              colors: [],
              mainFeatures: [],
              image: null,
              versionTags: [],
              additionalPrices: null,
              versionAdditionalPrices: null,
              offer: null,
              discount: null,
            }],
          },
        },
      }), { headers: { 'Content-Type': 'application/json' } });
    });
    const client = new NissanOfficialClient({
      paceApiKey: 'pace-test-key',
      fetch: fetchMock,
    });

    const result = await client.fetchPaceVersions({
      slug: 'qashqai',
      modelCode: '30128',
      postcode: '3000',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gq-apn-prod.nissanpace.com/graphql');
    const body = JSON.parse(String(init?.body));
    expect(body.operationName).toBe('GetVersions');
    expect(body.variables.locationDataInput).toEqual({ location: '3000' });
    expect(body.variables.versionExplorerInput.modelCode).toBe('30128');
    expect(result.versions[0].eimCode).toBe('TDZARDWJ12UMA-----');
  });

  it('fails closed on redirects and GraphQL errors', async () => {
    const redirectClient = new NissanOfficialClient({
      paceApiKey: 'pace-test-key',
      fetch: vi.fn(async () => new Response(null, {
        status: 302,
        headers: { Location: 'https://legacy-source.invalid/api' },
      })),
    });

    await expect(redirectClient.fetchPaceVersions({
      slug: 'qashqai', modelCode: '30128', postcode: '3000',
    })).rejects.toThrow('redirect');

    const graphqlClient = new NissanOfficialClient({
      paceApiKey: 'pace-test-key',
      fetch: vi.fn(async () => new Response(JSON.stringify({
        errors: [{ message: 'Not authorized' }],
        data: null,
      }), { headers: { 'Content-Type': 'application/json' } })),
    });

    await expect(graphqlClient.fetchPaceVersions({
      slug: 'qashqai', modelCode: '30128', postcode: '3000',
    })).rejects.toThrow('GraphQL');
  });

  it('requests postcode pricing from Nissan Choices with explicit credentials', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [
        { choiceId: 'version-1', category: 'version', label: 'QASHQAI ST-L', price: 44990 },
      ],
    }), { headers: { 'Content-Type': 'application/json' } }));
    const client = new NissanOfficialClient({
      choicesApiKey: 'choices-test-key',
      choicesClientKey: 'choices-client-test-key',
      fetch: fetchMock,
    });

    const result = await client.fetchChoices({
      modelCode: '30128',
      configCode: 'J12:A',
      choiceIds: ['grade-1', 'version-1'],
      postcode: '3000',
    });

    const [rawUrl, init] = fetchMock.mock.calls[0];
    const url = new URL(String(rawUrl));
    expect(url.origin).toBe('https://ap.nissan-api.net');
    expect(url.pathname).toBe('/v2/models/30128/configuration/J12%3AA/choices');
    expect(url.searchParams.get('regionalPriceLocation')).toBe('3000');
    expect(url.searchParams.get('filterByChoiceIDs')).toBe('grade-1,version-1');
    expect(init?.headers).toMatchObject({
      apiKey: 'choices-test-key',
      clientKey: 'choices-client-test-key',
    });
    expect(result.choices).toHaveLength(1);
  });

  it('maps PACE data to staged normalized rows without calling MLP driveaway', () => {
    const snapshot = buildNissanSnapshot({
      slug: 'qashqai',
      modelCode: '30128',
      modelYear: '2026',
      fetchedAt: '2026-07-21T00:00:00.000Z',
      sourceRunId: 'run-001',
      explorer: {
        model: { modelName: 'QASHQAI', programCode: 'J12', choiceId: '30128' },
        versions: [{
          specCode: 'QASHQAI-ST-L',
          name: 'QASHQAI ST-L',
          gradeName: 'ST-L',
          gradeId: 'st-l',
          eimCode: 'TDZARDWJ12UMA-----',
          powerTrainName: 'Petrol',
          engine: { fuelType: 'Petrol' },
          price: {
            label: 'Manufacturer List Price',
            amount: 42490,
            amountFormatted: '$42,490',
            labelCaveat: 'Excludes on-road costs',
          },
          image: { large: 'https://www-asia.nissan-cdn.net/qashqai/st-l.webp' },
          colors: [{
            colorCode: 'RCH',
            image: { large: 'https://www-asia.nissan-cdn.net/qashqai/rch.webp' },
          }],
          mainFeatures: [{ info: { key: 'Highlights', values: ['ProPILOT', '12.3-inch display'] } }],
          versionTags: [],
          additionalPrices: null,
          versionAdditionalPrices: null,
          offer: null,
          discount: null,
        }],
      },
    });

    expect(snapshot.model).toMatchObject({
      oem_id: 'nissan-au',
      slug: 'qashqai',
      source_url: 'https://www.nissan.com.au/vehicles/browse-range/qashqai.html',
      oem_model_code: '30128',
      meta_json: expect.objectContaining({ source_run_id: 'run-001', staged: true }),
    });
    expect(snapshot.products[0].row).toMatchObject({
      external_key: 'pace:30128:QASHQAI-ST-L',
      price_amount: 42490,
      price_type: 'mlp',
      price_qualifier: 'Excludes on-road costs',
      source_url: 'https://www.nissan.com.au/vehicles/browse-range/qashqai.html',
      meta_json: expect.objectContaining({ source_run_id: 'run-001', staged: true }),
    });
    expect(snapshot.products[0].pricing).toMatchObject({
      price_type: 'mlp',
      rrp: 42490,
      driveaway_nsw: null,
      driveaway_vic: null,
    });
    expect(snapshot.products[0].colors[0]).toMatchObject({
      color_code: 'RCH',
      source_hero_url: 'https://www-asia.nissan-cdn.net/qashqai/rch.webp',
    });
    expect(snapshot.products[0].colors[0].exterior_360_urls).toHaveLength(36);
    expect(snapshot.products[0].colors[0].interior_360_urls).toHaveLength(36);
  });

  it('supports a no-write dry run before Nissan access is approved', async () => {
    const fetchPaceVersions = vi.fn(async () => ({
      model: { modelName: 'QASHQAI', programCode: 'J12', choiceId: '30128' },
      versions: [{
        specCode: 'QASHQAI-ST',
        name: 'QASHQAI ST',
        gradeName: 'ST',
        price: { label: 'MLP', amount: 39990 },
        image: null,
        colors: [],
        mainFeatures: [],
        versionTags: [],
        additionalPrices: null,
        versionAdditionalPrices: null,
        offer: null,
        discount: null,
      }],
    }));

    const result = await syncNissanPaceCatalog({} as any, {
      client: { fetchPaceVersions } as any,
      dryRun: true,
      modelSlugs: ['qashqai'],
      modelYears: { qashqai: '2026' },
      postcode: '3000',
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(fetchPaceVersions).toHaveBeenCalledWith({
      slug: 'qashqai',
      modelCode: '30128',
      postcode: '3000',
    });
    expect(result).toMatchObject({
      dryRun: true,
      modelsFetched: 1,
      versionsFetched: 1,
      modelsUpserted: 0,
      productsUpserted: 0,
      colorsUpserted: 0,
      pricingUpserted: 0,
      errors: [],
    });
  });

  it('stops a materially shrunken catalog before any staged database write', async () => {
    const supabase = new Proxy({}, {
      get() {
        throw new Error('catalog drift rejection must happen before Supabase writes');
      },
    });
    const result = await syncNissanPaceCatalog(supabase as any, {
      client: {
        fetchPaceVersions: vi.fn(async () => ({
          model: { modelName: 'QASHQAI', programCode: 'J12', choiceId: '30128' },
          versions: [{
            specCode: 'QASHQAI-ST', name: 'QASHQAI ST', gradeName: 'ST',
            price: { label: 'MLP', amount: 39990 }, image: null, colors: [],
            mainFeatures: [], versionTags: [], additionalPrices: null,
            versionAdditionalPrices: null, offer: null, discount: null,
          }],
        })),
      } as any,
      dryRun: false,
      modelSlugs: ['qashqai'],
      postcode: '3000',
      getExistingVersionCount: async () => 4,
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(result.modelsUpserted).toBe(0);
    expect(result.productsUpserted).toBe(0);
    expect(result.catalogsRejected).toBe(1);
    expect(result.errors[0]).toContain('catalog drift rejected');
  });

  it('runs all eight Choices regions during a configured dry run', async () => {
    const fetchPaceVersions = vi.fn(async () => ({
      model: { modelName: 'QASHQAI', programCode: 'J12', choiceId: '30128' },
      versions: [{
        specCode: 'QASHQAI-ST', name: 'QASHQAI ST', gradeName: 'ST',
        price: { label: 'MLP', amount: 39990 }, image: null, colors: [],
        mainFeatures: [], versionTags: [], additionalPrices: null,
        versionAdditionalPrices: null, offer: null, discount: null,
      }],
    }));
    const fetchChoices = vi.fn(async ({ postcode }: { postcode: string }) => ({
      choices: [{
        choiceId: 'QASHQAI-ST',
        category: 'version',
        price: 45000 + Number(postcode.slice(0, 1)),
      }],
    }));

    const result = await syncNissanPaceCatalog({} as any, {
      client: { fetchPaceVersions, fetchChoices } as any,
      dryRun: true,
      modelSlugs: ['qashqai'],
      postcode: '3000',
      choicesConfigs: {
        qashqai: { configCode: 'J12:A', choiceIds: ['QASHQAI-ST'] },
      },
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(fetchChoices).toHaveBeenCalledTimes(8);
    expect(fetchChoices.mock.calls.map(([input]) => input.postcode).sort()).toEqual(
      Object.values(NISSAN_STATE_POSTCODES).sort(),
    );
    expect(result).toMatchObject({
      choicesRequests: 8,
      regionalPricingRows: 1,
      errors: [],
    });
  });

  it('maps Choices version prices into all eight state fields by PACE spec code', () => {
    const responses = Object.fromEntries(
      Object.entries(NISSAN_STATE_POSTCODES).map(([state, postcode], index) => [
        state,
        {
          postcode,
          response: {
            choices: [{
              choiceId: 'QASHQAI-ST-L',
              category: 'version',
              label: 'QASHQAI ST-L',
              price: 44000 + (index * 100),
            }],
          },
        },
      ]),
    ) as any;

    const pricing = buildChoicesStatePricing({
      specCodes: ['QASHQAI-ST-L'],
      responses,
      fetchedAt: '2026-07-21T00:00:00.000Z',
    });

    expect(pricing.get('QASHQAI-ST-L')).toMatchObject({
      price_type: 'driveaway',
      driveaway_nsw: 44000,
      driveaway_vic: 44100,
      driveaway_qld: 44200,
      driveaway_sa: 44300,
      driveaway_wa: 44400,
      driveaway_tas: 44500,
      driveaway_act: 44600,
      driveaway_nt: 44700,
      source_price_type: 'Retail with VAT',
      source_postcodes: NISSAN_STATE_POSTCODES,
    });
  });

  it('fetches and normalizes Nissan offers with legal validity and applicability intact', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe('manual');
      return new Response(JSON.stringify({
        totalResults: 1,
        offers: [{
          id: 'offer-123',
          offerType: 'Driveaway',
          offerTypeTitle: 'Driveaway Price',
          title: { headline: 'FROM $49,990 DRIVEAWAY', strapline: 'Selected QASHQAI grades' },
          model: { code: '30128', name: 'QASHQAI' },
          grade: { code: '30128-ST-L' },
          version: { code: 'QASHQAI-ST-L' },
          applicability: 'QASHQAI ST-L purchased between 01/07/2026 and 31/07/2026',
          legals: {
            main: {
              details: 'Available on vehicles purchased between 01/07/2026 and 31/07/2026 and delivered by 31/08/2026.',
            },
          },
          images: {
            preview: {
              largeStdRes: 'https://www-asia.nissan-cdn.net/offers/qashqai.webp',
            },
          },
        }],
      }), { headers: { 'Content-Type': 'application/json' } });
    });
    const client = new NissanOfficialClient({
      choicesApiKey: 'choices-test-key',
      choicesClientKey: 'choices-client-test-key',
      fetch: fetchMock,
    });

    const response = await client.fetchOffers();
    const [rawUrl, init] = fetchMock.mock.calls[0];
    const url = new URL(String(rawUrl));
    expect(url.pathname).toBe('/v2/offers');
    expect(url.searchParams.get('includeLegals')).toBe('true');
    expect(init?.headers).toMatchObject({
      apiKey: 'choices-test-key',
      clientKey: 'choices-client-test-key',
    });

    const rows = normalizeNissanOffers(response, '2026-07-21T00:00:00.000Z', 'offer-run-001');
    expect(rows).toEqual([
      expect.objectContaining({
        oem_id: 'nissan-au',
        external_key: 'nissan-offer-offer-123',
        offer_type: 'driveaway',
        price_amount: 49990,
        applicable_models: ['QASHQAI'],
        validity_start: '2026-07-01T00:00:00.000Z',
        validity_end: '2026-07-31T23:59:59.999Z',
        disclaimer_text: expect.stringContaining('delivered by 31/08/2026'),
        source_url: 'https://www.nissan.com.au/offers.html',
        lifecycle_status: 'staged',
        source_run_id: 'offer-run-001',
        hero_image_r2_key: 'https://www-asia.nissan-cdn.net/offers/qashqai.webp',
        meta_json: expect.objectContaining({
          source_system: 'nissan-choices-offers',
          source_run_id: 'offer-run-001',
          grade_code: '30128-ST-L',
          version_code: 'QASHQAI-ST-L',
        }),
      }),
    ]);
  });

  it('keeps offer sync dry by default and refuses an empty campaign response', async () => {
    const validOffer = {
      id: 'offer-1',
      offerType: 'Value Add',
      title: { headline: '$2,000 LOYALTY BONUS' },
      model: { name: 'QASHQAI' },
      legals: { main: { details: 'Purchased between 01/07/2026 and 31/07/2026.' } },
    };
    const valid = await syncNissanOffers({} as any, {
      client: { fetchOffers: vi.fn(async () => ({ offers: [validOffer], totalResults: 1 })) } as any,
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    });
    expect(valid).toMatchObject({ dryRun: true, offersFetched: 1, offersUpserted: 0, errors: [] });

    const empty = await syncNissanOffers({} as any, {
      client: { fetchOffers: vi.fn(async () => ({ offers: [] })) } as any,
      dryRun: false,
      sourceRunId: 'offer-run-empty-001',
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    });
    expect(empty.offersUpserted).toBe(0);
    expect(empty.errors[0]).toContain('zero offers');
  });

  it('refuses a truncated official offer snapshot before any staged write', async () => {
    const supabase = new Proxy({}, {
      get() {
        throw new Error('unexpected database access');
      },
    });
    const result = await syncNissanOffers(supabase as any, {
      client: {
        fetchOffers: vi.fn(async () => ({
          offers: [{ id: 'offer-1', title: { headline: 'Nissan offer' } }],
          totalResults: 2,
        })),
      } as any,
      dryRun: false,
      sourceRunId: 'offer-run-truncated-001',
    });

    expect(result).toMatchObject({ offersFetched: 1, offersUpserted: 0 });
    expect(result.errors[0]).toContain('returned 1 of 2');
  });

  it('requires an official total count and unique offer ids before staged writes', async () => {
    const supabase = new Proxy({}, {
      get() {
        throw new Error('unexpected database access');
      },
    });
    const missingTotal = await syncNissanOffers(supabase as any, {
      client: {
        fetchOffers: vi.fn(async () => ({
          offers: [{ id: 'offer-1', title: { headline: 'Nissan offer' } }],
        })),
      } as any,
      dryRun: false,
      sourceRunId: 'offer-run-no-total-001',
    });
    expect(missingTotal.errors[0]).toContain('totalResults');

    const duplicateIds = await syncNissanOffers(supabase as any, {
      client: {
        fetchOffers: vi.fn(async () => ({
          offers: [
            { id: 'offer-1', title: { headline: 'First' } },
            { id: 'offer-1', title: { headline: 'Duplicate' } },
          ],
          totalResults: 2,
        })),
      } as any,
      dryRun: false,
      sourceRunId: 'offer-run-duplicates-001',
    });
    expect(duplicateIds.errors[0]).toContain('duplicate offer ids');
  });

  it('requires a valid source run id before any staged offer database write', async () => {
    const supabase = new Proxy({}, {
      get() {
        throw new Error('invalid offer run must fail before Supabase access');
      },
    });
    const result = await syncNissanOffers(supabase as any, {
      client: {
        fetchOffers: vi.fn(async () => ({
          offers: [{ id: 'offer-1', title: { headline: 'Nissan offer' } }],
          totalResults: 1,
        })),
      } as any,
      dryRun: false,
      sourceRunId: '../invalid',
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(result.offersUpserted).toBe(0);
    expect(result.errors).toContain('A valid Nissan offer source run id is required for staged writes');
  });

  it('versions staged offers by run so an active stable-key row is never updated before review', async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const insertedRows: Array<Record<string, unknown>> = [];
    const update = vi.fn();
    const offerLookup = {
      select: vi.fn(() => offerLookup),
      eq: vi.fn((field: string, value: unknown) => {
        eqCalls.push([field, value]);
        return offerLookup;
      }),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      update,
      insert: vi.fn((row: Record<string, unknown>) => {
        insertedRows.push(row);
        return {
          select: () => ({ single: async () => ({ data: { id: 'staged-offer-id' }, error: null }) }),
        };
      }),
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== 'offers') throw new Error(`unexpected table ${table}`);
        return offerLookup;
      }),
    };

    const result = await syncNissanOffers(supabase as any, {
      client: {
        fetchOffers: vi.fn(async () => ({
          offers: [{ id: 'offer-1', title: { headline: 'Nissan offer' } }],
          totalResults: 1,
        })),
      } as any,
      dryRun: false,
      sourceRunId: 'offer-run-002',
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(result).toMatchObject({ offersFetched: 1, offersUpserted: 1, errors: [] });
    expect(eqCalls).toContainEqual([
      'external_key',
      'nissan-offer-offer-1--offer-run-002',
    ]);
    expect(insertedRows[0]).toMatchObject({
      external_key: 'nissan-offer-offer-1--offer-run-002',
      lifecycle_status: 'staged',
      source_run_id: 'offer-run-002',
      meta_json: expect.objectContaining({
        canonical_external_key: 'nissan-offer-offer-1',
        source_run_id: 'offer-run-002',
      }),
    });
    expect(update).not.toHaveBeenCalled();
  });
});
