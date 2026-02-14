#!/usr/bin/env node
/**
 * Extract remaining Ford Gallery Images
 * 
 * Processes only products that currently have 1 or fewer images.
 */

import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function extractGalleryImages(vehicleName) {
  const url = `https://www.ford.com.au/price/${vehicleName.replace(/\s+/g, '')}`;
  console.log(`  Extracting from: ${url}`);
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    
    const html = await page.content();
    
    // Extract GPAS cache image URLs
    const imageUrls = new Set();
    
    const pattern1 = /\/\/www\.gpas-cache\.ford\.com\/guid\/[^"\s>]+/g;
    const matches1 = html.match(pattern1) || [];
    matches1.forEach(url => imageUrls.add('https:' + url));
    
    const pattern2 = /https:\/\/www\.gpas-cache\.ford\.com\/guid\/[^"\s>]+/g;
    const matches2 = html.match(pattern2) || [];
    matches2.forEach(url => imageUrls.add(url));
    
    console.log(`  Found: ${imageUrls.size} images`);
    
    return [...imageUrls].map((url, index) => ({
      url,
      type: index < 30 ? 'exterior' : index < 60 ? 'interior' : 'gallery',
      category: 'gallery',
      alt: `${vehicleName} image ${index + 1}`,
      position: index + 1,
      source: 'ford_gpas_cache',
    }));
  } finally {
    await browser.close();
  }
}

async function updateProductGallery(productId, vehicleName, galleryImages) {
  const { data: product } = await supabase
    .from('products')
    .select('meta_json')
    .eq('id', productId)
    .single();
  
  const existingGallery = product.meta_json?.galleryImages || [];
  const existingHero = existingGallery.find(img => img.type === 'hero');
  
  const newGallery = [];
  if (existingHero?.url) newGallery.push(existingHero);
  
  for (const img of galleryImages) {
    if (img.url && !newGallery.some(g => g.url === img.url)) {
      newGallery.push(img);
    }
  }
  
  const updatedMeta = {
    ...product.meta_json,
    galleryImages: newGallery,
    galleryImageCount: newGallery.length,
    galleryUpdatedAt: new Date().toISOString(),
  };
  
  await supabase
    .from('products')
    .update({ meta_json: updatedMeta, gallery_image_count: newGallery.length })
    .eq('id', productId);
  
  console.log(`  Updated: ${newGallery.length} total images`);
}

async function main() {
  console.log('=== Extracting Remaining Ford Gallery Images ===\n');
  
  const { data: products } = await supabase
    .from('products')
    .select('id, title')
    .eq('oem_id', 'ford-au')
    .order('title');
  
  // Filter to products with 1 or fewer images
  const productsToProcess = [];
  for (const product of products) {
    const { data: p } = await supabase
      .from('products')
      .select('meta_json')
      .eq('id', product.id)
      .single();
    
    const gallery = p.meta_json?.galleryImages || [];
    const realImages = gallery.filter(img => img.url && !img.note?.includes('placeholder')).length;
    
    if (realImages <= 1) {
      productsToProcess.push(product);
    }
  }
  
  console.log(`Processing ${productsToProcess.length} products with <=1 images\n`);
  
  let processed = 0;
  let succeeded = 0;
  
  for (const product of productsToProcess) {
    processed++;
    console.log(`[${processed}/${productsToProcess.length}] ${product.title}`);
    
    try {
      const galleryImages = await extractGalleryImages(product.title);
      if (galleryImages.length > 0) {
        await updateProductGallery(product.id, product.title, galleryImages);
        succeeded++;
      }
    } catch (error) {
      console.error(`  Error:`, error.message);
    }
    
    // Short delay between requests
    if (processed < productsToProcess.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`Processed: ${processed}`);
  console.log(`Succeeded: ${succeeded}`);
}

main().catch(console.error);
