/**
 * GWM Australia Vehicle Color Discovery Probe
 *
 * Investigates color data from GWM's Storyblok CMS and gwmanz.com
 * DISCOVERY ONLY - does not write to database
 */

import https from 'https';
import { JSDOM } from 'jsdom';
import { createClient } from '@supabase/supabase-js';

const GWMANZ_URL = 'https://www.gwmanz.com';
const STORYBLOK_CDN = 'https://api.storyblok.com/v2/cdn';

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json,text/html'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ data, statusCode: res.statusCode }));
    }).on('error', reject);
  });
}

async function extractStoryblokToken() {
  console.log('🔍 Extracting Storyblok token from gwmanz.com...');

  const testUrls = [
    'https://www.gwmanz.com/au/',
    'https://www.gwmanz.com/au/vehicles/'
  ];

  for (const url of testUrls) {
    try {
      const { data: html, statusCode } = await httpsGet(url);

      if (statusCode !== 200) {
        console.log(`   ❌ ${url} (${statusCode})`);
        continue;
      }

      // Look for Storyblok token in various patterns
      const patterns = [
        /api\.storyblok\.com[^"']*token=([a-zA-Z0-9_-]+)/gi,
        /"apiOptions"[^}]*"accessToken":\s*"([^"]+)"/gi,
        /storyblok[^}]*token[^:]*:\s*["']([a-zA-Z0-9_-]{20,})["']/gi,
        /__NUXT__[^}]*token["']?\s*:\s*["']([a-zA-Z0-9_-]{20,})["']/gi
      ];

      for (const regex of patterns) {
        const match = regex.exec(html);
        if (match) {
          console.log(`   ✅ Found token: ${match[1].substring(0, 20)}...`);
          return match[1];
        }
      }

      // Check script tags for embedded data
      const dom = new JSDOM(html);
      const scripts = dom.window.document.querySelectorAll('script');

      for (const script of scripts) {
        const content = script.textContent || '';
        if (content.includes('storyblok')) {
          for (const regex of patterns) {
            const match = regex.exec(content);
            if (match) {
              console.log(`   ✅ Found token in script: ${match[1].substring(0, 20)}...`);
              return match[1];
            }
          }
        }
      }

    } catch (error) {
      console.log(`   ❌ Error fetching ${url}: ${error.message}`);
    }
  }

  console.log('   ❌ Could not extract token from any page');
  return null;
}

async function probeStoryblokModels(token) {
  console.log('\n📦 Probing Storyblok API for models...');

  if (!token) {
    console.log('   ⏭️  No token, skipping');
    return null;
  }

  const endpoints = [
    `${STORYBLOK_CDN}/stories?content_type=AUModel&token=${token}`,
    `${STORYBLOK_CDN}/stories?starts_with=au/vehicles&token=${token}`,
    `${STORYBLOK_CDN}/stories?token=${token}&per_page=100`
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`   📡 Trying: ${endpoint.substring(0, 80)}...`);
      const { data, statusCode } = await httpsGet(endpoint);

      if (statusCode === 200) {
        const json = JSON.parse(data);
        console.log(`   ✅ Success! Found ${json.stories?.length || 0} stories`);

        if (json.stories && json.stories.length > 0) {
          // Analyze color data structure
          const colorFindings = [];

          for (const story of json.stories.slice(0, 5)) {
            const storyStr = JSON.stringify(story);
            const hasColors = storyStr.toLowerCase().includes('color') ||
                            storyStr.toLowerCase().includes('colour');

            if (hasColors) {
              const colorData = {
                name: story.name || story.slug,
                slug: story.slug,
                colorFields: []
              };

              // Extract color-related fields
              const content = story.content || story;
              const findColors = (obj, path = '') => {
                for (const [key, value] of Object.entries(obj)) {
                  const fullPath = path ? `${path}.${key}` : key;

                  if (key.toLowerCase().includes('color') || key.toLowerCase().includes('colour')) {
                    colorData.colorFields.push({
                      path: fullPath,
                      type: Array.isArray(value) ? 'array' : typeof value,
                      sample: typeof value === 'string' ? value.substring(0, 100) :
                             Array.isArray(value) ? `Array(${value.length})` :
                             typeof value === 'object' ? Object.keys(value).join(',') : value
                    });
                  }

                  if (value && typeof value === 'object' && !Array.isArray(value)) {
                    findColors(value, fullPath);
                  }
                }
              };

              findColors(content);
              if (colorData.colorFields.length > 0) {
                colorFindings.push(colorData);
              }
            }
          }

          return {
            token,
            stories: json.stories,
            colorFindings
          };
        }

        return { token, stories: json.stories, colorFindings: [] };
      }

      console.log(`   ❌ Status ${statusCode}`);

    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }

  return null;
}

