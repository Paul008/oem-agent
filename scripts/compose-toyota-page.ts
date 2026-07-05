#!/usr/bin/env node
/**
 * Composer CLI (block-composition Slice 2).
 *
 * Captures a Toyota page with local real Chrome, segments it, vision-matches
 * each section against the toyota-theme-nuxt catalog (Gemini 2.5 Pro by default;
 * --provider together for Kimi K2.5), extracts props from the DOM, and assembles
 * a draft CmsPageBuilderDocument.
 * Dry-run by default; --post creates the draft via the CMS admin API.
 *
 * Usage:
 *   npx tsx scripts/compose-toyota-page.ts --url https://www.toyota.com.au/rav4
 *   npx tsx scripts/compose-toyota-page.ts --from artifacts/composer/<run>  # reuse capture
 *   ... --post   (requires CMS_ADMIN_EMAIL / CMS_ADMIN_PASSWORD env)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exemplarAbsolutePath, loadCatalog, type LoadedCatalog } from './lib/catalog';
import { createDraftPage, loginToCms } from './lib/cms-client';
import { assembleDocument, buildReport, type SectionPlan } from './lib/composer-assembly';
import { aiExtractProps, extractProps, type Extraction } from './lib/prop-extractor';
import { matchSection, matchSectionWithGemini, type ExemplarImage } from './lib/preset-matcher';
import {
  CaptureBlockedError,
  captureSectionedPage,
  type CaptureBundle,
} from './lib/section-capture';
// @ts-expect-error - untyped ESM helper module
import { timestampForPath } from './lib/qa-browser.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export type ComposerArgs = {
  url: string;
  from: string;
  catalogDir: string;
  cmsUrl: string;
  post: boolean;
  minConfidence: number;
  aiExtract: boolean;
  title: string;
  slug: string;
  provider: 'gemini' | 'together';
};

export function parseComposerArgs(argv: string[]): ComposerArgs {
  const value = (flag: string): string => {
    const index = argv.indexOf(flag);
    if (index === -1) return '';
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`${flag} requires a value`);
    return next;
  };

  const args: ComposerArgs = {
    url: value('--url'),
    from: value('--from'),
    catalogDir: value('--catalog') || '/Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt/catalog',
    cmsUrl: value('--cms-url') || 'http://localhost:3000',
    post: argv.includes('--post'),
    minConfidence: 0.5,
    aiExtract: argv.includes('--ai-extract'),
    title: value('--title'),
    slug: value('--slug'),
    provider: 'gemini',
  };

  const rawConfidence = value('--min-confidence');
  if (rawConfidence) {
    const parsed = Number(rawConfidence);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new Error(`--min-confidence must be a number in [0,1], got: ${rawConfidence}`);
    }
    args.minConfidence = parsed;
  }

  const rawProvider = value('--provider');
  if (rawProvider) {
    if (rawProvider !== 'gemini' && rawProvider !== 'together') {
      throw new Error('--provider must be gemini or together');
    }
    args.provider = rawProvider;
  }

  if (!args.url && !args.from) throw new Error('Provide --url or --from option');
  return args;
}

async function main(): Promise<number> {
  try {
    process.loadEnvFile(join(REPO_ROOT, '.env'));
  } catch {
    // .env optional; env may come from the shell
  }

  const args = parseComposerArgs(process.argv.slice(2));
  const apiKeyEnvVar = args.provider === 'together' ? 'TOGETHER_API_KEY' : 'GEMINI_API_KEY';
  const apiKey = process.env[apiKeyEnvVar] || '';
  if (!apiKey) {
    console.error(`${apiKeyEnvVar} is not set (expected in oem-agent/.env)`);
    return 1;
  }

  let aiExtractEnabled = args.aiExtract;
  if (aiExtractEnabled && args.provider !== 'together') {
    console.warn('--ai-extract currently supports the together provider only; skipping ai fallback');
    aiExtractEnabled = false;
  }

  const catalog = await loadCatalog(args.catalogDir);
  console.log(`Catalog: ${catalog.presets.length} presets from ${catalog.dir}`);

  // --- capture (or replay) ---
  let bundle: CaptureBundle;
  let captureDir: string;
  const runDir = join(REPO_ROOT, 'artifacts', 'composer', `${runSlug(args)}-${timestampForPath()}`);
  mkdirSync(runDir, { recursive: true });

  if (args.from) {
    captureDir = resolve(args.from.startsWith('/') ? args.from : join(REPO_ROOT, args.from), 'capture');
    bundle = JSON.parse(readFileSync(join(captureDir, 'sections.json'), 'utf8')) as CaptureBundle;
    console.log(`Replaying capture from ${captureDir} (${bundle.sections.length} sections)`);
  } else {
    captureDir = join(runDir, 'capture');
    try {
      bundle = await captureSectionedPage(args.url, captureDir);
    } catch (error) {
      if (error instanceof CaptureBlockedError) {
        console.error(error.message);
        return 2;
      }
      throw error;
    }
    console.log(`Captured ${bundle.sections.length} sections from ${args.url}`);
  }

  if (bundle.sections.length === 0) {
    console.error('Zero sections detected — capture bundle retained for inspection.');
    return 3;
  }

  // --- match + extract ---
  const exemplars: ExemplarImage[] = catalog.presets.map((preset) => ({
    presetId: preset.id,
    base64: readFileSync(exemplarAbsolutePath(catalog, preset)).toString('base64'),
  }));

  const plans: SectionPlan[] = [];
  for (const section of bundle.sections) {
    const sectionBase64 = readFileSync(join(captureDir, section.screenshotFile)).toString('base64');
    const match = args.provider === 'together'
      ? await matchSection({ sectionBase64, exemplars, catalog, apiKey })
      : await matchSectionWithGemini({ sectionBase64, exemplars, catalog, apiKey });
    const accepted = match.presetId !== null && match.confidence >= args.minConfidence;
    const preset = accepted ? catalog.presets.find((entry) => entry.id === match.presetId) ?? null : null;

    let extraction: Extraction | null = null;
    if (preset) {
      extraction = extractProps(section.html, preset, bundle.url);
      if (aiExtractEnabled && extraction.filledRatio < 0.5) {
        try {
          const aiExtraction = await aiExtractProps({
            sectionHtml: section.html, preset, sourceUrl: bundle.url, apiKey,
          });
          if (aiExtraction.filledRatio > extraction.filledRatio) extraction = aiExtraction;
        } catch (error) {
          console.warn(`  ai-extract failed for section ${section.index}: ${(error as Error).message}`);
        }
      }
    }

    const effectiveMatch = accepted ? match : { ...match, presetId: null };
    plans.push({ section, match: effectiveMatch, preset, extraction });
    const verdict = preset ? `${preset.id} (${match.confidence.toFixed(2)})` : `no match (${match.confidence.toFixed(2)})`;
    console.log(`  section ${section.index}: ${verdict}`);
  }

  // --- assemble + report ---
  const document = assembleDocument(plans);
  const report = buildReport({
    url: bundle.url, capturedAt: bundle.capturedAt, minConfidence: args.minConfidence, plans,
  });
  writeFileSync(join(runDir, 'document.json'), `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(join(runDir, 'report.json'), `${JSON.stringify(report.json, null, 2)}\n`);
  writeFileSync(join(runDir, 'report.md'), report.markdown);
  console.log(`\n${report.markdown}`);
  console.log(`Artifacts: ${runDir}`);

  // --- post (opt-in) ---
  if (args.post) {
    const email = process.env.CMS_ADMIN_EMAIL || '';
    const password = process.env.CMS_ADMIN_PASSWORD || '';
    if (!email || !password) {
      console.error('--post requires CMS_ADMIN_EMAIL and CMS_ADMIN_PASSWORD env vars');
      return 4;
    }
    try {
      const session = await loginToCms(args.cmsUrl, email, password);
      const pagePath = new URL(bundle.url).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'page';
      const result = await createDraftPage(session, {
        title: args.title || `Composed: ${pagePath}`,
        slug: args.slug || `composed-${pagePath}`,
        content: document,
      });
      writeFileSync(join(runDir, 'post-result.json'), `${JSON.stringify(result, null, 2)}\n`);
      console.log(`Draft created in CMS: ${JSON.stringify(result).slice(0, 200)}`);
    } catch (error) {
      console.error((error as Error).message);
      return 4;
    }
  } else {
    console.log('Dry run (no --post): document.json written, nothing sent to the CMS.');
  }

  return 0;
}

function runSlug(args: ComposerArgs): string {
  if (args.url) {
    try {
      return new URL(args.url).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'page';
    } catch {
      return 'page';
    }
  }
  return 'replay';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
