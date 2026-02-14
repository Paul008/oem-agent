import puppeteer from 'puppeteer';

async function investigateColorGalleries() {
  console.log('=== Investigating Ford Color-Specific Galleries ===\n');
  
  const browser = await puppeteer.launch({ 
    headless: 'new', 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    // Capture all network requests
    const networkData = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('ford.com.au') && (url.includes('api') || url.includes('config') || url.includes('.json'))) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('json')) {
            const body = await response.text();
            networkData.push({ url: url.substring(0, 120), body: body.substring(0, 500) });
          }
        } catch (e) {}
      }
    });
    
    // Navigate to Ranger pricing
    console.log('Loading Ranger configurator...');
    await page.goto('https://www.ford.com.au/price/Ranger', { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('Page loaded. Looking for color selection...\n');
    
    // Get HTML content
    const html = await page.content();
    
    // Look for color data with image references
    console.log('=== Searching for Color-Image Relationships ===');
    
    // Pattern 1: Look for color configurations with image data
    const colorPattern = /\"color[^}]*\"code\"[^}]*\"image[^}]+/gi;
    const colorMatches = html.match(colorPattern);
    console.log('Color+image patterns:', colorMatches ? colorMatches.length : 0);
    
    // Pattern 2: Look for exterior images linked to colors
    const exteriorPattern = /\"exterior\":\[[^\]]*\"tag\"[^\]]+\"imageURL[^\]]+/gi;
    const exteriorMatches = html.match(exteriorPattern);
    console.log('Exterior image configs:', exteriorMatches ? exteriorMatches.length : 0);
    
    if (exteriorMatches && exteriorMatches.length > 0) {
      console.log('\nSample exterior config:', exteriorMatches[0].substring(0, 300));
    }
    
    // Pattern 3: Look for color swatches with image URLs
    const swatchPattern = /\"swatch[^}]*\"image[^}]*guid[^}]+/gi;
    const swatchMatches = html.match(swatchPattern);
    console.log('Color swatch patterns:', swatchMatches ? swatchMatches.length : 0);
    
    // Look for all GPAS GUIDs in page
    const allGuids = html.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi) || [];
    const uniqueGuids = [...new Set(allGuids)];
    console.log('\nTotal unique GUIDs found:', uniqueGuids.length);
    console.log('First 10:', uniqueGuids.slice(0, 10));
    
    // Check for color-specific GUID patterns
    console.log('\n=== Looking for Color Names Near GUIDs ===');
    const colorNames = ['Arctic White', 'Shadow Black', 'Aluminium', 'Meteor Grey', 'Blue Lightning', 
                        'Sedona Orange', 'Conquer Grey', 'True Red', 'Winter Ember'];
    
    colorNames.forEach(color => {
      const colorIndex = html.indexOf(color);
      if (colorIndex > -1) {
        const context = html.substring(colorIndex - 1000, colorIndex + 1000);
        const nearbyGuids = context.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi);
        if (nearbyGuids) {
          console.log(`${color}: ${[...new Set(nearbyGuids)].length} nearby GUIDs`);
        }
      }
    });
    
    // Check API responses for color data
    console.log('\n=== API Responses Captured ===');
    const apiWithColors = networkData.filter(d => 
      d.body.toLowerCase().includes('color') || 
      d.body.toLowerCase().includes('exterior') ||
      d.body.toLowerCase().includes('image')
    );
    console.log('API calls with color/image data:', apiWithColors.length);
    
    if (apiWithColors.length > 0) {
      console.log('\nSample API call:');
      console.log('URL:', apiWithColors[0].url);
      console.log('Body preview:', apiWithColors[0].body.substring(0, 500));
    }
    
  } finally {
    await browser.close();
  }
}

investigateColorGalleries();