async function probeModelPages() {
  console.log('\n🌐 Probing vehicle model pages on gwmanz.com...');

  // Get models from database
  const { data: models } = await supabase
    .from('vehicle_models')
    .select('slug, name')
    .eq('oem_id', 'gwm-au')
    .limit(5);

  if (!models || models.length === 0) {
    console.log('   ❌ No GWM models found in database');
    return [];
  }

  console.log(`   Found ${models.length} models in database`);

  const findings = [];

  // Map model slugs to actual URL patterns on gwmanz.com
  const urlMap = {
    'ute': 'ute/cannon',
    'cannon': 'ute/cannon',
    'cannon-alpha': 'ute/cannon-alpha',
    'tank-300': 'suv/tank-300',
    'tank-500': 'suv/tank-500',
    'haval-h6': 'suv/haval-h6',
    'haval-jolion': 'suv/haval-jolion',
    'ora-gt': 'hatchback/ora'
  };

  for (const model of models) {
    const modelPath = urlMap[model.slug] || `suv/${model.slug}`;
    const url = `${GWMANZ_URL}/au/models/${modelPath}/`;
    console.log(`\n   🔍 ${model.name}: ${url}`);

    try {
      const { data: html, statusCode } = await httpsGet(url);

      if (statusCode !== 200) {
        console.log(`      ❌ Status ${statusCode}`);
        continue;
      }

      const dom = new JSDOM(html);
      const doc = dom.window.document;

      const modelFindings = {
        model: model.slug,
        name: model.name,
        colorSwatches: [],
        colorData: [],
        configuratorLinks: []
      };

      // Look for color swatches
      const swatchSelectors = [
        '.color-swatch',
        '[class*="colour"]',
        '[class*="color"]',
        '[data-color]',
        '.paint-option',
        '.exterior-color'
      ];

      for (const selector of swatchSelectors) {
        const elements = doc.querySelectorAll(selector);
        if (elements.length > 0) {
          modelFindings.colorSwatches.push({
            selector,
            count: elements.length,
            samples: Array.from(elements).slice(0, 3).map(el => ({
              html: el.outerHTML.substring(0, 200),
              text: el.textContent?.trim().substring(0, 50)
            }))
          });
        }
      }

      // Look for configurator/build links
      const links = doc.querySelectorAll('a[href*="config"], a[href*="build"], a[href*="customise"]');
      modelFindings.configuratorLinks = Array.from(links).map(a => a.href);

      // Extract JSON data from scripts
      const scripts = doc.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent || '';
        if (content.includes('color') || content.includes('colour')) {
          const colorMatch = content.match(/"colors?":\s*\[([^\]]+)\]/gi);
          if (colorMatch) {
            modelFindings.colorData.push(...colorMatch.map(m => m.substring(0, 200)));
          }
        }
      }

      findings.push(modelFindings);

    } catch (error) {
      console.log(`      ❌ Error: ${error.message}`);
    }

    await new Promise(r => setTimeout(r, 1000)); // Rate limit
  }

  return findings;
}

// Main execution
console.log('🚗 GWM Australia Vehicle Color Discovery Probe');
console.log('='.repeat(60));

// Phase 1: Extract Storyblok token
const token = await extractStoryblokToken();

// Phase 2: Probe Storyblok API
const storyblokData = await probeStoryblokModels(token);

// Phase 3: Probe model pages
const modelPageFindings = await probeModelPages();

// Summary Report
console.log('\n' + '='.repeat(60));
console.log('📊 DISCOVERY SUMMARY');
console.log('='.repeat(60));

console.log(`\n🔑 Storyblok Token: ${token ? '✅ Found' : '❌ Not found'}`);

if (storyblokData) {
  console.log(`📦 Storyblok Stories: ${storyblokData.stories?.length || 0} total`);
  console.log(`🎨 Stories with color data: ${storyblokData.colorFindings?.length || 0}`);
}

console.log(`\n🌐 Model Pages Probed: ${modelPageFindings.length}`);
const pagesWithColors = modelPageFindings.filter(f =>
  f.colorSwatches.length > 0 || f.colorData.length > 0
).length;
console.log(`🎨 Pages with color data: ${pagesWithColors}`);

// Detailed Findings
console.log('\n' + '='.repeat(60));
console.log('🔍 DETAILED FINDINGS');
console.log('='.repeat(60));

if (storyblokData?.colorFindings && storyblokData.colorFindings.length > 0) {
  console.log('\n📦 STORYBLOK COLOR DATA:');
  for (const finding of storyblokData.colorFindings) {
    console.log(`\n   ${finding.name} (${finding.slug})`);
    for (const field of finding.colorFields) {
      console.log(`      ${field.path} (${field.type}): ${field.sample}`);
    }
  }
}

if (pagesWithColors > 0) {
  console.log('\n🌐 MODEL PAGE COLOR DATA:');
  for (const finding of modelPageFindings) {
    if (finding.colorSwatches.length > 0 || finding.colorData.length > 0) {
      console.log(`\n   📌 ${finding.name.toUpperCase()}`);

      if (finding.colorSwatches.length > 0) {
        console.log('      Color swatches:');
        for (const swatch of finding.colorSwatches) {
          console.log(`         ${swatch.selector} (${swatch.count} elements)`);
          swatch.samples.forEach((s, i) => {
            console.log(`            [${i}] ${s.text || 'no text'}`);
          });
        }
      }

      if (finding.colorData.length > 0) {
        console.log('      Color JSON data:');
        finding.colorData.forEach((cd, i) => {
          console.log(`         [${i}] ${cd}`);
        });
      }

      if (finding.configuratorLinks.length > 0) {
        console.log('      Configurator links:');
        finding.configuratorLinks.forEach(link => {
          console.log(`         ${link}`);
        });
      }
    }
  }
}

console.log('\n✅ Probe complete');
