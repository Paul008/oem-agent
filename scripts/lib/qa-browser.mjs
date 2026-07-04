import { existsSync } from 'node:fs';

export function readNext(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${arg} requires a value`);
  return value;
}

export function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function resolveBrowserExecutable(explicitPath = '') {
  if (explicitPath && existsSync(explicitPath))
    return explicitPath;

  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];

  return candidates.find(candidate => existsSync(candidate)) || '';
}

export async function settlePage(page, settleMs) {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready)
      await document.fonts.ready;
  }).catch(() => null);
  await new Promise(resolve => setTimeout(resolve, settleMs));
}

export function pickRenderedFrame(frames) {
  return [...frames].sort((a, b) => {
    const aScore = a.textLength + a.styleBytes / 100 + a.bodyHeight / 10;
    const bScore = b.textLength + b.styleBytes / 100 + b.bodyHeight / 10;
    return bScore - aScore;
  })[0] || null;
}

// preview-battle-test.mjs launched with:
//   { headless: 'new', executablePath, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
// oem-fidelity-report.mjs launched with:
//   { headless: 'new', defaultViewport: null, args: [..., '--font-render-hinting=none', '--disable-blink-features=AutomationControlled'], executablePath (only if truthy) }
// These differ (defaultViewport, extra args), so the extra/overridden options are
// passed in via `overrides` rather than unified, to keep each script's effective
// launch behavior unchanged. `browserExecutable` in overrides is the explicit path
// hint (script's --browser-executable flag / PUPPETEER_EXECUTABLE_PATH), not a
// puppeteer.launch option itself.
export async function launchQaBrowser(puppeteer, overrides = {}) {
  const { browserExecutable, ...launchOverrides } = overrides;
  const executablePath = resolveBrowserExecutable(browserExecutable);

  const launchOptions = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...launchOverrides,
  };

  if (executablePath)
    launchOptions.executablePath = executablePath;

  return puppeteer.launch(launchOptions);
}
