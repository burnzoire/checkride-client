const slapshot = require('./slapshot');
const PilotState = require('../services/pilotState');

function shotEvent(overrides = {}) {
  return {
    type: 'shot_enrichment',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    weaponGuidance: 'RADAR_PASSIVE',
    missionTime: 105,
    ...overrides,
  };
}

function stateWithSamLaunch(launchedAtMs = 102000) {
  const state = new PilotState();
  state.inboundMissiles.push({
    weaponKey: 'sam-1',
    inFlight: true,
    status: 'in_flight',
    initiatorRole: 'SAM',
    launchedAtMs,
    completedAtMs: null,
  });
  return state;
}

describe('Slapshot — metadata', () => {
  it('has id slapshot', () => {
    expect(slapshot.id).toBe('slapshot');
  });

  it('has triggerType shot_enrichment', () => {
    expect(slapshot.triggerType).toBe('shot_enrichment');
  });
});

describe('Slapshot — evaluate', () => {
  it('returns true when ARM fired within 5s of a SAM launch', () => {
    // SAM launched at 102s, ARM fired at 105s — delta 3s
    const state = stateWithSamLaunch(102000);
    expect(slapshot.evaluate(shotEvent({ missionTime: 105 }), state)).toBe(true);
  });

  it('returns true at exactly 5s after SAM launch', () => {
    const state = stateWithSamLaunch(100000);
    expect(slapshot.evaluate(shotEvent({ missionTime: 105 }), state)).toBe(true);
  });

  it('returns false when ARM fired more than 5s after SAM launch', () => {
    const state = stateWithSamLaunch(99000);
    expect(slapshot.evaluate(shotEvent({ missionTime: 105 }), state)).toBe(false);
  });

  it('returns false when weapon is not an ARM (not RADAR_PASSIVE)', () => {
    const state = stateWithSamLaunch(102000);
    expect(slapshot.evaluate(shotEvent({ weaponGuidance: 'IR' }), state)).toBe(false);
  });

  it('returns false when weapon guidance is missing', () => {
    const state = stateWithSamLaunch(102000);
    expect(slapshot.evaluate(shotEvent({ weaponGuidance: undefined }), state)).toBe(false);
  });

  it('returns false when there is no inbound SAM in the window', () => {
    const state = new PilotState();
    expect(slapshot.evaluate(shotEvent(), state)).toBe(false);
  });

  it('returns false when inbound missile is from a FIGHTER, not a SAM', () => {
    const state = new PilotState();
    state.inboundMissiles.push({
      weaponKey: 'f-1',
      inFlight: true,
      status: 'in_flight',
      initiatorRole: 'FIGHTER',
      launchedAtMs: 102000,
      completedAtMs: null,
    });
    expect(slapshot.evaluate(shotEvent(), state)).toBe(false);
  });

  it('returns false when missionTime is missing', () => {
    const state = stateWithSamLaunch(102000);
    expect(slapshot.evaluate(shotEvent({ missionTime: undefined }), state)).toBe(false);
  });
});
