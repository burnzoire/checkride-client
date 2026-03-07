const topUp = require('./topUp');

describe('TopUp — metadata', () => {
  it('has id quick_tank', () => {
    expect(topUp.id).toBe('quick_tank');
  });

  it('has triggerType refuel_enrichment', () => {
    expect(topUp.triggerType).toBe('refuel_enrichment');
  });
});

describe('TopUp — evaluate', () => {
  it('returns true when contact starts within 10 minutes of takeoff', () => {
    const state = { lastTakeoffAtMs: Date.parse('2026-03-07T10:00:00.000Z') };
    const result = topUp.evaluate({ contactEvent: 'contact_start', occurredAt: '2026-03-07T10:09:59.000Z' }, state);
    expect(result).toBe(true);
  });

  it('returns false when contact starts after 10 minutes', () => {
    const state = { lastTakeoffAtMs: Date.parse('2026-03-07T10:00:00.000Z') };
    const result = topUp.evaluate({ contactEvent: 'contact_start', occurredAt: '2026-03-07T10:10:01.000Z' }, state);
    expect(result).toBe(false);
  });

  it('returns false for contact_end events', () => {
    const state = { lastTakeoffAtMs: Date.parse('2026-03-07T10:00:00.000Z') };
    const result = topUp.evaluate({ contactEvent: 'contact_end', occurredAt: '2026-03-07T10:05:00.000Z' }, state);
    expect(result).toBe(false);
  });
});
