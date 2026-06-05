#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';

const DEFAULT_PREVIEW_BASE = 'https://oem-dashboard.pages.dev/preview';
const DEFAULT_OUTPUT_DIR = 'artifacts/oem-fidelity';
const DEFAULT_THRESHOLD = 0.12;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_SETTLE_MS = 2_000;
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

export const VIEWPORTS = {
  desktop: { name: 'desktop', width: 1440, height: 1100, isMobile: false, hasTouch: false },
  tablet: { name: 'tablet', width: 820, height: 1180, isMobile: false, hasTouch: true },
  mobile: { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
};

const PREVIEW_CHROME_CSS = [
  '[data-oem-preview-toolbar="true"]{display:none!important}',
  '.vue-sonner-toaster,[data-sonner-toaster]{display:none!important}',
].join('\n');

const STABILIZE_CSS = [
  '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}',
  'html,body{caret-color:transparent!important}',
].join('\n');

const COMMON_SOURCE_CHROME_SELECTORS = [
  'header',
  'nav',
  '[role="navigation"]',
  '.navbar',
  '.masthead',
  '.site-header',
  '.global-header',
  '.global-nav',
  '.skip-link',
  '.cookie',
  '[class*="cookie"]',
  '[id*="cookie"]',
];

function boolArg(value) {
  if (value === undefined)
    return true;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function readNext(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${arg} requires a value`);
  return value;
}

export function parseCliArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    previewBase: DEFAULT_PREVIEW_BASE,
    threshold: DEFAULT_THRESHOLD,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    settleMs: DEFAULT_SETTLE_MS,
    viewports: ['desktop', 'tablet', 'mobile'],
    hideCommonSourceChrome: true,
    sourceHideSelectors: [],
    previewHideSelectors: [],
    loadLazyMedia: true,
    json: false,
    failOn: 'critical',
    browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH || '',
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--source-url') {
      options.sourceUrl = readNext(argv, index, arg);
      index++;
    } else if (arg === '--preview-url') {
      options.previewUrl = readNext(argv, index, arg);
      index++;
    } else if (arg === '--slug') {
      options.slug = readNext(argv, index, arg);
      index++;
    } else if (arg === '--preview-base') {
      options.previewBase = readNext(argv, index, arg).replace(/\/+$/, '');
      index++;
    } else if (arg === '--output-dir') {
      options.outputDir = readNext(argv, index, arg);
      index++;
    } else if (arg === '--viewports') {
      options.viewports = readNext(argv, index, arg).split(',').map(v => v.trim()).filter(Boolean);
      index++;
    } else if (arg === '--threshold') {
      options.threshold = Number(readNext(argv, index, arg));
      index++;
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number(readNext(argv, index, arg));
      index++;
    } else if (arg === '--settle-ms') {
      options.settleMs = Number(readNext(argv, index, arg));
      index++;
    } else if (arg === '--source-hide') {
      options.sourceHideSelectors.push(readNext(argv, index, arg));
      index++;
    } else if (arg === '--preview-hide') {
      options.previewHideSelectors.push(readNext(argv, index, arg));
      index++;
    } else if (arg === '--load-lazy-media') {
      options.loadLazyMedia = boolArg(argv[index + 1]?.startsWith('--') ? undefined : argv[++index]);
    } else if (arg === '--no-load-lazy-media') {
      options.loadLazyMedia = false;
    } else if (arg === '--hide-common-source-chrome') {
      options.hideCommonSourceChrome = boolArg(argv[index + 1]?.startsWith('--') ? undefined : argv[++index]);
    } else if (arg === '--no-common-source-chrome') {
      options.hideCommonSourceChrome = false;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--fail-on') {
      options.failOn = readNext(argv, index, arg);
      index++;
    } else if (arg === '--browser-executable') {
      options.browserExecutable = readNext(argv, index, arg);
      index++;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(options.threshold) || options.threshold < 0)
    throw new Error('--threshold must be a non-negative number');

  for (const viewport of options.viewports) {
    if (!VIEWPORTS[viewport])
      throw new Error(`Unknown viewport "${viewport}". Use one of: ${Object.keys(VIEWPORTS).join(', ')}`);
  }

  if (!options.previewUrl && options.slug)
    options.previewUrl = `${options.previewBase}/${encodeURIComponent(options.slug)}?view=production`;

  if (!options.sourceUrl)
    throw new Error('--source-url is required');
  if (!options.previewUrl)
    throw new Error('--preview-url or --slug is required');

  return options;
}

function timestampForPath(date = new Date()) {
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

function cssForHiddenSelectors(selectors) {
  return selectors
    .flatMap(item => String(item).split(',').map(selector => selector.trim()).filter(Boolean))
    .map(selector => `${selector}{display:none!important}`)
    .join('\n');
}

function normalizeUrl(value) {
  if (!value)
    return '';

  let raw = String(value);
  try {
    const url = new URL(raw);
    const proxied = url.searchParams.get('url') || url.searchParams.get('src');
    if (proxied)
      raw = decodeURIComponent(proxied);
  } catch {
    return raw;
  }

  try {
    const url = new URL(raw);
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return raw.split(/[?#]/)[0];
  }
}

export function imageIdentityKey(value) {
  const normalized = normalizeUrl(value);
  if (!normalized)
    return '';
  const path = normalized.split('/').filter(Boolean).pop() || normalized;
  return path.toLowerCase();
}

function severityRank(severity) {
  if (severity === 'critical')
    return 3;
  if (severity === 'warning')
    return 2;
  return 1;
}

function shouldFail(findings, failOn) {
  if (failOn === 'none')
    return false;
  const min = failOn === 'warning' ? 2 : 3;
  return findings.some(finding => severityRank(finding.severity) >= min);
}

async function addStyle(page, css) {
  if (!css.trim())
    return;
  await page.addStyleTag({ content: css });
}

async function settlePage(page, settleMs) {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready)
      await document.fonts.ready;
  }).catch(() => null);
  await new Promise(resolve => setTimeout(resolve, settleMs));
}

async function warmLazyMedia(page, options) {
  if (!options.loadLazyMedia)
    return;

  await page.evaluate(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    for (const image of document.images) {
      if (image.getAttribute('loading') === 'lazy')
        image.setAttribute('loading', 'eager');
    }

    const root = document.documentElement;
    const body = document.body;
    const viewportHeight = window.innerHeight || root.clientHeight || 800;
    const maxScroll = Math.max(0, Math.max(root.scrollHeight, body?.scrollHeight || 0) - viewportHeight);
    const step = Math.max(240, Math.round(viewportHeight * 0.75));

    for (let y = 0; y < maxScroll; y += step) {
      window.scrollTo(0, y);
      await wait(80);
    }

    window.scrollTo(0, maxScroll);
    await wait(160);
    window.scrollTo(0, 0);
  }).catch(() => null);

  await settlePage(page, Math.max(250, Math.min(1_000, Math.round(options.settleMs / 2))));
}

function networkSummary(events) {
  return {
    failed: events.failed.slice(0, 25),
    badResponses: events.badResponses.slice(0, 25),
    failedCount: events.failed.length,
    badResponseCount: events.badResponses.length,
  };
}

function isIgnoredNetworkUrl(url) {
  return /facebook\.com\/privacy_sandbox|facebook\.com\/tr|bs\.serving-sys\.com|doubleclick\.net|google-analytics\.com|googletagmanager\.com|\/akam\//i.test(String(url));
}

async function createCapturePage(browser, viewport) {
  const page = await browser.newPage();
  const network = { failed: [], badResponses: [] };

  page.on('requestfailed', request => {
    const type = request.resourceType();
    if (['document', 'image', 'font', 'stylesheet', 'script'].includes(type) && !isIgnoredNetworkUrl(request.url())) {
      network.failed.push({
        type,
        url: request.url(),
        reason: request.failure()?.errorText || 'requestfailed',
      });
    }
  });

  page.on('response', response => {
    const status = response.status();
    const request = response.request();
    const type = request.resourceType();
    if (status >= 400 && ['document', 'image', 'font', 'stylesheet', 'script'].includes(type) && !isIgnoredNetworkUrl(response.url())) {
      network.badResponses.push({
        status,
        type,
        url: response.url(),
      });
    }
  });

  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
  });
  await page.setUserAgent(viewport.isMobile ? MOBILE_USER_AGENT : DESKTOP_USER_AGENT);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-AU,en;q=0.9' });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  return { page, network };
}

async function prepareTargetPage(page, target, options) {
  await addStyle(page, STABILIZE_CSS);
  if (target.kind === 'source' && options.hideCommonSourceChrome)
    await addStyle(page, cssForHiddenSelectors(COMMON_SOURCE_CHROME_SELECTORS));
  if (target.kind === 'source')
    await addStyle(page, cssForHiddenSelectors(options.sourceHideSelectors));
  if (target.kind === 'preview')
    await addStyle(page, `${PREVIEW_CHROME_CSS}\n${cssForHiddenSelectors(options.previewHideSelectors)}`);
}

async function captureTarget(browser, target, viewport, outputDir, options) {
  const { page, network } = await createCapturePage(browser, viewport);
  await page.goto(target.url, {
    waitUntil: 'networkidle2',
    timeout: options.timeoutMs,
  });

  await prepareTargetPage(page, target, options);
  await settlePage(page, options.settleMs);

  if (target.kind === 'preview') {
    const frameHtml = await page.$eval('iframe[title="Clone Studio canvas"]', element => element.getAttribute('srcdoc') || '').catch(() => '');
    if (frameHtml.length > 1000) {
      await page.close();
      return captureHtmlTarget(browser, target, viewport, outputDir, options, frameHtml);
    }
  }

  await warmLazyMedia(page, options);

  const audit = await collectAudit(page);

  const screenshotPath = join(outputDir, `${target.kind}-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true, type: 'png' });
  await page.close();

  return {
    target: target.kind,
    url: target.url,
    viewport: viewport.name,
    viewportSize: { width: viewport.width, height: viewport.height },
    screenshotPath,
    network: networkSummary(network),
    audit,
  };
}

