const fleetDefender = require('./fleetDefender');
const PilotState = require('../services/pilotState');

// ─── helpers ────────────────────────────────────────────────────────────────

function killEvent(overrides = {}) {
  return {
    type: 'kill_enrichment',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    victimUnitCategory: 'air',
    isEnemy: true,
    carrierDistanceNm: 30,
    ...overrides,
  };
}

function stateWith({ launchedFromCarrier = true, kills = [] } = {}) {
  const state = new PilotState();
  state.launchedFromCarrier = launchedFromCarrier;
  state.kills = kills;
  return state;
}

// ─── metadata ────────────────────────────────────────────────────────────────

describe('FleetDefender — metadata', () => {
  it('has id fleet_defender', () => {
    expect(fleetDefender.id).toBe('fleet_defender');
  });

  it('has triggerType kill_enrichment', () => {
    expect(fleetDefender.triggerType).toBe('kill_enrichment');
  });
});

// ─── evaluate logic ──────────────────────────────────────────────────────────

describe('FleetDefender — evaluate', () => {
  it('returns true when launched from carrier with an air kill within 50nm', () => {
    const state = stateWith({
      launchedFromCarrier: true,
      kills: [{ victimUnitCategory: 'air', carrierDistanceNm: 30 }],
    });
    expect(fleetDefender.evaluate(killEvent(), state)).toBe(true);
  });

  it('returns true at exactly 50nm', () => {
    const state = stateWith({
      launchedFromCarrier: true,
      kills: [{ victimUnitCategory: 'air', carrierDistanceNm: 50 }],
    });
    expect(fleetDefender.evaluate(killEvent(), state)).toBe(true);
  });

  it('returns false when kill is beyond 50nm', () => {
    const state = stateWith({
      launchedFromCarrier: true,
      kills: [{ victimUnitCategory: 'air', carrierDistanceNm: 50.1 }],
    });
    expect(fleetDefender.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false when pilot did not launch from a carrier', () => {
    const state = stateWith({
      launchedFromCarrier: false,
      kills: [{ victimUnitCategory: 'air', carrierDistanceNm: 10 }],
    });
    expect(fleetDefender.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false for a ground kill even within 50nm', () => {
    const state = stateWith({
      launchedFromCarrier: true,
      kills: [{ victimUnitCategory: 'ground', carrierDistanceNm: 5 }],
    });
    expect(fleetDefender.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false for a ship kill even within 50nm', () => {
    const state = stateWith({
      launchedFromCarrier: true,
      kills: [{ victimUnitCategory: 'ship', carrierDistanceNm: 5 }],
    });
    expect(fleetDefender.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false when carrierDistanceNm is null (no carrier reference)', () => {
    const state = stateWith({
      launchedFromCarrier: true,
      kills: [{ victimUnitCategory: 'air', carrierDistanceNm: null }],
    });
    expect(fleetDefender.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false when the kills array is empty', () => {
    const state = stateWith({ launchedFromCarrier: true, kills: [] });
    expect(fleetDefender.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns true if any kill in the sortie qualifies (multi-kill scenario)', () => {
    const state = stateWith({
      launchedFromCarrier: true,
      kills: [
        { victimUnitCategory: 'air', carrierDistanceNm: 80 }, // too far
        { victimUnitCategory: 'air', carrierDistanceNm: 25 }, // qualifies
      ],
    });
    expect(fleetDefender.evaluate(killEvent(), state)).toBe(true);
  });
});
