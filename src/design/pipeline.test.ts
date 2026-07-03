import { describe, expect, it } from 'vitest';
import { getCloneDecision } from './pipeline';

describe('getCloneDecision', () => {
  it('refreshes an existing clone when the requested source URL changed', () => {
    const decision = getCloneDecision(
      { source_url: 'https://www.ford.com.au/showroom/suvs/everest/' },
      'https://www.ford.com.au/showroom/cars/mustang/',
    );

    expect(decision.shouldClone).toBe(true);
    expect(decision.reason).toBe('source URL changed');
  });

  it('refreshes an existing clone when forced even if the source URL is unchanged', () => {
    const decision = getCloneDecision(
      { source_url: 'https://www.volkswagen.com.au/en/models/amarok.html' },
      'https://www.volkswagen.com.au/en/models/amarok.html',
      { force: true },
    );

    expect(decision.shouldClone).toBe(true);
    expect(decision.reason).toBe('clone refresh requested');
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
