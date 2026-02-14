#!/usr/bin/env node
/**
 * Extract Ford Gallery Images from Pricing Pages
 * 
 * Uses Puppeteer to capture the GPAS cache image URLs embedded in the HTML.
 * Ford stores vehicle images in gpas-cache.ford.com with GUID-based URLs.
 */

import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Extract gallery images from Ford pricing page
 */
async function extractGalleryImages(vehicleName) {
  const url = `https://www.ford.com.au/price/${vehicleName.replace(/\s+/g, '')}`;
  
  console.log(`[Extract] ${vehicleName}: ${url}`);
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to page
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    
    // Wait for content to load
    await new Promise(r => setTimeout(r, 3000));
    
    // Get HTML content
    const html = await page.content();
    
    // Extract GPAS cache image URLs
    const imageUrls = new Set();
    
    // Pattern 1: Protocol-relative URLs
    const pattern1 = /\/\/www\.gpas-cache\.ford\.com\/guid\/[^"\s>]+/g;
    const matches1 = html.match(pattern1) || [];
    matches1.forEach(url => imageUrls.add('https:' + url));
    
    // Pattern 2: Full HTTPS URLs
    const pattern2 = /https:\/\/www\.gpas-cache\.ford\.com\/guid\/[^"\s>]+/g;
    const matches2 = html.match(pattern2) || [];
    matches2.forEach(url => imageUrls.add(url));
    
    // Extract image metadata from the page context
    const images = await page.evaluate(() => {
      const imgData = [];
      
      // Look for image data in the window object or embedded JSON
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent;
        if (text.includes('images') || text.includes('gallery')) {
          // Try to find image data structures
          const matches = text.match(/"images":\s*({.+?})/s);
          if (matches) {
            try {
              const data = JSON.parse('{"images":' + matches[1] + '}');
              return data.images;
            } catch (e) {}
          }
        }
      }
      
      return null;
    });
    
    console.log(`[Extract] ${vehicleName}: Found ${imageUrls.size} unique images`);
    
    // Build gallery structure
    const galleryImages = [...imageUrls].map((url, index) => {
      // Try to determine image type from URL or context
      const urlLower = url.toLowerCase();
      let type = 'gallery';
      
      if (urlLower.includes('exterior') || index < 30) {
        type = 'exterior';
      } else if (urlLower.includes('interior') || (index >= 30 && index < 60)) {
        type = 'interior';
      } else if (urlLower.includes('detail') || urlLower.includes('feature')) {
        type = 'detail';
      }
      
      return {
        url,
        type,
        category: type,
        alt: `${vehicleName} ${type} image ${index + 1}`,
        position: index + 1,
        source: 'ford_gpas_cache',
      };
    });
    
    return galleryImages;
    
  } finally {
    await browser.close();
  }
}

/**
 * Update product gallery in database
 */
async function updateProductGallery(productId, vehicleName, galleryImages) {
  // Get current product
  const { data: product, error: fetchError } = await supabase
    .from('products')
    .select('meta_json')
    .eq('id', productId)
    .single();
  
  if (fetchError) {
    console.error(`[DB] Error fetching ${vehicleName}:`, fetchError.message);
    return false;
  }
  
  // Build new gallery
  const existingGallery = product.meta_json?.galleryImages || [];
  const existingHero = existingGallery.find(img => img.type === 'hero');
  
  const newGallery = [];
  
  // Keep hero if exists
  if (existingHero && existingHero.url) {
    newGallery.push(existingHero);
  }
  
  // Add extracted images
  for (const img of galleryImages) {
    if (img.url && !newGallery.some(g => g.url === img.url)) {
      newGallery.push(img);
    }
  }
  
  // Update meta_json
  const updatedMeta = {
    ...product.meta_json,
    galleryImages: newGallery,
    galleryImageCount: newGallery.length,
    galleryUpdatedAt: new Date().toISOString(),
    gallerySource: 'ford_pricing_page_extraction',
  };
  
  const { error: updateError } = await supabase
    .from('products')
    .update({ 
      meta_json: updatedMeta,
      gallery_image_count: newGallery.length,
    })
    .eq('id', productId);
  
  if (updateError) {
    console.error(`[DB] Error updating ${vehicleName}:`, updateError.message);
    return false;
  }
  
  console.log(`[DB] Updated ${vehicleName}: ${newGallery.length} total images`);
  return true;
}

/**
 * Main function
 */
async function main() {
  console.log('=== Ford Gallery Image Extraction ===\n');
  
  // Get Ford products
  const { data: products, error } = await supabase
    .from('products')
    .select('id, title, external_key')
    .eq('oem_id', 'ford-au')
    .order('title');
  
  if (error) {
    console.error('Error fetching products:', error);
    return;
  }
  
  console.log(`Found ${products.length} Ford products\n`);
  
  // Priority order
  const priority = ['Ranger', 'Everest', 'Mustang', 'F-150', 'Transit'];
  products.sort((a, b) => {
    const aIdx = priority.findIndex(p => a.title?.includes(p));
    const bIdx = priority.findIndex(p => b.title?.includes(p));
    if (aIdx === -1 && bIdx === -1) return a.title.localeCompare(b.title);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
  
  // Process each product
  let processed = 0;
  let succeeded = 0;
  
  for (const product of products) {
    console.log(`\n[${processed + 1}/${products.length}] Processing ${product.title}...`);
    
    try {
      const galleryImages = await extractGalleryImages(product.title);
      
      if (galleryImages.length > 0) {
        const updated = await updateProductGallery(product.id, product.title, galleryImages);
        if (updated) succeeded++;
      } else {
        console.log(`[Skip] ${product.title}: No images found`);
      }
    } catch (error) {
      console.error(`[Error] ${product.title}:`, error.message);
    }
    
    processed++;
    
    // Delay between requests (every 3 products, add a longer delay)
    if (processed % 3 === 0 && processed < products.length) {
      console.log('[Delay] Waiting 10 seconds before next batch...');
      await new Promise(r => setTimeout(r, 10000));
    } else if (processed < products.length) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`Processed: ${processed}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${processed - succeeded}`);
}

main().catch(console.error);