async function captureHtmlTarget(browser, target, viewport, outputDir, options, html) {
  const { page, network } = await createCapturePage(browser, viewport);
  await page.setContent(html, {
    waitUntil: 'networkidle2',
    timeout: options.timeoutMs,
  });
  await prepareTargetPage(page, target, options);
  await settlePage(page, options.settleMs);
  await warmLazyMedia(page, options);

  const audit = await collectAudit(page);
  const screenshotPath = join(outputDir, `${target.kind}-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true, type: 'png' });
  await page.close();

  return {
    target: target.kind,
    url: target.url,
    viewport: viewport.name,
    viewportSize: { width: viewport.width, height: viewport.height },
    screenshotPath,
    network: networkSummary(network),
    audit,
  };
}

async function collectAudit(page) {
  return await page.evaluate(() => {
    function rectFor(element) {
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        area: Math.round(Math.max(0, rect.width) * Math.max(0, rect.height)),
      };
    }

    function visible(element) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0.01
        && rect.width > 1
        && rect.height > 1;
    }

    function textContent(element) {
      return (element.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function parseColor(value) {
      const match = String(value).match(/rgba?\(([^)]+)\)/i);
      if (!match)
        return null;
      const parts = match[1].split(',').map(part => Number(part.trim()));
      if (parts.length < 3 || parts.some((part, index) => index < 3 && !Number.isFinite(part)))
        return null;
      return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
    }

    function backgroundFor(element) {
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color && color.a > 0.2)
          return color;
        current = current.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    }

    function luminance(color) {
      const channel = [color.r, color.g, color.b].map(value => {
        const s = value / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channel[0] + 0.7152 * channel[1] + 0.0722 * channel[2];
    }

    function contrastRatio(foreground, background) {
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return (light + 0.05) / (dark + 0.05);
    }

    function selectorFor(element) {
      const id = element.id ? `#${element.id}` : '';
      const className = String(element.className || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map(name => `.${name}`)
        .join('');
      return `${element.tagName.toLowerCase()}${id}${className}`;
    }

    function backgroundUrls(element) {
      const image = getComputedStyle(element).backgroundImage;
      if (!image || image === 'none')
        return [];
      const urls = [];
      const pattern = /url\((["']?)(.*?)\1\)/g;
      let match;
      while ((match = pattern.exec(image)))
        urls.push(match[2]);
      return urls;
    }

    const images = [...document.images].map(img => ({
      selector: selectorFor(img),
      src: img.getAttribute('src') || '',
      currentSrc: img.currentSrc || img.src || '',
      srcset: img.getAttribute('srcset') || '',
      sizes: img.getAttribute('sizes') || '',
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      loading: img.getAttribute('loading') || '',
      rect: rectFor(img),
      visible: visible(img),
    }));

    const backgrounds = [...document.querySelectorAll('body *')]
      .filter(visible)
      .flatMap(element => backgroundUrls(element).map(url => ({
        selector: selectorFor(element),
        url,
        rect: rectFor(element),
      })))
      .sort((a, b) => b.rect.area - a.rect.area)
      .slice(0, 20);

    function intersectsMedia(rect) {
      const mediaRects = [
        ...images.filter(image => image.visible && image.rect.area > 10_000).map(image => image.rect),
        ...backgrounds.filter(background => background.rect.area > 10_000).map(background => background.rect),
      ];
      return mediaRects.some(media => {
        const xOverlap = Math.max(0, Math.min(rect.x + rect.width, media.x + media.width) - Math.max(rect.x, media.x));
        const yOverlap = Math.max(0, Math.min(rect.y + rect.height, media.y + media.height) - Math.max(rect.y, media.y));
        return xOverlap * yOverlap > Math.max(200, rect.area * 0.2);
      });
    }

    const clippedText = [...document.querySelectorAll('body *')]
      .filter(element => visible(element) && textContent(element).length > 12)
      .filter(element => element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2)
      .map(element => ({
        selector: selectorFor(element),
        text: textContent(element).slice(0, 120),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        rect: rectFor(element),
      }))
      .slice(0, 25);

    const lowContrastText = [...document.querySelectorAll('body p, body span, body a, body button, body h1, body h2, body h3, body h4, body h5, body h6, body li')]
      .filter(element => visible(element) && textContent(element).length > 2)
      .map(element => {
        const style = getComputedStyle(element);
        const foreground = parseColor(style.color);
        const background = backgroundFor(element);
        const ratio = foreground ? contrastRatio(foreground, background) : 99;
        const rect = rectFor(element);
        return {
          selector: selectorFor(element),
          text: textContent(element).slice(0, 90),
          ratio: Math.round(ratio * 100) / 100,
          fontSize: style.fontSize,
          color: style.color,
          background: `rgb(${background.r}, ${background.g}, ${background.b})`,
          overMedia: intersectsMedia(rect),
          rect,
        };
      })
      .filter(item => item.ratio < 3 && !item.overMedia)
      .slice(0, 20);

    const root = document.documentElement;
    const body = document.body;
    const overflowOffenders = [...document.querySelectorAll('body *')]
      .filter(visible)
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
          selector: selectorFor(element),
          rightOverflow: Math.round(Math.max(0, rect.right - root.clientWidth)),
          leftOverflow: Math.round(Math.max(0, -rect.left)),
          rect: rectFor(element),
        };
      })
      .filter(item => item.rightOverflow > 4 || item.leftOverflow > 4)
      .sort((a, b) => Math.max(b.rightOverflow, b.leftOverflow) - Math.max(a.rightOverflow, a.leftOverflow))
      .slice(0, 25);

    const largestImages = images
      .filter(image => image.visible && image.rect.area > 10_000)
      .sort((a, b) => b.rect.area - a.rect.area)
      .slice(0, 10);

    return {
      title: document.title,
      url: location.href,
      viewport: {
        width: root.clientWidth,
        height: window.innerHeight,
        scrollWidth: root.scrollWidth,
        scrollHeight: Math.max(root.scrollHeight, body?.scrollHeight || 0),
        horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
      },
      images: {
        total: images.length,
        visible: images.filter(image => image.visible).length,
        broken: images.filter(image => image.visible && (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0)),
        largest: largestImages,
      },
      backgrounds,
      clippedText,
      lowContrastText,
      overflowOffenders,
    };
  });
}

