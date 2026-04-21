#!/usr/bin/env node
/**
 * Quick end-to-end test for the GAC scraper.
 *   npx tsx scripts/test-gac-scraper.mjs [path]
 * Defaults to /hatchback/aion-ut.
 */
import { scrapeGacModelPage } from '../src/design/gac-scraper.ts';

async function main() {
const path = process.argv[2] || '/hatchback/aion-ut';
const result = await scrapeGacModelPage(path);

console.log('success:', result.success);
console.log('slug:', result.slug);
console.log('name:', result.name);
console.log('warnings (' + result.warnings.length + '):', result.warnings.slice(0, 5));
console.log(`sections (${result.sections.length}):`);
for (const s of result.sections) {
  console.log(`  [${s.order}] ${s.type}  id=${s.id}`);
  if (s.type === 'pinned-scroll') {
    console.log(`         title: ${JSON.stringify(s.title || '')}`);
    console.log(`         bg:    ${s.background_image ? s.background_image.slice(0, 90) + '…' : '(none)'}`);
    console.log(`         cards: ${s.cards?.length ?? 0}`);
    for (const c of s.cards || []) {
      console.log(`           · ${(c.caption || '').slice(0, 80)}`);
    }
  } else if (s.type === 'hero') {
    console.log(`         heading: ${JSON.stringify(s.heading || '')}`);
    console.log(`         desktop: ${s.desktop_image_url ? s.desktop_image_url.slice(0, 90) + '…' : '(none)'}`);
  } else if (s.type === 'content-block') {
    console.log(`         title: ${JSON.stringify(s.title || '')}`);
    console.log(`         body:  ${(s.content_html || '').slice(0, 80)}…`);
  } else if (s.type === 'cta-banner') {
    console.log(`         heading: ${JSON.stringify(s.heading || '')}`);
  }
}
}
main().catch((err) => { console.error('ERR:', err); process.exit(1); });
