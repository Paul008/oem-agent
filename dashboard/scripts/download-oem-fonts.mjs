#!/usr/bin/env node
/**
 * Download OEM font files and upload to R2 via wrangler.
 * Usage: node dashboard/scripts/download-oem-fonts.mjs
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const FONTS = {
  'kia-au': [
    { family: 'KiaSignature', weight: '700', url: 'https://www.kia.com/content/dam/kwcms/gt/en/font/font_optimization_201808/KiaSignatureBold.woff2', filename: 'KiaSignature-Bold.woff2' },
    { family: 'KiaSignature', weight: '400', url: 'https://www.kia.com/content/dam/kwcms/gt/en/font/font_optimization_201808/KiaSignatureRegular.woff2', filename: 'KiaSignature-Regular.woff2' },
  ],
  'ford-au': [
    { family: 'FordAntenna', weight: '700', url: 'https://www.ford.com.au/etc/designs/guxfoe/clientlibs/guxfoe/fonts/ford-fonts/fordantenna-condensed-bold.woff2', filename: 'FordAntenna-CondBold.woff2' },
    { family: 'FordAntenna', weight: '600', url: 'https://www.ford.com.au/etc/designs/guxfoe/clientlibs/guxfoe/fonts/ford-fonts/fordantenna-medium.woff2', filename: 'FordAntenna-Medium.woff2' },
    { family: 'FordAntenna', weight: '400', url: 'https://www.ford.com.au/etc/designs/guxfoe/clientlibs/guxfoe/fonts/ford-fonts/fordantenna-regular-webfont.woff2', filename: 'FordAntenna-Regular.woff2' },
  ],
  'volkswagen-au': [
    { family: 'VWHead', weight: '200', url: 'https://www.volkswagen.com.au/etc.clientlibs/clientlibs/vwa-ngw18/ngw18-frontend/apps/resources/statics/fonts/vwhead-light.woff2', filename: 'VWHead-Light.woff2' },
    { family: 'VWHead', weight: '400', url: 'https://www.volkswagen.com.au/etc.clientlibs/clientlibs/vwa-ngw18/ngw18-frontend/apps/resources/statics/fonts/vwhead-regular.woff2', filename: 'VWHead-Regular.woff2' },
    { family: 'VWHead', weight: '700', url: 'https://www.volkswagen.com.au/etc.clientlibs/clientlibs/vwa-ngw18/ngw18-frontend/apps/resources/statics/fonts/vwhead-bold.woff2', filename: 'VWHead-Bold.woff2' },
    { family: 'VWText', weight: '400', url: 'https://www.volkswagen.com.au/etc.clientlibs/clientlibs/vwa-ngw18/ngw18-frontend/apps/resources/statics/fonts/vwtext-regular.woff2', filename: 'VWText-Regular.woff2' },
    { family: 'VWText', weight: '700', url: 'https://www.volkswagen.com.au/etc.clientlibs/clientlibs/vwa-ngw18/ngw18-frontend/apps/resources/statics/fonts/vwtext-bold.woff2', filename: 'VWText-Bold.woff2' },
  ],
  'mitsubishi-au': [
    { family: 'MMC', weight: '400', url: 'https://www.mitsubishi-motors.com.au/etc.clientlibs/mmal/clientlibs/clientlib-core/resources/static/MMC-Regular.woff2', filename: 'MMC-Regular.woff2' },
    { family: 'MMC', weight: '500', url: 'https://www.mitsubishi-motors.com.au/etc.clientlibs/mmal/clientlibs/clientlib-core/resources/static/MMC-Medium.woff2', filename: 'MMC-Medium.woff2' },
    { family: 'MMC', weight: '700', url: 'https://www.mitsubishi-motors.com.au/etc.clientlibs/mmal/clientlibs/clientlib-core/resources/static/MMC-Bold.woff2', filename: 'MMC-Bold.woff2' },
  ],
  'mazda-au': [
    { family: 'MazdaType', weight: '400', url: 'https://www.mazda.com.au/assets/MazdaTypeTT-Regular.0d21eb65.woff2', filename: 'MazdaType-Regular.woff2' },
    { family: 'MazdaType', weight: '500', url: 'https://www.mazda.com.au/assets/MazdaTypeTT-Medium.9624f6d9.woff2', filename: 'MazdaType-Medium.woff2' },
    { family: 'MazdaType', weight: '600', url: 'https://www.mazda.com.au/assets/MazdaTypeTT-Bold.ab9454ad.woff2', filename: 'MazdaType-Bold.woff2' },
  ],
  'hyundai-au': [
    { family: 'HyundaiSansHead', weight: '300', url: 'https://www.hyundai.com/etc.clientlibs/hyundai/clientlibs/au/clientlib-site/resources/fonts/HyundaiSans/HyundaiSansHead-Light.woff2', filename: 'HyundaiSansHead-Light.woff2' },
    { family: 'HyundaiSansHead', weight: '400', url: 'https://www.hyundai.com/etc.clientlibs/hyundai/clientlibs/au/clientlib-site/resources/fonts/HyundaiSans/HyundaiSansHead-Regular.woff2', filename: 'HyundaiSansHead-Regular.woff2' },
    { family: 'HyundaiSansHead', weight: '500', url: 'https://www.hyundai.com/etc.clientlibs/hyundai/clientlibs/au/clientlib-site/resources/fonts/HyundaiSans/HyundaiSansHead-Medium.woff2', filename: 'HyundaiSansHead-Medium.woff2' },
    { family: 'HyundaiSansHead', weight: '700', url: 'https://www.hyundai.com/etc.clientlibs/hyundai/clientlibs/au/clientlib-site/resources/fonts/HyundaiSans/HyundaiSansHead-Bold.woff2', filename: 'HyundaiSansHead-Bold.woff2' },
    { family: 'HyundaiSansText', weight: '400', url: 'https://www.hyundai.com/etc.clientlibs/hyundai/clientlibs/au/clientlib-site/resources/fonts/HyundaiSans/HyundaiSansText-Regular.woff2', filename: 'HyundaiSansText-Regular.woff2' },
    { family: 'HyundaiSansText', weight: '500', url: 'https://www.hyundai.com/etc.clientlibs/hyundai/clientlibs/au/clientlib-site/resources/fonts/HyundaiSans/HyundaiSansText-Medium.woff2', filename: 'HyundaiSansText-Medium.woff2' },
    { family: 'HyundaiSansText', weight: '700', url: 'https://www.hyundai.com/etc.clientlibs/hyundai/clientlibs/au/clientlib-site/resources/fonts/HyundaiSans/HyundaiSansText-Bold.woff2', filename: 'HyundaiSansText-Bold.woff2' },
  ],
};

// Nissan is special — base64 embedded in CSS. Skip for now, handle manually.
// The other 10 OEMs use system fonts (no custom fonts to download).

const TEMP_DIR = '/tmp/oem-fonts';
const WORKER_NAME = 'oem-agent';
const BUCKET_NAME = 'oem-agent-assets';

async function downloadAndUpload() {
  mkdirSync(TEMP_DIR, { recursive: true });

  for (const [oemId, fonts] of Object.entries(FONTS)) {
    console.log(`\n=== ${oemId} (${fonts.length} fonts) ===`);
    const oemDir = `${TEMP_DIR}/${oemId}`;
    mkdirSync(oemDir, { recursive: true });

    for (const font of fonts) {
      const localPath = `${oemDir}/${font.filename}`;
      console.log(`  Downloading ${font.filename} (${font.family} ${font.weight})...`);

      try {
        const resp = await fetch(font.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
            'Accept': '*/*',
            'Referer': `https://www.${oemId.replace('-au', '')}.com.au/`,
          },
        });

        if (!resp.ok) {
          console.log(`    ⚠ HTTP ${resp.status} — skipping`);
          continue;
        }

        const buffer = Buffer.from(await resp.arrayBuffer());
        if (buffer.length < 1000) {
          console.log(`    ⚠ Too small (${buffer.length}B) — likely blocked`);
          continue;
        }

        writeFileSync(localPath, buffer);
        console.log(`    ✓ Downloaded (${Math.round(buffer.length / 1024)}KB)`);

        // Upload to R2
        const r2Key = `fonts/${oemId}/${font.filename}`;
        try {
          execSync(
            `npx wrangler r2 object put "${BUCKET_NAME}/${r2Key}" --file="${localPath}" --content-type="font/woff2"`,
            { stdio: 'pipe' }
          );
          console.log(`    ✓ Uploaded to R2: ${r2Key}`);
        } catch (e) {
          console.log(`    ✗ R2 upload failed: ${e.message?.slice(0, 100)}`);
        }
      } catch (e) {
        console.log(`    ✗ Download failed: ${e.message}`);
      }
    }
  }

  console.log('\n=== Done ===');
  console.log('Next: Run update-brand-tokens script to set font_faces in Supabase');
}

downloadAndUpload();
