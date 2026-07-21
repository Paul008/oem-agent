import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
}

describe('public offer lifecycle visibility', () => {
  it('requires active offers in the public OEM and dealer APIs', () => {
    const oemRoutes = source('./oem-agent.ts');
    const publicOfferRoute = oemRoutes.slice(
      oemRoutes.indexOf("app.get('/oems/:oemId/offers'"),
      oemRoutes.indexOf("app.get('/admin/offers/:oemId'"),
    );
    expect(publicOfferRoute).toContain(".eq('lifecycle_status', 'active')");

    const dealerRoutes = source('./dealer-api.ts');
    expect(dealerRoutes.match(/\.eq\('offers\.lifecycle_status', 'active'\)/g)).toHaveLength(2);
  });

  it('requires active offers in MCP catalog and OEM tools', () => {
    const catalogTools = source('../mcp/tools/catalog-tools.ts');
    const oemTools = source('../mcp/tools/oem-tools.ts');
    expect(catalogTools).toContain(".eq('offers.lifecycle_status', 'active')");
    expect(oemTools).toContain(".eq('lifecycle_status', 'active')");
  });

  it('keeps staged offers out of sales-assistant and page-builder content', () => {
    const salesRep = source('../ai/sales-rep.ts');
    const pageGenerator = source('../design/page-generator.ts');
    expect(salesRep.match(/\.eq\('lifecycle_status', 'active'\)/g)).toHaveLength(3);
    expect(pageGenerator.match(/\.eq\('lifecycle_status', 'active'\)/g)).toHaveLength(2);
  });
});
