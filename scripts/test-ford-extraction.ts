/**
 * Test Ford vehiclesmenu.data extraction logic
 */

import * as fs from 'fs';

// Simulate the extraction functions from orchestrator.ts

function isAemVehicleMenuData(data: any): boolean {
  if (!data) return false;

  // Ford AU format: Array of category objects with nameplates
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (first && typeof first === 'object') {
      if (first.nameplates || first.category || first.vehicleCategories) {
        return true;
      }
    }
  }

  if (typeof data !== 'object') return false;

  const hasCategories = Array.isArray(data.categories) || Array.isArray(data.navItems) ||
                        Array.isArray(data.vehicleCategories) || Array.isArray(data.menuItems);

  const hasNestedItems = Object.keys(data).some(key => {
    const child = data[key];
    return child && typeof child === 'object' &&
           (child.vehicles || child.items || child.models || child.nameplates || Array.isArray(child));
  });

  const hasAemMarkers = data[':type'] || data['jcr:primaryType'] || data['sling:resourceType'];

  return hasCategories || hasNestedItems || hasAemMarkers;
}

function extractAemVehicleMenuItems(data: any): any[] {
  const items: any[] = [];

  // Ford AU format: Array of category objects with nameplates
  if (Array.isArray(data)) {
    for (const categoryObj of data) {
      if (categoryObj && typeof categoryObj === 'object') {
        const categoryName = categoryObj.category || categoryObj.name || categoryObj.title;
        const nameplates = categoryObj.nameplates || categoryObj.vehicles || categoryObj.items || [];

        for (const np of (Array.isArray(nameplates) ? nameplates : [])) {
          items.push({
            ...np,
            category: categoryName,
            title: np.name,
            bodyType: np.bodyType?.[0] || categoryName,
            vehicleType: np.vehicleType?.[0] || categoryName,
            priceText: np.pricing?.min?.priceVat || np.pricing?.min?.price,
            imageUrl: np.image?.startsWith('/') ? `https://www.ford.com.au${np.image}` : np.image,
            sourceUrl: np.path?.startsWith('/') ? `https://www.ford.com.au${np.path.replace('/content/ecomm-img', '')}` : np.path,
            ctaLink: np.additionalCTA,
          });
        }
      }
    }
    return items;
  }

  return items;
}

function extractPriceFromString(priceStr: string | undefined): number | undefined {
  if (!priceStr) return undefined;
  const match = priceStr.replace(/[,$]/g, '').match(/(\d+(?:\.\d{2})?)/);
  if (match) {
    return parseFloat(match[1]);
  }
  return undefined;
}

function extractProductsFromApiResponse(data: any): any[] {
  const products: any[] = [];
  let items: any[] = [];

  if (Array.isArray(data)) {
    // Check if it's Ford format (array of categories)
    if (data[0]?.nameplates) {
      items = extractAemVehicleMenuItems(data);
    } else {
      items = data;
    }
  } else if (isAemVehicleMenuData(data)) {
    items = extractAemVehicleMenuItems(data);
  }

  for (const item of items) {
    const product = {
      title: item.name || item.title || item.modelName || item.model || item.vehicleName,
      subtitle: item.subtitle || item.variant || item.trim || item.tagline,
      body_type: item.bodyType || item.body_type || item.type || item.vehicleType || item.category,
      fuel_type: item.fuelType || item.fuel_type || item.fuel || item.powerTrain,
      availability: item.availability || item.status || 'available',
      price: {
        amount: item.price || item.msrp || item.driveaway_price || item.priceAmount ||
                item.startingPrice || item.fromPrice || extractPriceFromString(item.priceText || item.priceDisplay),
        currency: item.currency || 'AUD',
        type: item.priceType || item.price_type || 'driveaway',
        raw_string: item.priceDisplay || item.price_raw || item.priceText,
      },
      key_features: item.features || item.highlights || item.keyFeatures || [],
      variants: item.variants || item.trims || item.grades || [],
      disclaimer_text: item.disclaimer || item.terms || item.legalText,
      primary_image_url: item.imageUrl || item.image || item.hero_image || item.thumbnailImage || item.vehicleImage,
      external_key: item.code || item.modelCode || item.vehicleCode || item.id,
      source_url: item.sourceUrl || item.link || item.url || item.detailsUrl || item.ctaLink,
    };

    if (product.title) {
      products.push(product);
    }
  }

  return products;
}

// Run test
const jsonPath = './scripts/ford-vehiclesmenu.json';
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

console.log('=== Testing Ford Extraction ===\n');
console.log('Is AEM Vehicle Menu Data:', isAemVehicleMenuData(data));
console.log('');

const products = extractProductsFromApiResponse(data);
console.log(`Extracted ${products.length} products:\n`);

for (const product of products) {
  console.log(`- ${product.title}`);
  console.log(`  Category: ${product.body_type}`);
  console.log(`  Price: ${product.price.raw_string || 'N/A'}`);
  console.log(`  Image: ${product.primary_image_url?.substring(0, 60)}...`);
  console.log(`  URL: ${product.source_url}`);
  console.log(`  Code: ${product.external_key}`);
  console.log('');
}