async function compareScreenshots(browser, sourcePath, previewPath, diffPath, threshold) {
  const page = await browser.newPage();
  const [sourceBuffer, previewBuffer] = await Promise.all([
    readFile(sourcePath),
    readFile(previewPath),
  ]);
  const result = await page.evaluate(async ({ sourcePath, previewPath, threshold }) => {
    async function loadImage(path) {
      const image = new Image();
      image.src = path;
      await image.decode();
      return image;
    }

    function drawImage(image, width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return { canvas, context, data: context.getImageData(0, 0, width, height) };
    }

    const [sourceImage, previewImage] = await Promise.all([
      loadImage(sourcePath),
      loadImage(previewPath),
    ]);

    const width = Math.min(sourceImage.naturalWidth, previewImage.naturalWidth);
    const height = Math.min(sourceImage.naturalHeight, previewImage.naturalHeight);
    const source = drawImage(sourceImage, width, height);
    const preview = drawImage(previewImage, width, height);
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = width;
    diffCanvas.height = height;
    const diffContext = diffCanvas.getContext('2d');
    const diff = diffContext.createImageData(width, height);

    let diffPixels = 0;
    let totalDelta = 0;
    const limit = Math.round(threshold * 255);
    for (let index = 0; index < source.data.data.length; index += 4) {
      const dr = Math.abs(source.data.data[index] - preview.data.data[index]);
      const dg = Math.abs(source.data.data[index + 1] - preview.data.data[index + 1]);
      const db = Math.abs(source.data.data[index + 2] - preview.data.data[index + 2]);
      const da = Math.abs(source.data.data[index + 3] - preview.data.data[index + 3]);
      const delta = Math.max(dr, dg, db, da);
      totalDelta += delta;

      if (delta > limit) {
        diffPixels++;
        diff.data[index] = 255;
        diff.data[index + 1] = 32;
        diff.data[index + 2] = 32;
        diff.data[index + 3] = 220;
      } else {
        const gray = Math.round((source.data.data[index] + source.data.data[index + 1] + source.data.data[index + 2]) / 3);
        diff.data[index] = gray;
        diff.data[index + 1] = gray;
        diff.data[index + 2] = gray;
        diff.data[index + 3] = 80;
      }
    }

    diffContext.putImageData(diff, 0, 0);
    return {
      width,
      height,
      sourceSize: { width: sourceImage.naturalWidth, height: sourceImage.naturalHeight },
      previewSize: { width: previewImage.naturalWidth, height: previewImage.naturalHeight },
      comparedPixels: width * height,
      diffPixels,
      mismatchPercent: width && height ? diffPixels / (width * height) : 1,
      averageChannelDelta: width && height ? totalDelta / (width * height) : 255,
      diffDataUrl: diffCanvas.toDataURL('image/png'),
    };
  }, {
    sourcePath: `data:image/png;base64,${sourceBuffer.toString('base64')}`,
    previewPath: `data:image/png;base64,${previewBuffer.toString('base64')}`,
    threshold,
  });
  await page.close();

  const base64 = result.diffDataUrl.replace(/^data:image\/png;base64,/, '');
  await writeFile(diffPath, Buffer.from(base64, 'base64'));
  delete result.diffDataUrl;
  return { ...result, diffPath };
}

