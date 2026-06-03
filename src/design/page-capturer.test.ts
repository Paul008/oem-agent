import { describe, expect, it } from 'vitest'

import { normalizeCapturedLazyMedia } from './page-capturer'

describe('normalizeCapturedLazyMedia', () => {
  it('restores Toyota responsive lazy image URLs from source data-srcset', () => {
    const result = normalizeCapturedLazyMedia({
      html: `
        <main>
          <picture data-ty-lazy-image="">
            <source data-aspectratio="1.777778" type="image/jpeg" data-srcset="/-/media/toyota/main-site/vehicle-hubs/rav4/bep/2026/new_powertrain_mosaic_d_v4.jpg?rev=f4075ca88c294e0187cf8f14c4f5d12f" srcset="">
            <img class="ty-responsive-background-picture-img" alt="RAV4 feature" srcset="">
          </picture>
        </main>
      `,
      stylesheetLinks: [],
      imageUrls: [],
      heroUrl: '',
      title: 'RAV4',
      elementCount: 4,
    }, 'https://www.toyota.com.au/rav4')

    const expectedUrl = 'https://www.toyota.com.au/-/media/toyota/main-site/vehicle-hubs/rav4/bep/2026/new_powertrain_mosaic_d_v4.jpg?rev=f4075ca88c294e0187cf8f14c4f5d12f'

    expect(result.html).toContain(`srcset="${expectedUrl}"`)
    expect(result.html).toContain(`src="${expectedUrl}"`)
    expect(result.imageUrls).toContain(expectedUrl)
  })
})
