import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
// @ts-expect-error - untyped ESM helper module
import { launchQaBrowser, settlePage } from './qa-browser.mjs';
import { isCaptureBlockedBySecurityPage } from '../../src/design/page-capturer';

export type RawSection = {
  tag: string;
  classes: string;
  top: number;
  left: number;
  width: number;
  height: number;
  html: string;
};

export type CapturedSection = RawSection & { index: number; screenshotFile: string };

export type CaptureBundle = {
  url: string;
  capturedAt: string;
  viewport: { width: number; height: number };
  pageHeight: number;
  fullPageFile: string;
  sections: CapturedSection[];
};

export class CaptureBlockedError extends Error {}

const VIEWPORT = { width: 1440, height: 900 };
const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const MAX_SECTION_SCREENSHOT_HEIGHT = 2000;

export function normalizeRawSections(
  raw: RawSection[],
  opts: { maxHtmlLength?: number; minHeight?: number; minWidth?: number } = {},
): RawSection[] {
  const maxHtmlLength = opts.maxHtmlLength ?? 200_000;
  const minHeight = opts.minHeight ?? 50;
  const minWidth = opts.minWidth ?? 200;
  const seenHtml = new Set<string>();
  return [...raw]
    .sort((a, b) => a.top - b.top)
    .filter((section) => section.height >= minHeight && section.width >= minWidth)
    .filter((section) => {
      if (seenHtml.has(section.html)) return false;
      seenHtml.add(section.html);
      return true;
    })
    .map((section) => ({ ...section, html: section.html.slice(0, maxHtmlLength) }));
}

export function sectionScreenshotFile(index: number): string {
  return `sections/${String(index).padStart(2, '0')}.png`;
}

export async function captureSectionedPage(
  url: string,
  outDir: string,
  opts: { browserExecutable?: string; settleMs?: number } = {},
): Promise<CaptureBundle> {
  mkdirSync(join(outDir, 'sections'), { recursive: true });
  const browser = await launchQaBrowser(puppeteer, { browserExecutable: opts.browserExecutable });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(SAFARI_UA);
    await page.setViewport(VIEWPORT);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

    // Scroll through the page to trigger lazy-loading (same approach as
    // the Worker's /admin/capture-screenshot route in src/routes/oem-agent.ts).
    await page.evaluate(async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const step = window.innerHeight;
      const maxScroll = document.body.scrollHeight;
      for (let y = 0; y < maxScroll; y += step) {
        window.scrollTo(0, y);
        await delay(300);
      }
      window.scrollTo(0, 0);
      await delay(500);
    });
    await settlePage(page, opts.settleMs ?? 1500);

    const html = await page.content();
    const title = await page.title();
    if (isCaptureBlockedBySecurityPage({ html, title })) {
      throw new CaptureBlockedError(
        `Capture of ${url} hit a security-verification wall. Retry on a normal network with real Chrome.`,
      );
    }

    const fullPageFile = 'full.png';
    await page.screenshot({ path: join(outDir, fullPageFile) as `${string}.png`, fullPage: true, type: 'png' });

    const rawSections = await page.evaluate(() => {
      const selectors = 'section, article, main > div, body > div > div';
      const elements = document.querySelectorAll(selectors);
      const results: Array<{ tag: string; classes: string; top: number; left: number; width: number; height: number; html: string }> = [];
      const seen = new Set<Element>();
      for (const el of elements) {
        const element = el as HTMLElement;
        if (element.offsetHeight < 50 || element.offsetWidth < 200) continue;
        let skip = false;
        for (const s of seen) { if (s.contains(el) && s !== el) { skip = true; break; } }
        if (skip) continue;
        seen.add(el);
        const rect = element.getBoundingClientRect();
        results.push({
          tag: element.tagName.toLowerCase(),
          classes: String(element.className || ''),
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: element.offsetWidth,
          height: element.offsetHeight,
          html: element.outerHTML,
        });
      }
      return results;
    });

    const normalized = normalizeRawSections(rawSections);
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);

    const sections: CapturedSection[] = [];
    for (let index = 0; index < normalized.length; index += 1) {
      const section = normalized[index];
      const screenshotFile = sectionScreenshotFile(index);
      await page.screenshot({
        path: join(outDir, screenshotFile) as `${string}.png`,
        type: 'png',
        clip: {
          x: Math.max(0, section.left),
          y: Math.max(0, section.top),
          width: Math.min(section.width, VIEWPORT.width),
          height: Math.min(section.height, MAX_SECTION_SCREENSHOT_HEIGHT),
        },
      });
      sections.push({ ...section, index, screenshotFile });
    }

    const bundle: CaptureBundle = {
      url,
      capturedAt: new Date().toISOString(),
      viewport: VIEWPORT,
      pageHeight,
      fullPageFile,
      sections,
    };
    writeFileSync(join(outDir, 'sections.json'), `${JSON.stringify(bundle, null, 2)}\n`);
    return bundle;
  } finally {
    await browser.close();
  }
}