export function buildCaptureFindings(pair) {
  const findings = [];
  for (const capture of [pair.source, pair.preview]) {
    const label = `${capture.target}/${capture.viewport}`;
    if (capture.network.failedCount > 0) {
      findings.push({
        severity: 'critical',
        viewport: capture.viewport,
        target: capture.target,
        type: 'network-failed',
        message: `${label} has ${capture.network.failedCount} failed document/image/font/script request(s).`,
        samples: capture.network.failed,
      });
    }
    if (capture.network.badResponseCount > 0) {
      findings.push({
        severity: 'warning',
        viewport: capture.viewport,
        target: capture.target,
        type: 'network-bad-response',
        message: `${label} has ${capture.network.badResponseCount} asset response(s) with HTTP 4xx/5xx.`,
        samples: capture.network.badResponses,
      });
    }
    if (capture.audit.images.broken.length > 0) {
      findings.push({
        severity: capture.target === 'preview' ? 'critical' : 'info',
        viewport: capture.viewport,
        target: capture.target,
        type: 'broken-images',
        message: `${label} renders ${capture.audit.images.broken.length} broken visible image(s).`,
        samples: capture.audit.images.broken.slice(0, 10),
      });
    }
    if (capture.target !== 'preview')
      continue;
    if (capture.audit.viewport.horizontalOverflow > 4) {
      findings.push({
        severity: 'warning',
        viewport: capture.viewport,
        target: capture.target,
        type: 'horizontal-overflow',
        message: `${label} has ${capture.audit.viewport.horizontalOverflow}px root horizontal overflow.`,
        samples: capture.audit.overflowOffenders.slice(0, 10),
      });
    }
    if (capture.audit.clippedText.length > 0) {
      findings.push({
        severity: 'warning',
        viewport: capture.viewport,
        target: capture.target,
        type: 'clipped-text',
        message: `${label} has ${capture.audit.clippedText.length} clipped/overflowing text block(s).`,
        samples: capture.audit.clippedText.slice(0, 10),
      });
    }
    if (capture.audit.lowContrastText.length > 0) {
      findings.push({
        severity: 'warning',
        viewport: capture.viewport,
        target: capture.target,
        type: 'low-contrast-text',
        message: `${label} has ${capture.audit.lowContrastText.length} low-contrast visible text sample(s).`,
        samples: capture.audit.lowContrastText.slice(0, 10),
      });
    }
  }

  if (pair.diff.mismatchPercent > 0.35) {
    findings.push({
      severity: 'warning',
      viewport: pair.viewport,
      target: 'comparison',
      type: 'high-visual-diff',
      message: `${pair.viewport} visual mismatch is ${(pair.diff.mismatchPercent * 100).toFixed(2)}%.`,
      samples: [{ diffPath: pair.diff.diffPath }],
    });
  }

  if (pair.diff.sourceSize.width !== pair.diff.previewSize.width || pair.diff.sourceSize.height !== pair.diff.previewSize.height) {
    findings.push({
      severity: 'warning',
      viewport: pair.viewport,
      target: 'comparison',
      type: 'page-size-mismatch',
      message: `${pair.viewport} screenshot sizes differ: source ${pair.diff.sourceSize.width}x${pair.diff.sourceSize.height}, preview ${pair.diff.previewSize.width}x${pair.diff.previewSize.height}.`,
      samples: [],
    });
  }

  return findings;
}

