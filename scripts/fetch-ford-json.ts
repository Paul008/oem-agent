/**
 * Fetch Ford AU vehiclesmenu.data JSON using headless browser
 * This bypasses Akamai bot protection by using a real browser
 */

import puppeteer from 'puppeteer';
import * as fs from 'fs';

async function fetchFordVehicleMenu() {
  console.log('Launching browser...');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Capture network responses
    let vehicleMenuData: any = null;

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('vehiclesmenu.data')) {
        console.log('Found vehiclesmenu.data response!');
        try {
          const json = await response.json();
          vehicleMenuData = json;
          console.log('Captured JSON, keys:', Object.keys(json));
          // Save immediately
          const outputPath = './scripts/ford-vehiclesmenu.json';
          fs.writeFileSync(outputPath, JSON.stringify(json, null, 2));
          console.log(`Saved to ${outputPath}`);
        } catch (e) {
          console.log('Failed to parse as JSON:', e);
        }
      }
    });

    console.log('Navigating to ford.com.au...');
    // Don't wait for full load - just need the API response
    await page.goto('https://www.ford.com.au/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    }).catch(() => console.log('Navigation timeout - continuing...'));

    // Wait a bit for any lazy-loaded requests
    await new Promise(resolve => setTimeout(resolve, 3000));

    if (vehicleMenuData) {
      // Save to file
      const outputPath = './scripts/ford-vehiclesmenu.json';
      fs.writeFileSync(outputPath, JSON.stringify(vehicleMenuData, null, 2));
      console.log(`\nSaved to ${outputPath}`);

      // Print structure analysis
      console.log('\n=== JSON Structure Analysis ===');
      analyzeStructure(vehicleMenuData, '', 0);
    } else {
      console.log('vehiclesmenu.data was not loaded on the homepage');
      console.log('Trying direct navigation...');

      // Try navigating directly to the data endpoint
      try {
        await page.goto('https://www.ford.com.au/content/ford/au/en_au.vehiclesmenu.data', {
          waitUntil: 'networkidle0',
          timeout: 30000,
        });

        const content = await page.content();
        // Try to extract JSON from the page
        const bodyText = await page.evaluate(() => document.body.innerText);
        if (bodyText.startsWith('{') || bodyText.startsWith('[')) {
          const json = JSON.parse(bodyText);
          const outputPath = './scripts/ford-vehiclesmenu.json';
          fs.writeFileSync(outputPath, JSON.stringify(json, null, 2));
          console.log(`\nSaved to ${outputPath}`);
          analyzeStructure(json, '', 0);
        }
      } catch (e) {
        console.log('Direct navigation failed:', e);
      }
    }

  } finally {
    await browser.close();
  }
}

function analyzeStructure(obj: any, path: string, depth: number) {
  if (depth > 3) return; // Limit depth

  if (Array.isArray(obj)) {
    console.log(`${path}: Array[${obj.length}]`);
    if (obj.length > 0 && typeof obj[0] === 'object') {
      analyzeStructure(obj[0], `${path}[0]`, depth + 1);
    }
  } else if (typeof obj === 'object' && obj !== null) {
    const keys = Object.keys(obj);
    console.log(`${path}: Object { ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? '...' : ''} }`);
    for (const key of keys.slice(0, 5)) {
      analyzeStructure(obj[key], `${path}.${key}`, depth + 1);
    }
  } else {
    console.log(`${path}: ${typeof obj}`);
  }
}

fetchFordVehicleMenu().catch(console.error);
