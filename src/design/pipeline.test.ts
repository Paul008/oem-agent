import { describe, expect, it } from 'vitest';
import { getCloneDecision } from './pipeline';

describe('getCloneDecision', () => {
  it('refreshes an existing clone when the requested source URL changed', () => {
    const decision = getCloneDecision(
      { source_url: 'https://ford-adme.adus.com.au/api/variants/all/v1/content/all' },
      'https://www.ford.com.au/showroom/cars/mustang/',
    );

    expect(decision.shouldClone).toBe(true);
    expect(decision.reason).toBe('source URL changed');
  });

  it('reuses an existing clone when the source URL only differs by a trailing slash', () => {
    const decision = getCloneDecision(
      { source_url: 'https://www.ford.com.au/showroom/cars/mustang/' },
      'https://www.ford.com.au/showroom/cars/mustang',
    );

    expect(decision.shouldClone).toBe(false);
    expect(decision.reason).toBe('clone already exists in R2');
  });
});
