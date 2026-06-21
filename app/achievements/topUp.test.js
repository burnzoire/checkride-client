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
  it('returns true when refuel starts within 15 minutes of takeoff using missionTime', () => {
    const state = { lastTakeoffAtMs: 180000 };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0.12, startedAtMissionTime: 900 }, state);
    expect(result).toBe(true);
  });

  it('returns false when refuel starts after 15 minutes using missionTime', () => {
    const state = { lastTakeoffAtMs: 120000 };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0.12, startedAtMissionTime: 1021 }, state);
    expect(result).toBe(false);
  });

  it('returns false for completed refuel events', () => {
    const state = { lastTakeoffAtMs: 180000 };
    const result = topUp.evaluate({ refuelStatus: 'completed', fuelGain: 0.12, missionTime: 1200 }, state);
    expect(result).toBe(false);
  });

  it('returns false when fuel gain is not positive', () => {
    const state = { lastTakeoffAtMs: Date.parse('2026-03-07T10:00:00.000Z') };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0, startedAtMissionTime: 300 }, state);
    expect(result).toBe(false);
  });

  it('returns false when fuel gain is below 10%', () => {
    const state = { lastTakeoffAtMs: 180000 };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0.04, startedAtMissionTime: 900 }, state);
    expect(result).toBe(false);
  });

  it('returns true at exactly 10% fuel gain', () => {
    const state = { lastTakeoffAtMs: 180000 };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0.10, startedAtMissionTime: 900 }, state);
    expect(result).toBe(true);
  });

  it('returns false when missionTime is missing, even if occurredAt is present', () => {
    const state = { lastTakeoffAtMs: Date.parse('2026-03-07T10:00:00.000Z') };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0.12, occurredAt: '2026-03-07T10:05:00.000Z' }, state);
    expect(result).toBe(false);
  });

  it('returns false when missionTime is missing, even if time is present', () => {
    const state = { lastTakeoffAtMs: Date.parse('2026-03-07T10:00:00.000Z') };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0.12, time: 300 }, state);
    expect(result).toBe(false);
  });
});
