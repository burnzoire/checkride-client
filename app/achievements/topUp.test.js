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
  it('returns true when contact starts within 20 minutes of takeoff using missionTime', () => {
    const state = { lastTakeoffAtMs: 180000 };
    const result = topUp.evaluate({ contactEvent: 'contact_start', missionTime: 1200 }, state);
    expect(result).toBe(true);
  });

  it('returns false when contact starts after 20 minutes using missionTime', () => {
    const state = { lastTakeoffAtMs: 120000 };
    const result = topUp.evaluate({ contactEvent: 'contact_start', missionTime: 1321 }, state);
    expect(result).toBe(false);
  });

  it('returns false for contact_end events', () => {
    const state = { lastTakeoffAtMs: Date.parse('2026-03-07T10:00:00.000Z') };
    const result = topUp.evaluate({ contactEvent: 'contact_end', occurredAt: '2026-03-07T10:05:00.000Z' }, state);
    expect(result).toBe(false);
  });

  it('returns false when missionTime is missing, even if occurredAt is present', () => {
    const state = { lastTakeoffAtMs: Date.parse('2026-03-07T10:00:00.000Z') };
    const result = topUp.evaluate({ contactEvent: 'contact_start', occurredAt: '2026-03-07T10:05:00.000Z' }, state);
    expect(result).toBe(false);
  });

  it('returns false when missionTime is missing, even if time is present', () => {
    const state = { lastTakeoffAtMs: Date.parse('2026-03-07T10:00:00.000Z') };
    const result = topUp.evaluate({ contactEvent: 'contact_start', time: 300 }, state);
    expect(result).toBe(false);
  });
});