export function buildResponsiveImageFindings(pairs) {
  const findings = [];
  const byViewport = new Map(pairs.map(pair => [pair.viewport, pair]));
  const desktop = byViewport.get('desktop');
  const mobile = byViewport.get('mobile');
  if (!desktop || !mobile)
    return findings;

  for (const target of ['source', 'preview']) {
    const desktopImage = desktop[target].audit.images.largest[0];
    const mobileImage = mobile[target].audit.images.largest[0];
    if (!desktopImage || !mobileImage)
      continue;

    const desktopKey = imageIdentityKey(desktopImage.currentSrc || desktopImage.src);
    const mobileKey = imageIdentityKey(mobileImage.currentSrc || mobileImage.src);
    if (desktopKey && mobileKey && desktopKey === mobileKey) {
      findings.push({
        severity: target === 'preview' ? 'warning' : 'info',
        viewport: 'mobile',
        target,
        type: 'same-largest-image-desktop-mobile',
        message: `${target} uses the same largest rendered image on desktop and mobile. Verify art direction for the hero/large media block.`,
        samples: [
          { viewport: 'desktop', url: desktopImage.currentSrc || desktopImage.src, rect: desktopImage.rect },
          { viewport: 'mobile', url: mobileImage.currentSrc || mobileImage.src, rect: mobileImage.rect },
        ],
      });
    }
  }

  const sourceDesktop = imageIdentityKey(desktop.source.audit.images.largest[0]?.currentSrc || desktop.source.audit.images.largest[0]?.src);
  const sourceMobile = imageIdentityKey(mobile.source.audit.images.largest[0]?.currentSrc || mobile.source.audit.images.largest[0]?.src);
  const previewDesktop = imageIdentityKey(desktop.preview.audit.images.largest[0]?.currentSrc || desktop.preview.audit.images.largest[0]?.src);
  const previewMobile = imageIdentityKey(mobile.preview.audit.images.largest[0]?.currentSrc || mobile.preview.audit.images.largest[0]?.src);
  if (sourceDesktop && sourceMobile && previewDesktop && previewMobile && sourceDesktop !== sourceMobile && previewDesktop === previewMobile) {
    findings.push({
      severity: 'critical',
      viewport: 'mobile',
      target: 'preview',
      type: 'missing-mobile-art-direction',
      message: 'Source swaps its largest image between desktop and mobile, but preview keeps the same image. This usually means the clone is not honoring mobile art direction.',
      samples: [
        { target: 'source desktop', key: sourceDesktop },
        { target: 'source mobile', key: sourceMobile },
        { target: 'preview desktop', key: previewDesktop },
        { target: 'preview mobile', key: previewMobile },
      ],
    });
  }

  return findings;
}

