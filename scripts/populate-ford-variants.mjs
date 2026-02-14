/**
 * Populate Ford variants, colors, and gallery manually
 * 
 * Since Ford's pricing API is protected, this script manually creates
 * variant products based on publicly available Ford AU specifications.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Ford Ranger (Next-Gen) - 2024/2025 specs
const rangerVariants = [
  {
    name: 'XL',
    code: 'ranger-xl',
    engine: '2.0L Single Turbo Diesel',
    power: '125kW',
    torque: '405Nm',
    transmission: '6-Speed Manual or Automatic',
    drivetrain: '4x2 or 4x4',
    priceDriveAway: 42990,
    features: ['17" Steel Wheels', 'Vinyl Flooring', 'Single-zone AC', '8" Touchscreen', 'Wireless Apple CarPlay/Android Auto'],
    bodyStyles: ['Single Cab', 'Super Cab', 'Double Cab'],
  },
  {
    name: 'XLS',
    code: 'ranger-xls',
    engine: '2.0L Bi-Turbo Diesel',
    power: '154kW',
    torque: '500Nm',
    transmission: '10-Speed Automatic',
    drivetrain: '4x4',
    priceDriveAway: 52990,
    features: ['17" Alloy Wheels', 'Carpet Flooring', 'Fabric Seats', 'Dual-zone AC', '10.1" Touchscreen', 'Digital Instrument Cluster'],
    bodyStyles: ['Super Cab', 'Double Cab'],
  },
  {
    name: 'XLT',
    code: 'ranger-xlt',
    engine: '2.0L Bi-Turbo Diesel',
    power: '154kW',
    torque: '500Nm',
    transmission: '10-Speed Automatic',
    drivetrain: '4x4',
    priceDriveAway: 59990,
    features: ['18" Alloy Wheels', 'Leather-wrapped Steering Wheel', 'Proximity Entry/Push Start', 'Power-folding Mirrors', 'Lane Keeping System'],
    bodyStyles: ['Double Cab', 'Super Cab'],
  },
  {
    name: 'Sport',
    code: 'ranger-sport',
    engine: '2.0L Bi-Turbo Diesel',
    power: '154kW',
    torque: '500Nm',
    transmission: '10-Speed Automatic',
    drivetrain: '4x4',
    priceDriveAway: 65990,
    features: ['18" Sport Alloy Wheels', 'Sports Bar', 'Unique Exterior Styling', 'Black Grille', 'LED Headlights', 'Power Roller Cover'],
    bodyStyles: ['Double Cab'],
  },
  {
    name: 'Wildtrak',
    code: 'ranger-wildtrak',
    engine: '2.0L Bi-Turbo Diesel or 3.0L V6 Turbo Diesel',
    power: '154kW or 184kW',
    torque: '500Nm or 600Nm',
    transmission: '10-Speed Automatic',
    drivetrain: '4x4',
    priceDriveAway: 72990,
    features: ['18" Alloy Wheels', 'Premium Leather Seats', '12" Portrait Touchscreen', 'B&O Sound System', 'Panoramic Roof', 'Zone Lighting'],
    bodyStyles: ['Double Cab'],
  },
  {
    name: 'Platinum',
    code: 'ranger-platinum',
    engine: '3.0L V6 Turbo Diesel',
    power: '184kW',
    torque: '600Nm',
    transmission: '10-Speed Automatic',
    drivetrain: '4x4',
    priceDriveAway: 82990,
    features: ['20" Machined Alloy Wheels', 'Premium Leather with Quilted Inserts', 'Adaptive Cruise Control', 'Active Park Assist', 'Matrix LED Headlights'],
    bodyStyles: ['Double Cab'],
  },
  {
    name: 'Raptor',
    code: 'ranger-raptor',
    engine: '3.0L V6 Twin-Turbo EcoBoost Petrol',
    power: '292kW',
    torque: '583Nm',
    transmission: '10-Speed Automatic',
    drivetrain: '4x4 with Full-Time 4WD',
    priceDriveAway: 86990,
    features: ['17" Alloy Wheels with BF Goodrich AT Tyres', 'FOX Racing Shocks', 'Active Exhaust', 'Trail Control', 'Watt-link Rear Suspension', 'Raptor Styling Package'],
    bodyStyles: ['Double Cab'],
  },
];

// Ford Everest - 2024/2025 specs
const everestVariants = [
  {
    name: 'Ambiente',
    code: 'everest-ambiente',
    engine: '2.0L Bi-Turbo Diesel',
    power: '154kW',
    torque: '500Nm',
    transmission: '10-Speed Automatic',
    drivetrain: '4x2 or 4x4',
    priceDriveAway: 58990,
    features: ['18" Alloy Wheels', 'LED Headlights', '10.1" Touchscreen', 'Fabric Seats', 'Single-zone AC'],
    bodyStyles: ['SUV'],
  },
  {
    name: 'Trend',
    code: 'everest-trend',
    engine: '2.0L Bi-Turbo Diesel',
    power: '154kW',
    torque: '500Nm',
    transmission: '10-Speed Automatic',
    drivetrain: '4x4',
    priceDriveAway: 66990,
    features: ['18" Alloy Wheels', 'Power Tailgate', 'Dual-zone AC', 'Leather-wrapped Steering', 'Wireless Phone Charging'],
    bodyStyles: ['SUV'],
  },
  {
    name: 'Sport',
    code: 'everest-sport',
    engine: '2.0L Bi-Turbo Diesel',
    power: '154kW',
    torque: '500Nm',
    transmission: '10-Speed Automatic',
    drivetrain: '4x4',
    priceDriveAway: 72990,
    features: ['20" Black Alloy Wheels', 'Black Exterior Accents', 'Sport Styling', 'Panoramic Roof', 'Hands-free Tailgate'],
    bodyStyles: ['SUV'],
  },
  {
    name: 'Wildtrak',
    code: 'everest-wildtrak',
    engine: '3.0L V6 Turbo Diesel',
    power: '184kW',
    torque: '600Nm',
    transmission: '10-Speed Automatic',
    drivetrain: '4x4',
    priceDriveAway: 79990,
    features: ['20" Alloy Wheels', 'Premium Leather Seats', '12" Portrait Touchscreen', 'B&O Sound System', 'Matrix LED Headlights'],
    bodyStyles: ['SUV'],
  },
  {
    name: 'Platinum',
    code: 'everest-platinum',
    engine: '3.0L V6 Turbo Diesel',
    power: '184kW',
    torque: '600Nm',
    transmission: '10-Speed Automatic',
    drivetrain: '4x4',
    priceDriveAway: 87990,
    features: ['21" Alloy Wheels', 'Quilted Leather Seats', 'Massaging Front Seats', 'Active Park Assist', '360-degree Camera'],
    bodyStyles: ['SUV'],
  },
];

// Ford Mustang - 2024 specs
const mustangVariants = [
  {
    name: 'GT Fastback',
    code: 'mustang-gt-fastback',
    engine: '5.0L V8 Coyote',
    power: '362kW',
    torque: '567Nm',
    transmission: '6-Speed Manual or 10-Speed Automatic',
    drivetrain: 'RWD',
    priceDriveAway: 68990,
    features: ['19" Alloy Wheels', 'Brembo Brakes', '12.4" Digital Instrument Cluster', '13.2" Touchscreen', 'Active Valve Performance Exhaust'],
    bodyStyles: ['Fastback'],
  },
  {
    name: 'GT Convertible',
    code: 'mustang-gt-convertible',
    engine: '5.0L V8 Coyote',
    power: '362kW',
    torque: '567Nm',
    transmission: '10-Speed Automatic',
    drivetrain: 'RWD',
    priceDriveAway: 78990,
    features: ['19" Alloy Wheels', 'Brembo Brakes', 'Power Soft Top', 'Heated Steering Wheel', 'Memory Seats'],
    bodyStyles: ['Convertible'],
  },
  {
    name: 'Dark Horse',
    code: 'mustang-dark-horse',
    engine: '5.0L V8 Coyote (Enhanced)',
    power: '373kW',
    torque: '567Nm',
    transmission: '6-Speed Manual or 10-Speed Automatic',
    drivetrain: 'RWD',
    priceDriveAway: 87990,
    features: ['19" Forged Alloy Wheels', 'Tremec 6-Speed Manual', 'Brembo 6-Piston Calipers', 'Magneride Damping', 'Dark Horse Styling'],
    bodyStyles: ['Fastback'],
  },
];

// Ford F-150 - 2024 specs
const f150Variants = [
  {
    name: 'XLT',
    code: 'f150-xlt',
    engine: '3.5L EcoBoost V6',
    power: '298kW',
    torque: '678Nm',
    transmission: '10-Speed Automatic',
    drivetrain: '4x4',
    priceDriveAway: 106990,
    features: ['18" Alloy Wheels', '12" Touchscreen', 'LED Headlights', 'Trailering Package', 'Power Running Boards'],
    bodyStyles: ['SuperCrew'],
  },
  {
    name: 'Lariat',
    code: 'f150-lariat',
    engine: '3.5L EcoBoost V6',
    power: '298kW',
    torque: '678Nm',
    transmission: '10-Speed Automatic',
    drivetrain: '4x4',
    priceDriveAway: 119990,
    features: ['20" Alloy Wheels', 'Premium Leather Seats', 'B&O Sound System', 'Power Tailgate', 'Panoramic Roof'],
    bodyStyles: ['SuperCrew'],
  },
  {
    name: 'Raptor',
    code: 'f150-raptor',
    engine: '3.5L EcoBoost V6 High Output',
    power: '336kW',
    torque: '691Nm',
    transmission: '10-Speed Automatic',
    drivetrain: '4x4 with Full-Time 4WD',
    priceDriveAway: 149990,
    features: ['17" Forged Alloy Wheels with 35" Tyres', 'FOX Racing Live Valve Shocks', 'Active Exhaust', 'Trail Control', 'Pro Power Onboard'],
    bodyStyles: ['SuperCrew'],
  },
];

// Common Ford colors
const fordColors = [
  { name: 'Arctic White', hex: '#F5F5F5', type: 'standard', price: 0 },
  { name: 'Shadow Black', hex: '#1A1A1A', type: 'standard', price: 0 },
  { name: 'Aluminium', hex: '#A8A8A8', type: 'metallic', price: 700 },
  { name: 'Meteor Grey', hex: '#4A4A4A', type: 'metallic', price: 700 },
  { name: 'Blue Lightning', hex: '#0066CC', type: 'metallic', price: 700 },
  { name: 'Sedona Orange', hex: '#CC5500', type: 'premium', price: 950 },
  { name: 'Conquer Grey', hex: '#666666', type: 'metallic', price: 700 },
  { name: 'True Red', hex: '#CC0000', type: 'metallic', price: 700 },
  { name: 'Winter Ember', hex: '#8B0000', type: 'premium', price: 950 },
  { name: 'Equinox Bronze', hex: '#8B7355', type: 'metallic', price: 700 },
  { name: 'Luxury Package Interior', hex: null, type: 'interior', price: 1500, description: 'Premium leather with accent stitching' },
];

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function populateFordVariants() {
  console.log('Populating Ford variants...\n');

  // Get existing Ford products
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', 'ford-au');

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  const variantsMap = {
    'Ranger': rangerVariants,
    'Everest': everestVariants,
    'Mustang': mustangVariants,
    'F-150': f150Variants,
  };

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const product of products) {
    const variants = variantsMap[product.title];
    if (!variants) {
      console.log(`No variant data for ${product.title}, skipping`);
      continue;
    }

    console.log(`\nProcessing ${product.title}...`);

    // Update base product with meta data
    const updatedMeta = {
      ...product.meta_json,
      hasVariantData: true,
      variantCount: variants.length,
      availableColors: fordColors,
      colorCount: fordColors.length,
      variantDataSource: 'manual_population',
      updatedAt: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('products')
      .update({
        meta_json: updatedMeta,
        variants: variants.map(v => ({
          name: v.name,
          code: v.code,
          price: v.priceDriveAway,
          engine: v.engine,
          power: v.power,
          torque: v.torque,
        })),
      })
      .eq('id', product.id);

    if (updateError) {
      console.error(`Error updating ${product.title}:`, updateError);
      errors++;
      continue;
    }
    updated++;

    // Create variant products
    for (const variant of variants) {
      const variantProduct = {
        id: generateUUID(),
        oem_id: 'ford-au',
        external_key: variant.code,
        title: `${product.title} ${variant.name}`,
        subtitle: `${variant.engine} - ${variant.drivetrain}`,
        body_type: product.body_type,
        fuel_type: variant.engine.includes('Diesel') ? 'Diesel' : variant.engine.includes('Petrol') ? 'Petrol' : 'Hybrid',
        source_url: product.source_url,
        availability: 'available',
        price_amount: variant.priceDriveAway,
        price_currency: 'AUD',
        price_type: 'driveaway',
        price_raw_string: `$${variant.priceDriveAway.toLocaleString()}`,
        key_features: variant.features,
        variants: variants.map(v => ({
          name: v.name,
          code: v.code,
          price: v.priceDriveAway,
          engine: v.engine,
        })),
        cta_links: product.cta_links,
        meta_json: {
          parentNameplate: product.title,
          parentExternalKey: product.external_key,
          variantName: variant.name,
          variantCode: variant.code,
          variantDataSource: 'manual_population',
          engine: variant.engine,
          power: variant.power,
          torque: variant.torque,
          transmission: variant.transmission,
          drivetrain: variant.drivetrain,
          availableColors: fordColors,
          colorCount: fordColors.length,
          bodyStyles: variant.bodyStyles,
        },
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
          console.error(`Error updating variant ${variantProduct.title}:`, varUpdateError);
          errors++;
        } else {
          console.log(`  Updated variant: ${variantProduct.title}`);
          updated++;
        }
      } else {
        // Insert new
        const { error: insertError } = await supabase
          .from('products')
          .insert(variantProduct);

        if (insertError) {
          console.error(`Error inserting variant ${variantProduct.title}:`, insertError);
          errors++;
        } else {
          console.log(`  Inserted variant: ${variantProduct.title}`);
          inserted++;
        }
      }
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Base products updated: ${updated}`);
  console.log(`Variant products inserted: ${inserted}`);
  console.log(`Errors: ${errors}`);

  // Check final count
  const { count, error: countError } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('oem_id', 'ford-au');

  console.log(`\nFinal Ford product count: ${count || 'error'}`);
}

populateFordVariants();
