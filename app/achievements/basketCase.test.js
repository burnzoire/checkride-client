const basketCase = require('./basketCase');

describe('BasketCase — metadata', () => {
  it('has id first_basket_contact', () => {
    expect(basketCase.id).toBe('first_basket_contact');
  });

  it('has triggerType refuel_enrichment', () => {
    expect(basketCase.triggerType).toBe('refuel_enrichment');
  });
});

describe('BasketCase — evaluate', () => {
  it('returns true on basket contact_start', () => {
    const result = basketCase.evaluate({ type: 'refuel_enrichment', contactEvent: 'contact_start', system: 'basket' }, {});
    expect(result).toBe(true);
  });

  it('returns false on basket contact_end', () => {
    const result = basketCase.evaluate({ type: 'refuel_enrichment', contactEvent: 'contact_end', system: 'basket' }, {});
    expect(result).toBe(false);
  });

  it('returns false for boom contact_start', () => {
    const result = basketCase.evaluate({ type: 'refuel_enrichment', contactEvent: 'contact_start', system: 'boom' }, {});
    expect(result).toBe(false);
  });
});
