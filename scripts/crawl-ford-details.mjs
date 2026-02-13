/**
 * Use Cloudflare Puppeteer to crawl Ford Build & Price pages
 * Extracts colors, variants, and gallery images
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Cloudflare Browser Rendering API
const BROWSER_API_URL = `https://production.cloudflareworkers.com/browser-rendering`;

async function crawlWithBrowser(url) {
  console.log(`  Crawling: ${url}`);
  
  try {
    // Use Cloudflare's browser rendering
    const response = await fetch(BROWSER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CF_BROWSER_TOKEN || ''}`,
      },
      body: JSON.stringify({
        url,
        viewport: { width: 1920, height: 1080 },
        waitFor: 5000, // Wait for JS to load
        executeJavaScript: true,
      }),
    });

    if (!response.ok) {
      // Fallback: try direct fetch with headers
      return await crawlDirect(url);
    }

    const result = await response.json();
    return result.html;
  } catch (error) {
    console.log(`  Browser API failed: ${error.message}`);
    return await crawlDirect(url);
  }
}

async function crawlDirect(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
    });
    return await response.text();
  } catch (error) {
    console.log(`  Direct fetch failed: ${error.message}`);
    return null;
  }
}

function extractDataFromHTML(html, vehicleName) {
  const data = {
    colors: [],
    variants: [],
    images: [],
  };

  try {
    // Extract colors from JSON in script tags
    const colorMatches = html.match(/"colors"\s*:\s*(\[[^\]]+\])/gi);
    if (colorMatches) {
      for (const match of colorMatches) {
        try {
          const colorsJson = match.replace(/"colors"\s*:\s*/, '');
          const colors = JSON.parse(colorsJson);
          if (Array.isArray(colors)) {
            data.colors.push(...colors.map(c => ({
              name: c.name || c.label,
              code: c.code,
              hex: c.hex,
              price: c.price || 0,
              image: c.image || c.swatchImage,
            })));
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    // Extract variants/grades
    const variantMatches = html.match(/"series"\s*:\s*(\[[^\]]+\])/gi) || 
                           html.match(/"grades"\s*:\s*(\[[^\]]+\])/gi) ||
                           html.match(/"trims"\s*:\s*(\[[^\]]+\])/gi);
    if (variantMatches) {
      for (const match of variantMatches) {
        try {
          const variantsJson = match.replace(/"(series|grades|trims)"\s*:\s*/, '');
          const variants = JSON.parse(variantsJson);
          if (Array.isArray(variants)) {
            data.variants.push(...variants.map(v => ({
              name: v.name || v.title || v.gradeName,
              code: v.code || v.id,
              price: v.msrp || v.price || v.driveAwayPrice,
              engine: v.engine || v.powerTrain,
              transmission: v.transmission,
            })));
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    // Extract image URLs
    const imgMatches = html.match(/https:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi);
    if (imgMatches) {
      data.images = [...new Set(imgMatches)].slice(0, 20); // Deduplicate and limit
    }

    return data;
  } catch (error) {
    console.log(`  Error extracting data: ${error.message}`);
    return data;
  }
}

async function crawlFordVehicle(vehicleCode, vehicleName) {
  // Try Build & Price page
  const urls = [
    `https://www.ford.com.au/price/${vehicleCode}`,
    `https://www.ford.com.au/showroom/${vehicleCode.toLowerCase().replace(/_/g, '-')}`,
    `https://www.ford.com.au/showroom/trucks-and-vans/${vehicleCode.toLowerCase().replace(/_/g, '-')}`,
  ];

  for (const url of urls) {
    const html = await crawlWithBrowser(url);
    if (html) {
      const data = extractDataFromHTML(html, vehicleName);
      if (data.colors.length > 0 || data.variants.length > 0) {
        console.log(`    ✓ Found ${data.colors.length} colors, ${data.variants.length} variants, ${data.images.length} images`);
        return data;
      }
    }
  }

  return null;
}

async function main() {
  console.log('=== Crawling Ford Details with Cloudflare Browser ===\n');

  // Get Ford products
  const { data: products, error } = await supabase
    .from('products')
    .select('id, title, external_key, meta_json')
    .eq('oem_id', 'ford-au')
    .is('meta_json->>enriched', null); // Only non-enriched

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log(`Found ${products.length} products to enrich\n`);

  // Priority vehicles
  const priorityModels = ['Ranger', 'Everest', 'Mustang', 'F-150', 'Transit Custom'];
  const toEnrich = products.filter(p => 
    priorityModels.some(pm => p.title.includes(pm))
  );

  console.log(`Enriching ${toEnrich.length} priority vehicles...\n`);

  let enriched = 0;
  let variantProductsCreated = 0;

  for (const product of toEnrich.slice(0, 5)) { // Limit to 5 to avoid timeout
    console.log(`${product.title} (${product.external_key})`);
    
    const data = await crawlFordVehicle(product.external_key, product.title);
    
    if (!data || (data.colors.length === 0 && data.variants.length === 0)) {
      console.log(`  ❌ No data found\n`);
      continue;
    }

    // Update product
    const { error: updateError } = await supabase
      .from('products')
      .update({
        meta_json: {
          ...product.meta_json,
          enriched: true,
          enrichedAt: new Date().toISOString(),
          availableColors: data.colors,
          colorCount: data.colors.length,
          galleryImages: data.images.map(url => ({ url, type: 'gallery' })),
          galleryImageCount: data.images.length,
          variants: data.variants,
          variantCount: data.variants.length,
        },
        variants: data.variants,
      })
      .eq('id', product.id);

    if (updateError) {
      console.log(`  ❌ Update failed: ${updateError.message}\n`);
      continue;
    }

    console.log(`  ✅ Enriched\n`);
    enriched++;

    // Create variant products
    for (const variant of data.variants) {
      const variantTitle = `${product.title} ${variant.name}`;
      
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('oem_id', 'ford-au')
        .eq('title', variantTitle)
        .single();
      
      if (existing) continue;

      const { error: insertError } = await supabase
        .from('products')
        .insert({
          oem_id: 'ford-au',
          external_key: variant.code,
          title: variantTitle,
          body_type: product.meta_json?.category,
          price_amount: variant.price,
          price_currency: 'AUD',
          price_type: 'driveaway',
          fuel_type: variant.engine,
          availability: 'available',
          meta_json: {
            parentNameplate: product.title,
            parentExternalKey: product.external_key,
            variantName: variant.name,
            engine: variant.engine,
            transmission: variant.transmission,
          },
          last_seen_at: new Date().toISOString(),
        });

      if (!insertError) {
        variantProductsCreated++;
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Products enriched: ${enriched}`);
  console.log(`Variant products created: ${variantProductsCreated}`);
}

main().catch(console.error);
