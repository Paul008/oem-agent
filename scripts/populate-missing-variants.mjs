/**
 * Populate Missing Ford Variants
 * 
 * Adds variants for models that don't have them yet:
 * - Ranger Raptor (separate from base Raptor)
 * - Ranger Hybrid
 * - Ranger Super Duty
 * - Mustang Mach-E
 * - E-Transit
 * - E-Transit Custom
 * - Transit Custom PHEV
 * - Transit Van/Bus/Cab Chassis
 * - Tourneo
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Missing variant data based on Ford AU specs
const missingVariants = {
  // Mustang Mach-E variants (2024)
  'Mustang Mach-E': [
    {
      name: 'Select',
      code: 'mach-e-select',
      price: 79990,
      engine: 'Electric Motor',
      power: '198kW',
      torque: '430Nm',
      range: '470km',
      features: ['19" Alloy Wheels', '10.2" Digital Cluster', '15.5" Touchscreen', 'Co-Pilot360', 'Panoramic Roof'],
    },
    {
      name: 'Premium',
      code: 'mach-e-premium',
      price: 87990,
      engine: 'Dual Electric Motors (AWD)',
      power: '258kW',
      torque: '580Nm',
      range: '600km',
      features: ['19" Alloy Wheels', 'B&O Sound System', 'Heated Seats', '360° Camera', 'Active Park Assist'],
    },
    {
      name: 'GT',
      code: 'mach-e-gt',
      price: 109990,
      engine: 'Dual Electric Motors (Performance)',
      power: '358kW',
      torque: '860Nm',
      range: '500km',
      features: ['20" Alloy Wheels', 'MagneRide Suspension', 'Performance Seats', 'Active Exhaust Sound', 'Brembo Brakes'],
    },
  ],

  // E-Transit variants
  'E-Transit': [
    {
      name: 'Van 350L',
      code: 'e-transit-350l',
      price: 74990,
      engine: 'Electric Motor',
      power: '198kW',
      torque: '430Nm',
      range: '307km',
      payload: '1,758kg',
      features: ['12" Touchscreen', 'Pro Power Onboard', 'Load Through Bulkhead', 'Side Load Doors', 'Rear Camera'],
    },
    {
      name: 'Van 430L',
      code: 'e-transit-430l',
      price: 79990,
      engine: 'Electric Motor',
      power: '198kW',
      torque: '430Nm',
      range: '295km',
      payload: '1,575kg',
      features: ['High Roof', '12" Touchscreen', 'Pro Power Onboard', 'Cargo Area Lighting', 'Rear Camera'],
    },
    {
      name: 'Cab Chassis 430',
      code: 'e-transit-chassis',
      price: 76990,
      engine: 'Electric Motor',
      power: '198kW',
      torque: '430Nm',
      range: '285km',
      gvm: '4,250kg',
      features: ['12" Touchscreen', 'Pro Power Onboard', 'Tow Bar', 'Rear Camera', 'Cruise Control'],
    },
  ],

  // E-Transit Custom variants
  'E-Transit Custom': [
    {
      name: 'Van',
      code: 'e-transit-custom-van',
      price: 69990,
      engine: 'Electric Motor',
      power: '160kW',
      torque: '415Nm',
      range: '370km',
      features: ['13" Touchscreen', 'Pro Power Onboard 2.3kW', 'Dual Side Doors', 'Load Through Bulkhead', 'Rear Camera'],
    },
    {
      name: 'Double Cab Van',
      code: 'e-transit-custom-double',
      price: 72990,
      engine: 'Electric Motor',
      power: '160kW',
      torque: '415Nm',
      range: '360km',
      features: ['5 Seats', '13" Touchscreen', 'Pro Power Onboard', 'Cargo Mesh Bulkhead', 'Rear Camera'],
    },
  ],

  // Transit Custom PHEV variants
  'Transit Custom PHEV': [
    {
      name: 'Trend Van',
      code: 'transit-custom-phev-trend',
      price: 67990,
      engine: '2.5L PHEV',
      power: '170kW',
      torque: '415Nm',
      range: '500km (hybrid)',
      features: ['13" Touchscreen', 'Pro Power Onboard', 'Dual Side Doors', 'Rear Camera', 'Cruise Control'],
    },
    {
      name: 'Sport Van',
      code: 'transit-custom-phev-sport',
      price: 71990,
      engine: '2.5L PHEV',
      power: '170kW',
      torque: '415Nm',
      range: '500km (hybrid)',
      features: ['Sport Styling', '13" Touchscreen', 'Pro Power Onboard', 'LED Headlights', 'Rear Camera'],
    },
  ],

  // Transit Van variants
  'Transit Van': [
    {
      name: '350L',
      code: 'transit-van-350l',
      price: 56990,
      engine: '2.0L EcoBlue Diesel',
      power: '125kW',
      torque: '390Nm',
      payload: '1,474kg',
      features: ['8" Touchscreen', 'Side Load Door', 'Rear Camera', 'Cruise Control', 'Air Conditioning'],
    },
    {
      name: '430E',
      code: 'transit-van-430e',
      price: 62990,
      engine: '2.0L EcoBlue Diesel',
      power: '136kW',
      torque: '430Nm',
      payload: '1,280kg',
      features: ['High Roof', '8" Touchscreen', 'Dual Side Doors', 'Rear Camera', 'Park Sensors'],
    },
    {
      name: '470E',
      code: 'transit-van-470e',
      price: 67990,
      engine: '2.0L EcoBlue Diesel',
      power: '136kW',
      torque: '430Nm',
      payload: '1,100kg',
      features: ['High Roof Extended', '8" Touchscreen', 'Dual Side Doors', 'Rear Camera', 'Lane Keeping'],
    },
  ],

  // Transit Bus variants
  'Transit Bus': [
    {
      name: '410L 12-Seat',
      code: 'transit-bus-410l',
      price: 69990,
      engine: '2.0L EcoBlue Diesel',
      power: '136kW',
      torque: '430Nm',
      seats: 12,
      features: ['High Roof', '8" Touchscreen', 'Rear Camera', 'Dual AC', 'Cruise Control'],
    },
    {
      name: '460L 15-Seat',
      code: 'transit-bus-460l',
      price: 75990,
      engine: '2.0L EcoBlue Diesel',
      power: '136kW',
      torque: '430Nm',
      seats: 15,
      features: ['High Roof Extended', '8" Touchscreen', 'Rear Camera', 'Dual AC', 'Lane Keeping'],
    },
  ],

  // Transit Cab Chassis variants
  'Transit Cab Chassis': [
    {
      name: '350',
      code: 'transit-chassis-350',
      price: 58990,
      engine: '2.0L EcoBlue Diesel',
      power: '125kW',
      torque: '390Nm',
      gvm: '3,500kg',
      gcm: '7,000kg',
      features: ['8" Touchscreen', 'Rear Camera', 'Cruise Control', 'Tow Bar', 'Trailer Sway Control'],
    },
    {
      name: '430',
      code: 'transit-chassis-430',
      price: 63990,
      engine: '2.0L EcoBlue Diesel',
      power: '136kW',
      torque: '430Nm',
      gvm: '4,250kg',
      gcm: '8,000kg',
      features: ['8" Touchscreen', 'Rear Camera', 'Cruise Control', 'Tow Bar', 'Hill Start Assist'],
    },
  ],

  // Tourneo variants
  'Tourneo': [
    {
      name: 'Trend',
      code: 'tourneo-trend',
      price: 51990,
      engine: '2.0L EcoBlue Diesel',
      power: '100kW',
      torque: '360Nm',
      seats: 8,
      features: ['8" Touchscreen', 'Rear Camera', 'Dual Side Doors', 'Rear AC', 'Cruise Control'],
    },
    {
      name: 'Sport',
      code: 'tourneo-sport',
      price: 56990,
      engine: '2.0L EcoBlue Diesel',
      power: '125kW',
      torque: '390Nm',
      seats: 8,
      features: ['Sport Styling', '8" Touchscreen', 'Rear Camera', 'Leather Seats', 'Dual Side Doors'],
    },
  ],

  // Tourneo Custom variants
  'Tourneo Custom': [
    {
      name: 'Trend',
      code: 'tourneo-custom-trend',
      price: 58990,
      engine: '2.0L EcoBlue Diesel',
      power: '100kW',
      torque: '360Nm',
      seats: 9,
      features: ['13" Touchscreen', 'Rear Camera', 'Dual Side Doors', 'Panoramic Roof', 'Cruise Control'],
    },
    {
      name: 'Active',
      code: 'tourneo-custom-active',
      price: 63990,
      engine: '2.0L EcoBlue Diesel',
      power: '125kW',
      torque: '390Nm',
      seats: 9,
      features: ['Active Styling', '13" Touchscreen', 'Rear Camera', 'Leather Seats', 'Dual Side Doors'],
    },
  ],

  // Ranger Hybrid variants (PHEV)
  'Ranger Hybrid': [
    {
      name: 'XLT',
      code: 'ranger-hybrid-xlt',
      price: 69990,
      engine: '2.3L EcoBoost PHEV',
      power: '200kW',
      torque: '600Nm',
      range: '800km (hybrid)',
      features: ['18" Alloy Wheels', '10.1" Touchscreen', 'Dual-zone AC', 'Pro Power Onboard 2.3kW', 'Lane Keeping'],
    },
    {
      name: 'Wildtrak',
      code: 'ranger-hybrid-wildtrak',
      price: 79990,
      engine: '2.3L EcoBoost PHEV',
      power: '200kW',
      torque: '600Nm',
      range: '800km (hybrid)',
      features: ['18" Alloy Wheels', '12" Portrait Touchscreen', 'Premium Leather', 'Pro Power Onboard', 'Zone Lighting'],
    },
  ],

  // Ranger Super Duty variants
  'Ranger Super Duty': [
    {
      name: 'XL',
      code: 'ranger-superduty-xl',
      price: 58990,
      engine: '3.0L V6 Turbo Diesel',
      power: '184kW',
      torque: '600Nm',
      payload: '1,200kg',
      towing: '4,500kg',
      features: ['17" Steel Wheels', 'Vinyl Flooring', '8" Touchscreen', '4x4', 'Tow Bar'],
    },
    {
      name: 'XLT',
      code: 'ranger-superduty-xlt',
      price: 65990,
      engine: '3.0L V6 Turbo Diesel',
      power: '184kW',
      torque: '600Nm',
      payload: '1,150kg',
      towing: '4,500kg',
      features: ['18" Alloy Wheels', '10.1" Touchscreen', 'Carpet', 'Dual-zone AC', 'Pro Trailer Backup Assist'],
    },
  ],
};

async function populateMissingVariants() {
  console.log('=== Populating Missing Ford Variants ===\n');

  // Get current Ford products
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', 'ford-au');

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  console.log(`Found ${products.length} Ford products`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const [baseName, variants] of Object.entries(missingVariants)) {
    console.log(`\n--- Processing ${baseName} (${variants.length} variants) ---`);

    // Find base product
    const baseProduct = products.find(p => p.title === baseName);
    if (!baseProduct) {
      console.log(`  ⚠️ Base product not found: ${baseName}`);
      continue;
    }

    // Update base product with variants list
    const variantList = variants.map(v => ({
      name: v.name,
      code: v.code,
      price: v.price,
      engine: v.engine,
      power: v.power,
      torque: v.torque,
    }));

    const { error: updateError } = await supabase
      .from('products')
      .update({
        variants: variantList,
        meta_json: {
          ...baseProduct.meta_json,
          hasVariantData: true,
          variantCount: variants.length,
          availableVariants: variantList,
        },
      })
      .eq('id', baseProduct.id);

    if (updateError) {
      console.error(`  ❌ Error updating ${baseName}:`, updateError);
      errors++;
    } else {
      console.log(`  ✅ Updated ${baseName} with ${variants.length} variants`);
      updated++;
    }

    // Create variant products
    for (const variant of variants) {
      const variantProduct = {
        id: generateUUID(),
        oem_id: 'ford-au',
        external_key: variant.code,
        title: `${baseName} ${variant.name}`,
        subtitle: `${variant.engine} - ${variant.features[0]}`,
        body_type: baseProduct.body_type,
        fuel_type: variant.engine.includes('Electric') ? 'Electric' : 
                   variant.engine.includes('PHEV') ? 'Plug-in Hybrid' : 
                   'Diesel',
        source_url: baseProduct.source_url,
        availability: 'available',
        price_amount: variant.price,
        price_currency: 'AUD',
        price_type: 'driveaway',
        price_raw_string: `$${variant.price.toLocaleString()}`,
        primary_image_r2_key: baseProduct.primary_image_r2_key,
        key_features: variant.features,
        variants: variantList,
        cta_links: baseProduct.cta_links,
        meta_json: {
          parentNameplate: baseName,
          parentExternalKey: baseProduct.external_key,
          variantName: variant.name,
          variantCode: variant.code,
          variantDataSource: 'manual_population',
          engine: variant.engine,
          power: variant.power,
          torque: variant.torque,
          range: variant.range,
          payload: variant.payload,
          towing: variant.towing,
          seats: variant.seats,
          gvm: variant.gvm,
          gcm: variant.gcm,
          heroImage: baseProduct.primary_image_r2_key,
          heroImageSource: `parent:${baseName}`,
        },
        gallery_image_count: 1,
        last_seen_at: new Date().toISOString(),
      };

      // Check if variant already exists
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('oem_id', 'ford-au')
        .eq('title', variantProduct.title)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error: varUpdateError } = await supabase
          .from('products')
          .update(variantProduct)
          .eq('id', existing.id);

        if (varUpdateError) {
          console.error(`    ❌ Error updating ${variantProduct.title}:`, varUpdateError);
          errors++;
        } else {
          console.log(`    ✅ Updated: ${variantProduct.title} ($${variant.price.toLocaleString()})`);
          updated++;
        }
      } else {
        // Insert new
        const { error: insertError } = await supabase
          .from('products')
          .insert(variantProduct);

        if (insertError) {
          console.error(`    ❌ Error inserting ${variantProduct.title}:`, insertError);
          errors++;
        } else {
          console.log(`    ✅ Inserted: ${variantProduct.title} ($${variant.price.toLocaleString()})`);
          inserted++;
        }
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Base products updated: ${updated}`);
  console.log(`Variant products inserted: ${inserted}`);
  console.log(`Errors: ${errors}`);

  // Final count
  const { count, error: countError } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('oem_id', 'ford-au');

  console.log(`\nFinal Ford product count: ${count || 'error'}`);
}

populateMissingVariants();
