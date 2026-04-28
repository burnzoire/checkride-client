const gunship = require('./gunship');
const PilotState = require('../services/pilotState');

function heloGroundKill() {
  return { killerUnitCategory: 'HELICOPTER', victimUnitCategory: 'ground' };
}

function heloAirKill() {
  return { killerUnitCategory: 'HELICOPTER', victimUnitCategory: 'air' };
}

function planeGroundKill() {
  return { killerUnitCategory: 'AIRPLANE', victimUnitCategory: 'ground' };
}

function killEvent(overrides = {}) {
  return { type: 'kill_enrichment', playerUcid: 'pilot-1', ...overrides };
}

function stateWithKills(kills) {
  const state = new PilotState();
  state.kills = kills;
  return state;
}

describe('Gunship — metadata', () => {
  it('has id gunship', () => {
    expect(gunship.id).toBe('gunship');
  });

  it('has triggerType kill_enrichment', () => {
    expect(gunship.triggerType).toBe('kill_enrichment');
  });
});

describe('Gunship — evaluate', () => {
  it('returns true with 15 helo ground kills', () => {
    const state = stateWithKills(Array(15).fill(null).map(heloGroundKill));
    expect(gunship.evaluate(killEvent(), state)).toBe(true);
  });

  it('returns true with more than 15 helo ground kills', () => {
    const state = stateWithKills(Array(20).fill(null).map(heloGroundKill));
    expect(gunship.evaluate(killEvent(), state)).toBe(true);
  });

  it('returns false with 14 helo ground kills', () => {
    const state = stateWithKills(Array(14).fill(null).map(heloGroundKill));
    expect(gunship.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false with 15 airplane ground kills', () => {
    const state = stateWithKills(Array(15).fill(null).map(planeGroundKill));
    expect(gunship.evaluate(killEvent(), state)).toBe(false);
  });

  it('does not count helo air kills toward the total', () => {
    const kills = [
      ...Array(14).fill(null).map(heloGroundKill),
      heloAirKill(),
    ];
    const state = stateWithKills(kills);
    expect(gunship.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false with empty kills', () => {
    const state = stateWithKills([]);
    expect(gunship.evaluate(killEvent(), state)).toBe(false);
  });
});
