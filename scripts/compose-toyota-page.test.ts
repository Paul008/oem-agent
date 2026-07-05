import { describe, expect, it } from 'vitest';
import { parseComposerArgs } from './compose-toyota-page';

describe('parseComposerArgs', () => {
  it('applies defaults', () => {
    const args = parseComposerArgs(['--url', 'https://www.toyota.com.au/rav4']);
    expect(args).toMatchObject({
      url: 'https://www.toyota.com.au/rav4',
      catalogDir: '/Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt/catalog',
      cmsUrl: 'http://localhost:3000',
      post: false,
      minConfidence: 0.5,
      aiExtract: false,
      from: '',
    });
  });

  it('honours overrides', () => {
    const args = parseComposerArgs([
      '--url', 'https://x', '--catalog', '/tmp/cat', '--cms-url', 'http://cms:4000',
      '--post', '--min-confidence', '0.7', '--ai-extract', '--title', 'T', '--slug', 's',
    ]);
    expect(args).toMatchObject({
      catalogDir: '/tmp/cat', cmsUrl: 'http://cms:4000', post: true,
      minConfidence: 0.7, aiExtract: true, title: 'T', slug: 's',
    });
  });

  it('accepts --from instead of --url', () => {
    const args = parseComposerArgs(['--from', 'artifacts/composer/run-1']);
    expect(args.from).toBe('artifacts/composer/run-1');
  });

  it('throws when neither --url nor --from is given', () => {
    expect(() => parseComposerArgs([])).toThrow(/--url or --from/);
  });

  it('throws on invalid --min-confidence', () => {
    expect(() => parseComposerArgs(['--url', 'x', '--min-confidence', 'nope'])).toThrow(/min-confidence/);
  });
});
