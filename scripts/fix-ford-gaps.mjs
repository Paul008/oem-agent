/**
 * Fix Ford Database Gaps
 * 
 * Addresses issues identified in E2E testing:
 * 1. Set base product prices (use lowest variant price)
 * 2. Ensure all base products have variant lists
 * 3. Fix category inconsistencies
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fixFordGaps() {
  console.log('=== Fixing Ford Database Gaps ===\n');

  // Get all Ford products
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', 'ford-au');

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  let fixes = {
    basePrices: 0,
    variantLists: 0,
    categories: 0,
    errors: 0,
  };

  // Fix 1: Set base product prices from lowest variant
  console.log('1. Setting base product prices...');
  const baseVehicles = ['Ranger', 'Everest', 'Mustang', 'F-150'];

  for (const baseName of baseVehicles) {
    const baseProduct = products.find(p => p.title === baseName);
    if (!baseProduct) {
      console.log(`  ⚠️ Base product not found: ${baseName}`);
      continue;
    }

    // Find all variants for this base
    const variants = products.filter(p => 
      p.title.startsWith(baseName + ' ') && 
      p.title !== baseName &&
      p.price_amount
    );

    if (variants.length === 0) {
      console.log(`  ⚠️ No variants found for ${baseName}`);
      continue;
    }

    // Get lowest price
    const lowestPrice = Math.min(...variants.map(v => v.price_amount));
    const lowestVariant = variants.find(v => v.price_amount === lowestPrice);

    console.log(`  ${baseName}: $${lowestPrice} (from ${lowestVariant.title})`);

    // Update base product
    const { error: updateError } = await supabase
      .from('products')
      .update({
        price_amount: lowestPrice,
        price_raw_string: `$${lowestPrice.toLocaleString()}`,
        price_type: 'driveaway (starting from)',
        meta_json: {
          ...baseProduct.meta_json,
          startingPrice: lowestPrice,
          priceSource: 'lowest_variant',
          variantCount: variants.length,
        },
      })
      .eq('id', baseProduct.id);

    if (updateError) {
      console.error(`  ❌ Error updating ${baseName}:`, updateError);
      fixes.errors++;
    } else {
      console.log(`  ✅ Updated ${baseName}`);
      fixes.basePrices++;
    }
  }

  // Fix 2: Ensure base products have variant lists
  console.log('\n2. Ensuring base products have variant lists...');

  for (const baseName of baseVehicles) {
    const baseProduct = products.find(p => p.title === baseName);
    if (!baseProduct) continue;

    // Find all variants
    const variants = products.filter(p => 
      p.title.startsWith(baseName + ' ') && 
      p.title !== baseName
    );

    if (variants.length === 0) continue;

    const variantList = variants.map(v => ({
      name: v.title.replace(baseName + ' ', ''),
      code: v.external_key,
      price: v.price_amount,
      engine: v.meta_json?.engine,
      transmission: v.meta_json?.transmission,
    }));

    // Check if update needed
    const currentVariants = baseProduct.variants || [];
    if (currentVariants.length === variantList.length) {
      console.log(`  ✓ ${baseName} already has ${variantList.length} variants`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('products')
      .update({
        variants: variantList,
        meta_json: {
          ...baseProduct.meta_json,
          variantCount: variantList.length,
          hasVariantData: true,
        },
      })
      .eq('id', baseProduct.id);

    if (updateError) {
      console.error(`  ❌ Error updating ${baseName}:`, updateError);
      fixes.errors++;
    } else {
      console.log(`  ✅ Updated ${baseName} with ${variantList.length} variants`);
      fixes.variantLists++;
    }
  }

  // Fix 3: Fix category inconsistencies
  console.log('\n3. Fixing category inconsistencies...');
  
  const categoryFixes = [
    { from: 'Truck', to: 'Trucks' },
  ];

  for (const { from, to } of categoryFixes) {
    const productsToFix = products.filter(p => p.body_type === from);
    
    for (const product of productsToFix) {
      const { error: updateError } = await supabase
        .from('products')
        .update({ body_type: to })
        .eq('id', product.id);

      if (updateError) {
        console.error(`  ❌ Error updating ${product.title}:`, updateError);
        fixes.errors++;
      } else {
        console.log(`  ✅ ${product.title}: ${from} → ${to}`);
        fixes.categories++;
      }
    }
  }

  // Summary
  console.log('\n=== Fix Summary ===');
  console.log(`Base prices set: ${fixes.basePrices}`);
  console.log(`Variant lists updated: ${fixes.variantLists}`);
  console.log(`Categories fixed: ${fixes.categories}`);
  console.log(`Errors: ${fixes.errors}`);

  // Final database state
  console.log('\n=== Final Database State ===');
  const { data: finalProducts } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', 'ford-au');

  const withPrice = finalProducts.filter(p => p.price_amount).length;
  const withVariants = finalProducts.filter(p => p.variants && p.variants.length > 0).length;
  const withColors = finalProducts.filter(p => p.meta_json?.availableColors && p.meta_json.availableColors.length > 0).length;

  console.log(`Total products: ${finalProducts.length}`);
  console.log(`With price: ${withPrice}/${finalProducts.length} (${Math.round(withPrice/finalProducts.length*100)}%)`);
  console.log(`With variants: ${withVariants}/${finalProducts.length} (${Math.round(withVariants/finalProducts.length*100)}%)`);
  console.log(`With colors: ${withColors}/${finalProducts.length} (${Math.round(withColors/finalProducts.length*100)}%)`);
}

fixFordGaps();