export function scoreCapturePair(pair) {
  let score = 100;
  score -= Math.min(50, pair.diff.mismatchPercent * 90);
  score -= pair.preview.network.failedCount * 8;
  score -= pair.preview.audit.images.broken.length * 10;
  score -= pair.preview.audit.clippedText.length * 2;
  score -= pair.preview.audit.lowContrastText.length;
  score -= pair.preview.audit.viewport.horizontalOverflow > 4 ? 8 : 0;
  return Math.max(0, Math.round(score * 10) / 10);
}

function relativeArtifact(path, outputDir) {
  return path.startsWith(outputDir) ? path.slice(outputDir.length + 1) : path;
}

function renderFindingSamples(samples = []) {
  if (!samples.length)
    return '';
  return samples.slice(0, 3).map(sample => `    ${JSON.stringify(sample)}`).join('\n');
}

export function renderMarkdownReport(report) {
  const lines = [
    '# OEM Fidelity Report',
    '',
    `- Source: ${report.sourceUrl}`,
    `- Preview: ${report.previewUrl}`,
    `- Created: ${report.createdAt}`,
    `- Overall score: ${report.overallScore}/100`,
    `- Fail status: ${report.failed ? 'failed' : 'passed'}`,
    '',
    '## Viewports',
    '',
    '| Viewport | Score | Mismatch | Source Size | Preview Size | Diff |',
    '| --- | ---: | ---: | --- | --- | --- |',
  ];

  for (const pair of report.pairs) {
    lines.push(`| ${pair.viewport} | ${pair.score} | ${(pair.diff.mismatchPercent * 100).toFixed(2)}% | ${pair.diff.sourceSize.width}x${pair.diff.sourceSize.height} | ${pair.diff.previewSize.width}x${pair.diff.previewSize.height} | ${relativeArtifact(pair.diff.diffPath, report.outputDir)} |`);
  }

  lines.push('', '## Findings', '');
  if (!report.findings.length) {
    lines.push('No findings above the configured thresholds.');
  } else {
    for (const finding of report.findings) {
      lines.push(`- [${finding.severity}] ${finding.target}/${finding.viewport} ${finding.type}: ${finding.message}`);
      const samples = renderFindingSamples(finding.samples);
      if (samples)
        lines.push(samples);
    }
  }

  lines.push('', '## Artifacts', '');
  for (const pair of report.pairs) {
    lines.push(`- ${pair.viewport} source: ${relativeArtifact(pair.source.screenshotPath, report.outputDir)}`);
    lines.push(`- ${pair.viewport} preview: ${relativeArtifact(pair.preview.screenshotPath, report.outputDir)}`);
    lines.push(`- ${pair.viewport} diff: ${relativeArtifact(pair.diff.diffPath, report.outputDir)}`);
  }

  lines.push('', '## AI Review Prompt', '');
  lines.push('Use `ai-review-prompt.md` in this folder with the source, preview, and diff screenshots attached to a vision model.');

  return `${lines.join('\n')}\n`;
}

