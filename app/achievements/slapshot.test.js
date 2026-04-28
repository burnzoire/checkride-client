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

  it('returns true when ARM reports RADAR_SEMI_ACTIVE (DCS AGM-88 quirk) and is not an AAM', () => {
    const state = stateWithSamLaunch(102000);
    expect(slapshot.evaluate(shotEvent({
      weaponGuidance: 'RADAR_SEMI_ACTIVE',
      weaponClass: 'air_to_ground_missile',
    }), state)).toBe(true);
  });

  it('returns false when RADAR_SEMI_ACTIVE weapon is an AAM (AIM-7 / R-27R)', () => {
    const state = stateWithSamLaunch(102000);
    expect(slapshot.evaluate(shotEvent({
      weaponGuidance: 'RADAR_SEMI_ACTIVE',
      weaponClass: 'air_to_air_missile',
    }), state)).toBe(false);
  });

  it('returns false when weapon is not an ARM (not RADAR_PASSIVE or RADAR_SEMI_ACTIVE)', () => {
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

// ─── per-weapon ARM / non-ARM recognition ────────────────────────────────────
// Documents the DCS guidance type each weapon actually reports so regressions
// are caught if the Lua GUIDANCE_NAMES table or the check logic ever changes.

describe('Slapshot — ARM recognition (positive)', () => {
  it('AGM-88C HARM — DCS misreports as RADAR_SEMI_ACTIVE, not RADAR_PASSIVE', () => {
    expect(slapshot.evaluate(shotEvent({
      weaponName: 'AGM_88', weaponDisplayName: 'AGM-88C',
      weaponGuidance: 'RADAR_SEMI_ACTIVE', weaponClass: 'air_to_ground_missile',
    }), stateWithSamLaunch())).toBe(true);
  });

  it('AGM-45 Shrike — RADAR_PASSIVE', () => {
    expect(slapshot.evaluate(shotEvent({
      weaponName: 'AGM_45', weaponDisplayName: 'AGM-45A',
      weaponGuidance: 'RADAR_PASSIVE', weaponClass: 'air_to_ground_missile',
    }), stateWithSamLaunch())).toBe(true);
  });

  it('AGM-122 Sidearm — RADAR_PASSIVE', () => {
    expect(slapshot.evaluate(shotEvent({
      weaponName: 'AGM_122', weaponDisplayName: 'AGM-122 Sidearm',
      weaponGuidance: 'RADAR_PASSIVE', weaponClass: 'air_to_ground_missile',
    }), stateWithSamLaunch())).toBe(true);
  });

  it('ALARM — RADAR_PASSIVE', () => {
    expect(slapshot.evaluate(shotEvent({
      weaponName: 'ALARM', weaponDisplayName: 'ALARM',
      weaponGuidance: 'RADAR_PASSIVE', weaponClass: 'air_to_ground_missile',
    }), stateWithSamLaunch())).toBe(true);
  });
});

describe('Slapshot — non-ARM missile recognition (negative)', () => {
  it('AIM-7 Sparrow — RADAR_SEMI_ACTIVE but air-to-air (same guidance as HARM, different class)', () => {
    expect(slapshot.evaluate(shotEvent({
      weaponName: 'AIM_7MH', weaponDisplayName: 'AIM-7MH',
      weaponGuidance: 'RADAR_SEMI_ACTIVE', weaponClass: 'air_to_air_missile',
    }), stateWithSamLaunch())).toBe(false);
  });

  it('R-27R — RADAR_SEMI_ACTIVE air-to-air', () => {
    expect(slapshot.evaluate(shotEvent({
      weaponName: 'R_27R', weaponDisplayName: 'R-27R',
      weaponGuidance: 'RADAR_SEMI_ACTIVE', weaponClass: 'air_to_air_missile',
    }), stateWithSamLaunch())).toBe(false);
  });

  it('AIM-9M Sidewinder — IR air-to-air', () => {
    expect(slapshot.evaluate(shotEvent({
      weaponName: 'AIM_9M', weaponDisplayName: 'AIM-9M',
      weaponGuidance: 'IR', weaponClass: 'air_to_air_missile',
    }), stateWithSamLaunch())).toBe(false);
  });

  it('AIM-120C AMRAAM — active radar air-to-air', () => {
    expect(slapshot.evaluate(shotEvent({
      weaponName: 'AIM_120C', weaponDisplayName: 'AIM-120C',
      weaponGuidance: 'RADAR_ACTIVE', weaponClass: 'air_to_air_missile',
    }), stateWithSamLaunch())).toBe(false);
  });

  it('AGM-65D Maverick — TV guided air-to-ground', () => {
    expect(slapshot.evaluate(shotEvent({
      weaponName: 'AGM_65D', weaponDisplayName: 'AGM-65D',
      weaponGuidance: 'TV', weaponClass: 'air_to_ground_missile',
    }), stateWithSamLaunch())).toBe(false);
  });
});
