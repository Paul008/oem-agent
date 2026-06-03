import { describe, expect, it } from 'vitest';

describe('clone-studio-audit script', () => {
  it('builds a Kimi evaluate script that toggles iframe inspection and injects the generalized shim', async () => {
    // @ts-ignore - script is plain ESM outside the TypeScript source tree.
    const audit = await import('../../scripts/clone-studio-audit.mjs');

    const code = audit.buildAuditEvaluateCode({ injectShim: true, settleMs: 123 });

    expect(code).toContain('allow-scripts allow-same-origin');
    expect(code).toContain('iframe[title="Clone Studio canvas"]');
    expect(code).toContain('await wait(123)');
    expect(audit.CLONE_STUDIO_SHIM_CSS).toContain('[class*="fadeIn"]');
    expect(audit.CLONE_STUDIO_SHIM_CSS).toContain('.swiper-wrapper');
    expect(audit.CLONE_STUDIO_SHIM_CSS).toContain('overflow-x:clip!important');
  });

  it('summarizes before and after audit metrics for report tables', async () => {
    // @ts-ignore - script is plain ESM outside the TypeScript source tree.
    const audit = await import('../../scripts/clone-studio-audit.mjs');

    const summary = audit.summarizeAuditResult('gwm-au-haval-h6', {
      before: {
        imgs: 27,
        broken: 0,
        stylesheets: 3,
        links: 1,
        fonts: 0,
        hiddenTextBlocks: 0,
        overflow: 535,
      },
      after: {
        imgs: 27,
        broken: 0,
        stylesheets: 4,
        links: 1,
        fonts: 0,
        hiddenTextBlocks: 0,
        overflow: 0,
      },
    });

    expect(summary).toEqual({
      slug: 'gwm-au-haval-h6',
      before: 'imgs=27 broken=0 sheets=3/1 fonts=0 hidden=0 overflow=535',
      after: 'imgs=27 broken=0 sheets=4/1 fonts=0 hidden=0 overflow=0',
    });
  });
});
