const airWolf = require('./airWolf');
const PilotState = require('../services/pilotState');

const KILL_EVENT = { type: 'kill_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick' };

function heloGroundKill(overrides = {}) {
  return {
    victimUnitCategory: 'ground',
    killerUnitCategory: 'HELICOPTER',
    pilotSpeedKts: 80,
    ...overrides,
  };
}

function stateWith(kills) {
  const state = new PilotState();
  state.kills = kills;
  return state;
}

describe('AirWolf — metadata', () => {
  it('has id air_wolf', () => {
    expect(airWolf.id).toBe('air_wolf');
  });

  it('has triggerType kill_enrichment', () => {
    expect(airWolf.triggerType).toBe('kill_enrichment');
  });
});

describe('AirWolf — evaluate', () => {
  it('returns true with 3 helicopter ground kills above 50kts', () => {
    expect(airWolf.evaluate(KILL_EVENT, stateWith([
      heloGroundKill(), heloGroundKill(), heloGroundKill(),
    ]))).toBe(true);
  });

  it('returns true with more than 3 qualifying kills', () => {
    expect(airWolf.evaluate(KILL_EVENT, stateWith([
      heloGroundKill(), heloGroundKill(), heloGroundKill(), heloGroundKill(),
    ]))).toBe(true);
  });

  it('returns false with only 2 qualifying kills', () => {
    expect(airWolf.evaluate(KILL_EVENT, stateWith([
      heloGroundKill(), heloGroundKill(),
    ]))).toBe(false);
  });

  it('returns false with no kills', () => {
    expect(airWolf.evaluate(KILL_EVENT, stateWith([]))).toBe(false);
  });

  it('returns false when speed is at or below 50kts', () => {
    expect(airWolf.evaluate(KILL_EVENT, stateWith([
      heloGroundKill({ pilotSpeedKts: 50 }),
      heloGroundKill({ pilotSpeedKts: 50 }),
      heloGroundKill({ pilotSpeedKts: 50 }),
    ]))).toBe(false);
  });

  it('returns false for fixed-wing ground kills', () => {
    expect(airWolf.evaluate(KILL_EVENT, stateWith([
      heloGroundKill({ killerUnitCategory: 'AIRPLANE' }),
      heloGroundKill({ killerUnitCategory: 'AIRPLANE' }),
      heloGroundKill({ killerUnitCategory: 'AIRPLANE' }),
    ]))).toBe(false);
  });

  it('returns false for helicopter air kills', () => {
    expect(airWolf.evaluate(KILL_EVENT, stateWith([
      heloGroundKill({ victimUnitCategory: 'air' }),
      heloGroundKill({ victimUnitCategory: 'air' }),
      heloGroundKill({ victimUnitCategory: 'air' }),
    ]))).toBe(false);
  });

  it('does not count kills with null speed', () => {
    expect(airWolf.evaluate(KILL_EVENT, stateWith([
      heloGroundKill({ pilotSpeedKts: null }),
      heloGroundKill({ pilotSpeedKts: null }),
      heloGroundKill({ pilotSpeedKts: null }),
    ]))).toBe(false);
  });

  it('counts only kills above threshold when mixed with slow kills', () => {
    expect(airWolf.evaluate(KILL_EVENT, stateWith([
      heloGroundKill({ pilotSpeedKts: 30 }),
      heloGroundKill(),
      heloGroundKill(),
      heloGroundKill(),
    ]))).toBe(true);
  });
});

describe('AirWolf — via applyKill', () => {
  it('captures pilotSpeedKts from currentSpeedKts at kill time', () => {
    const state = new PilotState();
    state.applyFlightSampleEnrichment({ speedKts: 80, inAir: true });
    for (let i = 0; i < 3; i++) {
      state.applyKill({ victimUnitCategory: 'ground', killerUnitCategory: 'HELICOPTER', victimRoles: [] });
    }
    expect(airWolf.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('does not count kills when no flight sample has arrived before the kill', () => {
    const state = new PilotState();
    for (let i = 0; i < 3; i++) {
      state.applyKill({ victimUnitCategory: 'ground', killerUnitCategory: 'HELICOPTER', victimRoles: [] });
    }
    expect(airWolf.evaluate(KILL_EVENT, state)).toBe(false);
  });
});
