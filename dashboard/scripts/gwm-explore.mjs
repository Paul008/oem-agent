const modelUrls = [
  'https://www.gwmanz.com/au/models/suv/haval-jolion/',
  'https://www.gwmanz.com/au/models/ute/cannon/',
  'https://www.gwmanz.com/au/models/suv/tank-300/',
];

for (const url of modelUrls) {
  console.log('\n=== Fetching:', url, '===');
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
  });
  const html = await resp.text();
  console.log('Status:', resp.status, 'Length:', html.length);

  // Find color-related sections
  const colorMatches = html.match(/colour|color/gi);
  console.log('Color/colour mentions:', colorMatches?.length || 0);

  // Look for model-range-select-colour buttons with background-color
  const colorButtons = html.match(/<button[^>]*colour[^>]*>[^<]*<\/button>/gi);
  if (colorButtons) {
    console.log('\nColor buttons found:', colorButtons.length);
    colorButtons.forEach(b => console.log('  ', b.substring(0, 200)));
  }

  // Look for any inline style with background-color on button elements near colour
  const bgColors = html.match(/background-color:\s*#[0-9a-f]{6}/gi);
  console.log('\nBackground colors:', bgColors ? [...new Set(bgColors)] : 'none');

  // Look for image URLs with color/colour in path
  const colorImages = html.match(/https?:\/\/a\.storyblok\.com\/[^"'\s]*(?:colour|color)[^"'\s]*/gi);
  console.log('\nColor-related storyblok images:', colorImages ? [...new Set(colorImages)] : 'none');

  // Look for all storyblok images to see patterns
  const allSbImages = html.match(/https?:\/\/a\.storyblok\.com\/f\/256395\/[^"'\s]+/g) || [];
  const uniqueImages = [...new Set(allSbImages)];
  console.log('\nTotal unique storyblok images:', uniqueImages.length);

  // Group images by filename pattern to find color-related ones
  uniqueImages.forEach(img => {
    const filename = img.split('/').pop().split('?')[0];
    // Show images that might be car renders (usually large)
    if (filename.match(/\.(jpg|jpeg|png|webp)$/i) && !filename.match(/icon|logo|badge/i)) {
      console.log('  ', img.substring(0, 150));
    }
  });

  // Look for JSON/JS that maps colors to images
  const colorJsonMatch = html.match(/["'](?:colours?|colors?)["']\s*:\s*\[[\s\S]{0,5000}?\]/i);
  if (colorJsonMatch) {
    console.log('\nColor JSON data found:', colorJsonMatch[0].substring(0, 2000));
  }

  // Look for __NEXT_DATA__ or similar hydration data
  const nextData = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextData) {
    console.log('\n__NEXT_DATA__ found, length:', nextData[1].length);
    // Parse and look for color-related data
    try {
      const data = JSON.parse(nextData[1]);
      console.log('Top keys:', Object.keys(data));
      if (data.props?.pageProps) {
        console.log('PageProps keys:', Object.keys(data.props.pageProps));
      }
    } catch(e) {
      console.log('Could not parse __NEXT_DATA__');
    }
  }

  // Check for nuxt data
  const nuxtData = html.match(/<script[^>]*>window\.__NUXT__\s*=\s*([\s\S]*?)<\/script>/i);
  if (nuxtData) {
    console.log('\n__NUXT__ data found, length:', nuxtData[1].length);
  }

  // Check for any script with color data
  const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const script of scripts) {
    if (script.match(/colour|color.*image|swatch/i) && script.length > 100) {
      console.log('\nScript with color reference (len=' + script.length + '):', script.substring(0, 500));
    }
  }
}
