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
  it('returns true when refuel starts within 20 minutes of takeoff using missionTime', () => {
    const state = { lastTakeoffAtMs: 180000 };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0.04, startedAtMissionTime: 1200, system: 'basket' }, state);
    expect(result).toBe(true);
  });

  it('returns true for boom system within 20 minutes', () => {
    const state = { lastTakeoffAtMs: 180000 };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0.04, startedAtMissionTime: 1200, system: 'boom' }, state);
    expect(result).toBe(true);
  });

  it('returns false when refuel starts after 20 minutes using missionTime', () => {
    const state = { lastTakeoffAtMs: 120000 };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0.04, startedAtMissionTime: 1321, system: 'basket' }, state);
    expect(result).toBe(false);
  });

  it('returns false for completed refuel events', () => {
    const state = { lastTakeoffAtMs: 180000 };
    const result = topUp.evaluate({ refuelStatus: 'completed', fuelGain: 0.04, missionTime: 1200, system: 'basket' }, state);
    expect(result).toBe(false);
  });

  it('returns false when fuel gain is not positive', () => {
    const state = { lastTakeoffAtMs: Date.parse('2026-03-07T10:00:00.000Z') };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0, startedAtMissionTime: 300, system: 'basket' }, state);
    expect(result).toBe(false);
  });

  it('returns false when system is missing', () => {
    const state = { lastTakeoffAtMs: 180000 };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0.04, startedAtMissionTime: 1200 }, state);
    expect(result).toBe(false);
  });

  it('returns false when system is not a recognized AAR type', () => {
    const state = { lastTakeoffAtMs: 180000 };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0.04, startedAtMissionTime: 1200, system: 'unknown' }, state);
    expect(result).toBe(false);
  });

  it('returns false when missionTime is missing, even if occurredAt is present', () => {
    const state = { lastTakeoffAtMs: Date.parse('2026-03-07T10:00:00.000Z') };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0.02, occurredAt: '2026-03-07T10:05:00.000Z', system: 'basket' }, state);
    expect(result).toBe(false);
  });

  it('returns false when missionTime is missing, even if time is present', () => {
    const state = { lastTakeoffAtMs: Date.parse('2026-03-07T10:00:00.000Z') };
    const result = topUp.evaluate({ refuelStatus: 'started', fuelGain: 0.02, time: 300, system: 'basket' }, state);
    expect(result).toBe(false);
  });
});
