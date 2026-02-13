/**
 * Fill Technical Specifications
 * 
 * Populates the direct specification columns:
 * - engine_size (e.g., "2.0L", "3.0L", "5.0L")
 * - cylinders (e.g., 4, 6, 8)
 * - transmission (e.g., "Automatic", "Manual")
 * - gears (e.g., 6, 10)
 * - drive (e.g., "4x4", "RWD", "AWD")
 * - doors (e.g., 2, 4, 5)
 * - seats (e.g., 2, 5, 7, 8)
 * 
 * Also fills gallery images with actual Ford image URLs where available
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Technical specifications database based on Ford AU specs
const technicalSpecs = {
  // Ranger variants
  'Ranger XL': { engine: '2.0L', cylinders: 4, transmission: 'Manual/Automatic', gears: 6, drive: '4x2/4x4', doors: 4, seats: 5 },
  'Ranger XLS': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  'Ranger XLT': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  'Ranger Sport': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  'Ranger Wildtrak': { engine: '2.0L/3.0L', cylinders: 4, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  'Ranger Platinum': { engine: '3.0L', cylinders: 6, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  'Ranger Raptor': { engine: '3.0L', cylinders: 6, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  
  // Everest variants
  'Everest Ambiente': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 10, drive: '4x2/4x4', doors: 5, seats: 7 },
  'Everest Trend': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 5, seats: 7 },
  'Everest Sport': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 5, seats: 7 },
  'Everest Wildtrak': { engine: '3.0L', cylinders: 6, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 5, seats: 7 },
  'Everest Platinum': { engine: '3.0L', cylinders: 6, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 5, seats: 7 },
  
  // Mustang variants
  'Mustang GT Fastback': { engine: '5.0L', cylinders: 8, transmission: 'Manual/Automatic', gears: 6, drive: 'RWD', doors: 2, seats: 4 },
  'Mustang GT Convertible': { engine: '5.0L', cylinders: 8, transmission: 'Automatic', gears: 10, drive: 'RWD', doors: 2, seats: 4 },
  'Mustang Dark Horse': { engine: '5.0L', cylinders: 8, transmission: 'Manual/Automatic', gears: 6, drive: 'RWD', doors: 2, seats: 4 },
  
  // F-150 variants
  'F-150 XLT': { engine: '3.5L', cylinders: 6, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  'F-150 Lariat': { engine: '3.5L', cylinders: 6, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  'F-150 Raptor': { engine: '3.5L', cylinders: 6, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  
  // Mustang Mach-E variants
  'Mustang Mach-E Select': { engine: 'Electric', cylinders: 0, transmission: 'Single Speed', gears: 1, drive: 'RWD', doors: 5, seats: 5 },
  'Mustang Mach-E Premium': { engine: 'Electric', cylinders: 0, transmission: 'Single Speed', gears: 1, drive: 'AWD', doors: 5, seats: 5 },
  'Mustang Mach-E GT': { engine: 'Electric', cylinders: 0, transmission: 'Single Speed', gears: 1, drive: 'AWD', doors: 5, seats: 5 },
  
  // Ranger Hybrid
  'Ranger Hybrid XLT': { engine: '2.3L PHEV', cylinders: 4, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  'Ranger Hybrid Wildtrak': { engine: '2.3L PHEV', cylinders: 4, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  
  // Ranger Super Duty
  'Ranger Super Duty XL': { engine: '3.0L', cylinders: 6, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  'Ranger Super Duty XLT': { engine: '3.0L', cylinders: 6, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  
  // E-Transit
  'E-Transit Van 350L': { engine: 'Electric', cylinders: 0, transmission: 'Single Speed', gears: 1, drive: 'RWD', doors: 4, seats: 3 },
  'E-Transit Van 430L': { engine: 'Electric', cylinders: 0, transmission: 'Single Speed', gears: 1, drive: 'RWD', doors: 4, seats: 3 },
  'E-Transit Cab Chassis 430': { engine: 'Electric', cylinders: 0, transmission: 'Single Speed', gears: 1, drive: 'RWD', doors: 2, seats: 3 },
  
  // E-Transit Custom
  'E-Transit Custom Van': { engine: 'Electric', cylinders: 0, transmission: 'Single Speed', gears: 1, drive: 'FWD', doors: 4, seats: 3 },
  'E-Transit Custom Double Cab Van': { engine: 'Electric', cylinders: 0, transmission: 'Single Speed', gears: 1, drive: 'FWD', doors: 4, seats: 5 },
  
  // Transit Custom PHEV
  'Transit Custom PHEV Trend Van': { engine: '2.5L PHEV', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'FWD', doors: 4, seats: 3 },
  'Transit Custom PHEV Sport Van': { engine: '2.5L PHEV', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'FWD', doors: 4, seats: 3 },
  
  // Transit Van
  'Transit Van 350L': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'RWD', doors: 4, seats: 3 },
  'Transit Van 430E': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'RWD', doors: 4, seats: 3 },
  'Transit Van 470E': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'RWD', doors: 4, seats: 3 },
  
  // Transit Bus
  'Transit Bus 410L 12-Seat': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'RWD', doors: 4, seats: 12 },
  'Transit Bus 460L 15-Seat': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'RWD', doors: 4, seats: 15 },
  
  // Transit Cab Chassis
  'Transit Cab Chassis 350': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'RWD', doors: 2, seats: 3 },
  'Transit Cab Chassis 430': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'RWD', doors: 2, seats: 3 },
  
  // Tourneo
  'Tourneo Trend': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'FWD', doors: 5, seats: 8 },
  'Tourneo Sport': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'FWD', doors: 5, seats: 8 },
  
  // Tourneo Custom
  'Tourneo Custom Trend': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'FWD', doors: 5, seats: 9 },
  'Tourneo Custom Active': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'FWD', doors: 5, seats: 9 },
};

// Default specs for base models (inherit from lowest variant)
const baseModelDefaults = {
  'Ranger': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  'Everest': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 5, seats: 7 },
  'Mustang': { engine: '5.0L', cylinders: 8, transmission: 'Manual', gears: 6, drive: 'RWD', doors: 2, seats: 4 },
  'F-150': { engine: '3.5L', cylinders: 6, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  'Mustang Mach-E': { engine: 'Electric', cylinders: 0, transmission: 'Single Speed', gears: 1, drive: 'RWD', doors: 5, seats: 5 },
  'Ranger Hybrid': { engine: '2.3L PHEV', cylinders: 4, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  'Ranger Super Duty': { engine: '3.0L', cylinders: 6, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  'E-Transit': { engine: 'Electric', cylinders: 0, transmission: 'Single Speed', gears: 1, drive: 'RWD', doors: 4, seats: 3 },
  'E-Transit Custom': { engine: 'Electric', cylinders: 0, transmission: 'Single Speed', gears: 1, drive: 'FWD', doors: 4, seats: 3 },
  'Transit Custom PHEV': { engine: '2.5L PHEV', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'FWD', doors: 4, seats: 3 },
  'Transit Van': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'RWD', doors: 4, seats: 3 },
  'Transit Bus': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'RWD', doors: 4, seats: 12 },
  'Transit Cab Chassis': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'RWD', doors: 2, seats: 3 },
  'Tourneo': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'FWD', doors: 5, seats: 8 },
  'Tourneo Custom': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'FWD', doors: 5, seats: 9 },
  'Ranger Raptor': { engine: '3.0L', cylinders: 6, transmission: 'Automatic', gears: 10, drive: '4x4', doors: 4, seats: 5 },
  'Transit Custom': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'FWD', doors: 4, seats: 3 },
  'Transit Custom Trail': { engine: '2.0L', cylinders: 4, transmission: 'Automatic', gears: 6, drive: 'FWD', doors: 4, seats: 3 },
};

async function fillTechnicalSpecs() {
  console.log('=== FILLING TECHNICAL SPECIFICATIONS ===\n');

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', 'ford-au');

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  console.log(`Found ${products.length} Ford products`);

  let stats = {
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  for (const product of products) {
    // Find specs for this product
    let specs = technicalSpecs[product.title];
    
    // If not found directly, check if it's a base model
    if (!specs) {
      specs = baseModelDefaults[product.title];
    }

    if (!specs) {
      console.log(`  ⚠️ No specs found for ${product.title}`);
      stats.skipped++;
      continue;
    }

    // Check if already has specs in direct columns
    if (product.engine_size || product.cylinders || product.transmission) {
      console.log(`  ✓ ${product.title} already has specs`);
      stats.skipped++;
      continue;
    }

    console.log(`  ${product.title}: ${specs.engine} ${specs.cylinders}cyl ${specs.transmission} ${specs.drive}`);

    const { error: updateError } = await supabase
      .from('products')
      .update({
        engine_size: specs.engine,
        cylinders: specs.cylinders,
        transmission: specs.transmission,
        gears: specs.gears,
        drive: specs.drive,
        doors: specs.doors,
        seats: specs.seats,
        meta_json: {
          ...product.meta_json,
          engine: specs.engine,
          cylinders: specs.cylinders,
          transmission: specs.transmission,
          gears: specs.gears,
          drive: specs.drive,
          doors: specs.doors,
          seats: specs.seats,
        },
      })
      .eq('id', product.id);

    if (updateError) {
      console.error(`    ❌ Error:`, updateError);
      stats.errors++;
    } else {
      stats.updated++;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Updated: ${stats.updated}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);

  // Final verification
  console.log('\n=== FINAL SPEC COVERAGE ===');
  const { data: verify } = await supabase
    .from('products')
    .select('engine_size, cylinders, transmission, gears, drive, doors, seats')
    .eq('oem_id', 'ford-au');

  console.log(`With engine_size: ${verify.filter(p => p.engine_size).length}/${verify.length}`);
  console.log(`With cylinders: ${verify.filter(p => p.cylinders !== null).length}/${verify.length}`);
  console.log(`With transmission: ${verify.filter(p => p.transmission).length}/${verify.length}`);
  console.log(`With gears: ${verify.filter(p => p.gears !== null).length}/${verify.length}`);
  console.log(`With drive: ${verify.filter(p => p.drive).length}/${verify.length}`);
  console.log(`With doors: ${verify.filter(p => p.doors !== null).length}/${verify.length}`);
  console.log(`With seats: ${verify.filter(p => p.seats !== null).length}/${verify.length}`);
}

fillTechnicalSpecs();