export function renderAiReviewPrompt(report) {
  return [
    'You are reviewing OEM clone fidelity for an enterprise automotive website.',
    '',
    'Compare the attached source, preview, and diff screenshots for each viewport. Return strict JSON with this shape:',
    '{',
    '  "summary": "one sentence",',
    '  "score": 0-100,',
    '  "issues": [',
    '    { "severity": "critical|warning|info", "viewport": "desktop|tablet|mobile", "section": "short label", "problem": "specific visual problem", "likelyCause": "specific implementation cause", "recommendedFix": "specific fix" }',
    '  ]',
    '}',
    '',
    'Review priorities:',
    '- mobile and desktop art direction: hero/large images must use the correct source for the viewport',
    '- missing or broken media',
    '- hidden, clipped, overflowing, or low-contrast text',
    '- sections with wrong height, crop, spacing, alignment, color, typography, or border treatment',
    '- interactive components that look open/closed incorrectly, especially accordions, tabs, and slideshows',
    '- differences introduced by dashboard preview chrome should be ignored',
    '',
    `Source URL: ${report.sourceUrl}`,
    `Preview URL: ${report.previewUrl}`,
    '',
    'Artifacts:',
    ...report.pairs.flatMap(pair => [
      `- ${pair.viewport} source: ${relativeArtifact(pair.source.screenshotPath, report.outputDir)}`,
      `- ${pair.viewport} preview: ${relativeArtifact(pair.preview.screenshotPath, report.outputDir)}`,
      `- ${pair.viewport} diff: ${relativeArtifact(pair.diff.diffPath, report.outputDir)}`,
    ]),
    '',
    'Machine findings to consider:',
    JSON.stringify(report.findings, null, 2),
    '',
  ].join('\n');
}

