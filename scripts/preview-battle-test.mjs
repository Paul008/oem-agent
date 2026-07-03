#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import puppeteer from 'puppeteer';

const DEFAULT_PREVIEW_BASE = 'https://oem-dashboard.pages.dev/preview';
const DEFAULT_OUTPUT_DIR = 'artifacts/preview-battle-tests';
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_SETTLE_MS = 5_000;

function readNext(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${arg} requires a value`);
  return value;
}

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    previewBase: DEFAULT_PREVIEW_BASE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    settleMs: DEFAULT_SETTLE_MS,
    minText: 1200,
    minHeight: 2000,
    minStyleBytes: 10_000,
    minFontFaces: 0,
    maxFailedRequests: 0,
    maxBrokenImages: 5,
    requiredText: [],
    allowedFailurePatterns: [],
    browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH || '',
    json: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--slug') {
      options.slug = readNext(argv, index, arg);
      index++;
    } else if (arg === '--url') {
      options.url = readNext(argv, index, arg);
      index++;
    } else if (arg === '--preview-base') {
      options.previewBase = readNext(argv, index, arg).replace(/\/+$/, '');
      index++;
    } else if (arg === '--output-dir') {
      options.outputDir = readNext(argv, index, arg);
      index++;
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number(readNext(argv, index, arg));
      index++;
    } else if (arg === '--settle-ms') {
      options.settleMs = Number(readNext(argv, index, arg));
      index++;
    } else if (arg === '--min-text') {
      options.minText = Number(readNext(argv, index, arg));
      index++;
    } else if (arg === '--min-height') {
      options.minHeight = Number(readNext(argv, index, arg));
      index++;
    } else if (arg === '--min-style-bytes') {
      options.minStyleBytes = Number(readNext(argv, index, arg));
      index++;
    } else if (arg === '--min-font-faces') {
      options.minFontFaces = Number(readNext(argv, index, arg));
      index++;
    } else if (arg === '--max-failed-requests') {
      options.maxFailedRequests = Number(readNext(argv, index, arg));
      index++;
    } else if (arg === '--max-broken-images') {
      options.maxBrokenImages = Number(readNext(argv, index, arg));
      index++;
    } else if (arg === '--require-text') {
      options.requiredText.push(readNext(argv, index, arg));
      index++;
    } else if (arg === '--allow-failure-pattern') {
      options.allowedFailurePatterns.push(readNext(argv, index, arg));
      index++;
    } else if (arg === '--browser-executable') {
      options.browserExecutable = readNext(argv, index, arg);
      index++;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.url && options.slug)
    options.url = `${options.previewBase}/${encodeURIComponent(options.slug)}?view=production`;
  if (!options.url)
    throw new Error('--url or --slug is required');

  for (const key of ['timeoutMs', 'settleMs', 'minText', 'minHeight', 'minStyleBytes', 'minFontFaces', 'maxFailedRequests', 'maxBrokenImages']) {
    if (!Number.isFinite(options[key]) || options[key] < 0)
      throw new Error(`--${key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)} must be a non-negative number`);
  }

  return options;
}

function resolveBrowserExecutable(explicitPath = '') {
  if (explicitPath && existsSync(explicitPath))
    return explicitPath;

  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];

  return candidates.find(candidate => existsSync(candidate)) || undefined;
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function isAllowedFailure(failure, patterns) {
  return patterns.some(pattern => failure.url.includes(pattern));
}

async function inspectFrame(frame) {
  return frame.evaluate(() => {
    const text = document.body?.innerText || '';
    const html = document.documentElement?.outerHTML || '';
    const styles = [...document.querySelectorAll('style')];
    const brokenImages = [...document.images]
      .filter(image => image.complete && image.naturalWidth === 0)
      .map(image => image.currentSrc || image.src)
      .filter(Boolean);

    return {
      url: location.href,
      text,
      textLength: text.length,
      textSample: text.slice(0, 800),
      bodyHeight: document.body?.scrollHeight || 0,
      bodyWidth: document.body?.scrollWidth || 0,
      styleTags: styles.length,
      styleBytes: styles.reduce((total, style) => total + (style.textContent || '').length, 0),
      stylesheetLinks: document.querySelectorAll('link[rel~=stylesheet]').length,
      imageCount: document.images.length,
      brokenImages,
      fontFaceCount: (html.match(/@font-face/g) || []).length,
      hasDataStyled: html.includes('data-styled'),
    };
  });
}

function pickRenderedFrame(frames) {
  return [...frames].sort((a, b) => {
    const aScore = a.textLength + a.styleBytes / 100 + a.bodyHeight / 10;
    const bScore = b.textLength + b.styleBytes / 100 + b.bodyHeight / 10;
    return bScore - aScore;
  })[0] || null;
}

function evaluateAssertions({ frame, failures, options }) {
  const unexpectedFailures = failures.filter(failure => !isAllowedFailure(failure, options.allowedFailurePatterns));
  const assertions = [
    {
      name: 'rendered frame exists',
      pass: Boolean(frame),
      details: frame ? frame.url : 'no frame could be inspected',
    },
    {
      name: `visible text >= ${options.minText}`,
      pass: Boolean(frame && frame.textLength >= options.minText),
      details: frame ? frame.textLength : 0,
    },
    {
      name: `page height >= ${options.minHeight}`,
      pass: Boolean(frame && frame.bodyHeight >= options.minHeight),
      details: frame ? frame.bodyHeight : 0,
    },
    {
      name: `inline CSS bytes >= ${options.minStyleBytes}`,
      pass: Boolean(frame && frame.styleBytes >= options.minStyleBytes),
      details: frame ? frame.styleBytes : 0,
    },
    {
      name: `font faces >= ${options.minFontFaces}`,
      pass: Boolean(frame && frame.fontFaceCount >= options.minFontFaces),
      details: frame ? frame.fontFaceCount : 0,
    },
    {
      name: `unexpected failed requests <= ${options.maxFailedRequests}`,
      pass: unexpectedFailures.length <= options.maxFailedRequests,
      details: unexpectedFailures.length,
    },
    {
      name: `broken images <= ${options.maxBrokenImages}`,
      pass: Boolean(frame && frame.brokenImages.length <= options.maxBrokenImages),
      details: frame ? frame.brokenImages.length : 0,
    },
    ...options.requiredText.map(text => ({
      name: `contains text "${text}"`,
      pass: Boolean(frame && frame.text.includes(text)),
      details: frame ? frame.textSample.slice(0, 160) : '',
    })),
  ];

  return { assertions, unexpectedFailures };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browserExecutable = resolveBrowserExecutable(options.browserExecutable);
  const outputDir = join(options.outputDir, timestampForPath());
  await mkdir(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: browserExecutable,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const failures = [];
  const consoleMessages = [];

  page.on('requestfailed', request => failures.push({
    url: request.url(),
    failure: request.failure()?.errorText || 'request failed',
  }));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failures.push({
        url: response.url(),
        status: response.status(),
      });
    }
  });
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleMessages.push({
        type: message.type(),
        text: message.text().slice(0, 500),
      });
    }
  });

  await page.setViewport({ width: 1440, height: 1400, deviceScaleFactor: 1 });
  await page.goto(options.url, { waitUntil: 'networkidle2', timeout: options.timeoutMs });
  await new Promise(resolve => setTimeout(resolve, options.settleMs));

  const frames = [];
  for (const frame of page.frames()) {
    try {
      frames.push(await inspectFrame(frame));
    } catch (error) {
      frames.push({ url: frame.url(), error: error instanceof Error ? error.message : String(error) });
    }
  }

  const renderedFrame = pickRenderedFrame(frames.filter(frame => !frame.error));
  const { assertions, unexpectedFailures } = evaluateAssertions({ frame: renderedFrame, failures, options });
  const screenshotPath = join(outputDir, 'preview.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await browser.close();

  const report = {
    url: options.url,
    passed: assertions.every(assertion => assertion.pass),
    screenshotPath,
    renderedFrame,
    frames,
    failures,
    unexpectedFailures,
    consoleMessages,
    assertions,
  };

  const reportPath = join(outputDir, 'report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Preview battle test: ${report.passed ? 'PASS' : 'FAIL'}`);
    console.log(`URL: ${options.url}`);
    console.log(`Report: ${reportPath}`);
    console.log(`Screenshot: ${screenshotPath}`);
    for (const assertion of assertions) {
      console.log(`${assertion.pass ? '✓' : '✗'} ${assertion.name}: ${assertion.details}`);
    }
  }

  if (!report.passed)
    process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