export async function runFidelityReport(options) {
  const createdAt = new Date().toISOString();
  const runName = `${options.slug || 'custom'}-${timestampForPath(new Date(createdAt))}`;
  const outputDir = resolve(options.outputDir, runName);
  await mkdir(outputDir, { recursive: true });

  const executablePath = resolveBrowserExecutable(options.browserExecutable);
  const launchOptions = {
    headless: 'new',
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none', '--disable-blink-features=AutomationControlled'],
  };
  if (executablePath)
    launchOptions.executablePath = executablePath;

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Could not find Chrome')) {
      throw new Error([
        'Could not find a browser executable for OEM fidelity capture.',
        'Install Puppeteer Chrome with `pnpm exec puppeteer browsers install chrome`,',
        'or pass `--browser-executable /path/to/chrome`,',
        'or set `PUPPETEER_EXECUTABLE_PATH`.',
      ].join(' '));
    }
    throw error;
  }

  try {
    const pairs = [];
    for (const viewportName of options.viewports) {
      const viewport = VIEWPORTS[viewportName];
      const source = await captureTarget(browser, { kind: 'source', url: options.sourceUrl }, viewport, outputDir, options);
      const preview = await captureTarget(browser, { kind: 'preview', url: options.previewUrl }, viewport, outputDir, options);
      const diffPath = join(outputDir, `diff-${viewport.name}.png`);
      const diff = await compareScreenshots(browser, source.screenshotPath, preview.screenshotPath, diffPath, options.threshold);
      const pair = {
        viewport: viewport.name,
        source,
        preview,
        diff,
        score: 0,
        findings: [],
      };
      pair.findings = buildCaptureFindings(pair);
      pair.score = scoreCapturePair(pair);
      pairs.push(pair);
    }

    const findings = [
      ...pairs.flatMap(pair => pair.findings),
      ...buildResponsiveImageFindings(pairs),
    ].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
    const overallScore = Math.round((pairs.reduce((sum, pair) => sum + pair.score, 0) / pairs.length) * 10) / 10;
    const report = {
      createdAt,
      sourceUrl: options.sourceUrl,
      previewUrl: options.previewUrl,
      outputDir,
      threshold: options.threshold,
      pairs,
      findings,
      overallScore,
      failed: shouldFail(findings, options.failOn),
    };

    await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    await writeFile(join(outputDir, 'report.md'), renderMarkdownReport(report));
    await writeFile(join(outputDir, 'ai-review-prompt.md'), renderAiReviewPrompt(report));
    return report;
  } finally {
    await browser.close();
  }
}

function printUsage() {
  console.error('Usage: pnpm qa:fidelity -- --source-url <url> (--preview-url <url> | --slug <preview-slug>) [options]');
  console.error('');
  console.error('Example:');
  console.error('  pnpm qa:fidelity -- --source-url https://www.ford.com.au/showroom/cars/mustang/ --slug ford-au-mustang');
  console.error('');
  console.error('Options:');
  console.error('  --viewports desktop,tablet,mobile');
  console.error('  --output-dir artifacts/oem-fidelity');
  console.error('  --source-hide ".selector"       Hide source-only chrome before capture. Repeatable.');
  console.error('  --preview-hide ".selector"      Hide preview-only chrome before capture. Repeatable.');
  console.error('  --no-load-lazy-media            Do not scroll/warm lazy images before capture.');
  console.error('  --browser-executable /path      Use an existing Chrome/Chromium executable.');
  console.error('  --no-common-source-chrome       Do not hide common header/nav/cookie selectors.');
  console.error('  --fail-on critical|warning|none');
  console.error('  --json');
}

async function main() {
  let options;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    printUsage();
    console.error('');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const report = await runFidelityReport(options);
  if (options.json) {
    console.log(JSON.stringify({
      outputDir: report.outputDir,
      overallScore: report.overallScore,
      failed: report.failed,
      findings: report.findings,
    }, null, 2));
  } else {
    console.log(`OEM fidelity report: ${report.outputDir}`);
    console.log(`Overall score: ${report.overallScore}/100`);
    console.log(`Findings: ${report.findings.length}`);
    console.log(`Status: ${report.failed ? 'failed' : 'passed'}`);
  }
  if (report.failed)
    process.exitCode = 1;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
