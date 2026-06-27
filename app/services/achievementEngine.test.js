jest.mock('electron-log', () => ({ info: jest.fn(), error: jest.fn() }));

const AchievementEngine = require('./achievementEngine');
const Achievement = require('../achievements/achievement');
const PilotState = require('./pilotState');

// ─── helpers ────────────────────────────────────────────────────────────────

function grading(overrides = {}) {
  return {
    type: 'grading',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    lsoGrade: 'OK',
    wire: 3,
    night: false,
    fuelState: null,
    ...overrides,
  };
}

function bolterEvent(overrides = {}) {
  return grading({ lsoGrade: 'B', wire: null, ...overrides });
}

function waveOffEvent(overrides = {}) {
  return grading({ lsoGrade: 'WO', wire: null, ...overrides });
}

function refuel(overrides = {}) {
  return {
    type: 'refuel_enrichment',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    refuelStatus: 'started',
    fuelGain: 0.04,
    system: 'basket',
    occurredAt: '2026-03-07T10:00:00.000Z',
    ...overrides,
  };
}

function changeSlot(overrides = {}) {
  return {
    type: 'change_slot',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    ...overrides,
  };
}

// Minimal stub achievement for testing engine mechanics
class StubAchievement extends Achievement {
  constructor(id, evaluateFn) {
    super({ id, name: id, description: id });
    this._evaluateFn = evaluateFn;
  }
  evaluate(event, state) {
    return this._evaluateFn(event, state);
  }
}

// ─── serializeState completeness ─────────────────────────────────────────────
// Mapping from every PilotState own-property name to its dot-path in the
// serializeState output. null = intentionally excluded (add a reason).
//
// HOW THIS WORKS: the first test checks that every own property of a fresh
// PilotState instance has an entry here — it fails immediately when a new
// field is added to PilotState without updating this map. The second test
// checks that every non-null path actually exists in the serialized output —
// it fails when the map is updated but serializeState is not.

const PILOTSTATE_TO_SNAPSHOT = {
  // ── Session state (constructor) ──────────────────────────────────────────
  passes:               'state.passes',
  currentSlotId:        null, // internal slot tracking, not needed by snapshot consumers
  inAir:                'telemetry.inAir',
  aircraftStatus:       'telemetry.aircraftStatus',
  // ── Sortie state (_resetSortieState) ─────────────────────────────────────
  kills:                'state.kills',
  lastTakeoffAtMs:      'state.lastTakeoffAtMs',
  takeoffLocation:      'state.takeoffLocation',
  launchedFromCarrier:  'state.launchedFromCarrier',
  lastRefuelDetectedAtMs:           'state.lastRefuelDetectedAtMs',
  lastRefuelFuelGain:               'state.lastRefuelFuelGain',
  lastRefuelContactDurationSeconds: 'state.lastRefuelContactDurationSeconds',
  longestRefuelContactSeconds:      'state.longestRefuelContactSeconds',
  currentSpeedKts:      'telemetry.speedKts',
  currentSpeedMach:     'telemetry.speedMach',
  highestSpeedKts:      'state.highestSpeedKts',
  highestSpeedMach:     'state.highestSpeedMach',
  currentAltitudeFt:    'telemetry.altBaroFt',
  highestAltitudeFt:    'state.highestAltitudeFt',
  currentRadarAltitudeFt: 'telemetry.altRadarFt',
  currentPositionX:     'telemetry.positionX',
  currentPositionY:     'telemetry.positionY',
  currentFuelState:     'telemetry.currentFuelState',
  currentPayload:       'telemetry.payload',
  weapons:              'state.weapons',
  missiles:             'state.missiles',
  sortieAamFiredCount:  'state.sortieAamFiredCount',
  longestWeaponHit:     'state.longestWeaponHit',
  longestMissileHit:    'state.longestMissileHit',
  ordnanceLog:          'state.ordnanceLog',
  inboundMissiles:      'state.inboundMissiles',
  currentUnitCategory:  'state.currentUnitCategory',
  hitCounters:          'state.hitCounters',
  gunBurstStartAtMs:    null, // transient: null between bursts, meaningless in a snapshot
  longestGunBurstSeconds: 'state.longestGunBurstSeconds',
  sortieDistanceKm:     'state.sortieDistanceKm',
  noeDistanceKm:        'state.noeDistanceKm',
  noeConsecutiveDistanceKm: 'state.noeConsecutiveDistanceKm',
  longestNoeConsecutiveDistanceKm: null, // rolled up into gauges.longest_noe_distance_nm
  lastLandingFuelState:     null, // landing_enrichment-only, not included in snapshot
  lastLandingFriendlyBase:  null, // landing_enrichment-only, not included in snapshot
};

function hasPath(obj, path) {
  const keys = path.split('.');
  let cur = obj;
  for (const k of keys) {
    if (cur == null || !Object.prototype.hasOwnProperty.call(cur, k)) return false;
    cur = cur[k];
  }
  return true;
}

describe('AchievementEngine — serializeState covers all PilotState fields', () => {
  it('every PilotState own-property is covered in PILOTSTATE_TO_SNAPSHOT (update the map when PilotState grows)', () => {
    const allProps = Object.keys(new PilotState());
    for (const prop of allProps) {
      expect(Object.keys(PILOTSTATE_TO_SNAPSHOT)).toContain(prop);
    }
  });

  it('every non-null mapped path resolves in serializeState output (update serializeState when the map changes)', () => {
    const engine = new AchievementEngine([]);
    const serialized = engine.serializeState(new PilotState());
    for (const [, path] of Object.entries(PILOTSTATE_TO_SNAPSHOT)) {
      if (path === null) continue;
      expect(hasPath(serialized, path)).toBe(true);
    }
  });
});

// ─── engine mechanics ────────────────────────────────────────────────────────

describe('AchievementEngine — core mechanics', () => {
  it('returns empty array for unknown event types', () => {
    const engine = new AchievementEngine([]);
    expect(engine.evaluate({ type: 'kill', playerUcid: 'p1' })).toEqual([]);
    expect(engine.evaluate({ type: 'totally_unknown', playerUcid: 'p1' })).toEqual([]);
  });

  it('tracks inAir true/false from core lifecycle events', () => {
    const engine = new AchievementEngine([]);

    engine.evaluate({ type: 'takeoff', playerUcid: 'pilot-1', playerName: 'Maverick', occurredAt: '2026-03-07T10:00:00.000Z' });
    let snapshot = engine.buildSnapshot({
      pilotUcid: 'pilot-1',
      triggerEvent: { type: 'takeoff', playerUcid: 'pilot-1' },
      unlockedAchievements: [],
    });
    expect(snapshot.state.telemetry.inAir).toBe(true);

    engine.evaluate({ type: 'landing', playerUcid: 'pilot-1', playerName: 'Maverick' });
    snapshot = engine.buildSnapshot({
      pilotUcid: 'pilot-1',
      triggerEvent: { type: 'landing', playerUcid: 'pilot-1' },
      unlockedAchievements: [],
    });
    expect(snapshot.state.telemetry.inAir).toBe(false);
  });

  it('creates pilot state for change_slot so a snapshot can be published', () => {
    const engine = new AchievementEngine([]);

    const unlocked = engine.evaluate(changeSlot());
    expect(unlocked).toEqual([]);

    const snapshot = engine.buildSnapshot({
      pilotUcid: 'pilot-1',
      triggerEvent: changeSlot(),
      unlockedAchievements: [],
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot.state).toHaveProperty('telemetry');
    expect(snapshot.state).toHaveProperty('state');
    expect(snapshot.trigger_event_type).toBe('change_slot');
  });

  it('processes takeoff_enrichment without triggering grading achievements', () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    const result = engine.evaluate({
      type: 'takeoff_enrichment',
      playerUcid: 'p1',
      launchedFromCarrier: true,
      carrierName: 'CVN-71',
    });
    expect(result).toHaveLength(0); // no achievement registered for takeoff_enrichment
  });

  it('processes kill_enrichment without triggering grading achievements', () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    const result = engine.evaluate({
      type: 'kill_enrichment',
      playerUcid: 'p1',
      victimUnitCategory: 'air',
      carrierDistanceNm: 10,
    });
    expect(result).toHaveLength(0); // grading achievement not triggered by kill_enrichment
  });

  it('passes kill_enrichment event to achievements registered with triggerType kill_enrichment', () => {
    const killAchievement = new StubAchievement('kill_achv', () => true);
    killAchievement.triggerType = 'kill_enrichment';
    const engine = new AchievementEngine([killAchievement]);
    const result = engine.evaluate({
      type: 'kill_enrichment',
      playerUcid: 'p1',
      victimUnitCategory: 'air',
      carrierDistanceNm: 10,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('kill_achv');
  });

  it('serializes per-sortie kill gauges from current sortie state', () => {
    const engine = new AchievementEngine([]);

    engine.evaluate({
      type: 'takeoff_enrichment',
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
      launchedFromCarrier: true,
      occurredAt: '2026-03-07T10:00:00.000Z',
    });

    engine.evaluate({
      type: 'kill_enrichment',
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
      victimUnitCategory: 'air',
      carrierDistanceNm: 12,
    });
    engine.evaluate({
      type: 'kill_enrichment',
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
      victimUnitCategory: 'ground',
      carrierDistanceNm: null,
    });
    engine.evaluate({
      type: 'kill_enrichment',
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
      victimUnitCategory: 'ground',
      carrierDistanceNm: null,
    });

    const snapshot = engine.buildSnapshot({
      pilotUcid: 'pilot-1',
      triggerEvent: { type: 'kill_enrichment', playerUcid: 'pilot-1' },
      unlockedAchievements: [],
    });

    expect(snapshot.state.gauges.most_air_kills_in_sortie).toBe(1);
    expect(snapshot.state.gauges.most_ground_kills_in_sortie).toBe(2);
  });

  it('passes refuel_enrichment event to achievements registered with triggerType refuel_enrichment', () => {
    const refuelAchievement = new StubAchievement('refuel_achv', () => true);
    refuelAchievement.triggerType = 'refuel_enrichment';
    const engine = new AchievementEngine([refuelAchievement]);

    const result = engine.evaluate(refuel());

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('refuel_achv');
  });

  it('tracks missile shot/hit state and serializes longestMissileHit', () => {
    const engine = new AchievementEngine([]);

    engine.evaluate({
      type: 'shot_enrichment',
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
      weaponKey: 'w1',
      weaponName: 'AIM-120C',
      targetObjectId: 999,
      startX: 0,
      startY: 0,
      startAlt: 1000,
    });

    engine.evaluate({
      type: 'hit_enrichment',
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
      weaponKey: 'w1',
      targetObjectId: 999,
      distanceNm: 18.2,
      heightDeltaFt: -600,
    });

    const snapshot = engine.buildSnapshot({
      pilotUcid: 'pilot-1',
      triggerEvent: { type: 'hit_enrichment', playerUcid: 'pilot-1' },
      unlockedAchievements: [],
    });

    expect(snapshot.state.gauges.longest_missile_hit_nm).toBeCloseTo(18.2);
    expect(snapshot.state.state.weapons).toHaveLength(1);
    expect(snapshot.state.state.missiles).toHaveLength(1);
    expect(snapshot.state.state.missiles[0].inFlight).toBe(false);
  });

  it('serializes distance gauges in nautical miles from flight sample enrichment', () => {
    const engine = new AchievementEngine([]);

    // Two samples 1852m apart at low altitude — 1 NM NOE run
    engine.evaluate({ type: 'flight_sample_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick', positionX: 0, positionY: 0, altRadarFt: 50, inAir: true });
    engine.evaluate({ type: 'flight_sample_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick', positionX: 1852, positionY: 0, altRadarFt: 50, inAir: true });

    const snapshot = engine.buildSnapshot({
      pilotUcid: 'pilot-1',
      triggerEvent: { type: 'flight_sample_enrichment', playerUcid: 'pilot-1' },
      unlockedAchievements: [],
    });

    expect(snapshot.state.gauges.longest_sortie_distance_nm).toBeCloseTo(1.0, 2);
    expect(snapshot.state.gauges.longest_noe_distance_nm).toBeCloseTo(1.0, 2);
  });

  it('serializes most_sead_kills_in_sortie counting SAM and AAA kills', () => {
    const engine = new AchievementEngine([]);
    const kill = (roles) => ({ type: 'kill_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick', victimUnitCategory: 'ground', victimRoles: roles });

    engine.evaluate(kill(['SAM SR']));
    engine.evaluate(kill(['SAM TR']));
    engine.evaluate(kill(['SAM LL']));     // real attr (the dead "SAM launcher")
    engine.evaluate(kill(['Static AAA'])); // real attr (the dead bare "AAA")
    engine.evaluate(kill(['Modern Tanks'])); // not SEAD

    const snapshot = engine.buildSnapshot({
      pilotUcid: 'pilot-1',
      triggerEvent: { type: 'kill_enrichment', playerUcid: 'pilot-1' },
      unlockedAchievements: [],
    });

    expect(snapshot.state.gauges.most_sead_kills_in_sortie).toBe(4);
    expect(snapshot.state.gauges.most_armored_kills_in_sortie).toBe(1);
  });

  it('serializes most_armored_kills_in_sortie using real armour attributes, most_ground_kills_in_sortie includes all', () => {
    const engine = new AchievementEngine([]);
    const kill = (roles) => ({ type: 'kill_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick', victimUnitCategory: 'ground', victimRoles: roles });

    engine.evaluate(kill(['Old Tanks', 'Tanks'])); // MBT — counts toward both
    engine.evaluate(kill(['APC']));                // APC — counts toward both
    engine.evaluate(kill(['Infantry']));           // soft — ground only
    engine.evaluate(kill(['Infantry', 'MANPADS'])); // soft — ground only

    const snapshot = engine.buildSnapshot({
      pilotUcid: 'pilot-1',
      triggerEvent: { type: 'kill_enrichment', playerUcid: 'pilot-1' },
      unlockedAchievements: [],
    });

    expect(snapshot.state.gauges.most_ground_kills_in_sortie).toBe(4);
    expect(snapshot.state.gauges.most_armored_kills_in_sortie).toBe(2);
  });

  it('longest_noe_distance_nm reflects max consecutive run, not current run after a break', () => {
    const engine = new AchievementEngine([]);

    // First NOE leg: 1852m (~1 NM)
    engine.evaluate({ type: 'flight_sample_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick', positionX: 0, positionY: 0, altRadarFt: 50, inAir: true });
    engine.evaluate({ type: 'flight_sample_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick', positionX: 1852, positionY: 0, altRadarFt: 50, inAir: true });
    // Climb breaks streak
    engine.evaluate({ type: 'flight_sample_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick', positionX: 2778, positionY: 0, altRadarFt: 5000, inAir: true });
    // Short second NOE leg: 926m
    engine.evaluate({ type: 'flight_sample_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick', positionX: 3704, positionY: 0, altRadarFt: 50, inAir: true });

    const snapshot = engine.buildSnapshot({
      pilotUcid: 'pilot-1',
      triggerEvent: { type: 'flight_sample_enrichment', playerUcid: 'pilot-1' },
      unlockedAchievements: [],
    });

    // Longest NOE run was the first leg (~1 NM), not the shorter second leg
    expect(snapshot.state.gauges.longest_noe_distance_nm).toBeCloseTo(1.0, 2);
  });

  it('serializes non-missile weapon tracks without affecting missile stats', () => {
    const engine = new AchievementEngine([]);

    engine.evaluate({
      type: 'shot_enrichment',
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
      weaponKey: 'w2',
      weaponName: 'GBU-12',
      startX: 0,
      startY: 0,
      startAlt: 1000,
    });

    engine.evaluate({
      type: 'hit_enrichment',
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
      weaponKey: 'w2',
      distanceNm: 9.4,
    });

    const snapshot = engine.buildSnapshot({
      pilotUcid: 'pilot-1',
      triggerEvent: { type: 'hit_enrichment', playerUcid: 'pilot-1' },
      unlockedAchievements: [],
    });

    expect(snapshot.state.state.weapons).toHaveLength(1);
    expect(snapshot.state.state.weapons[0].weaponClass).toBe('BOMB');
    expect(snapshot.state.state.missiles).toHaveLength(0);
    expect(snapshot.state.gauges.longest_missile_hit_nm).toBe(0);
  });

  it('applies weapon_sample_enrichment to existing weapon tracks', () => {
    const engine = new AchievementEngine([]);

    engine.evaluate({
      type: 'shot_enrichment',
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
      weaponKey: 'w3',
      weaponClass: 'AAM',
      weaponName: 'AIM-54C-Mk60',
      targetObjectId: 1002,
    });

    engine.evaluate({
      type: 'weapon_sample_enrichment',
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
      weaponKey: 'w3',
      weaponClass: 'AAM',
      inFlight: true,
      status: 'in_flight',
      speedKts: 1050,
      speedMach: 2.8,
      ageSeconds: 3.5,
    });

    const snapshot = engine.buildSnapshot({
      pilotUcid: 'pilot-1',
      triggerEvent: { type: 'weapon_sample_enrichment', playerUcid: 'pilot-1' },
      unlockedAchievements: [],
    });

    expect(snapshot.state.state.weapons).toHaveLength(1);
    expect(snapshot.state.state.weapons[0].status).toBe('in_flight');
    expect(snapshot.state.state.weapons[0].speedKts).toBeCloseTo(1050);
  });

  it('returns empty array when playerUcid is missing', () => {
    const engine = new AchievementEngine([]);
    expect(engine.evaluate({ type: 'grading' })).toEqual([]);
  });

  it('returns unlocked achievement on first qualifying event', () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    const result = engine.evaluate(grading());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('always');
  });

  it('does NOT fire the same achievement twice for the same pilot', () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    engine.evaluate(grading());
    const second = engine.evaluate(grading());
    expect(second).toHaveLength(0);
  });

  it('fires achievement independently for different pilots', () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    engine.evaluate(grading({ playerUcid: 'pilot-1' }));
    const result = engine.evaluate(grading({ playerUcid: 'pilot-2' }));
    expect(result[0].id).toBe('always');
  });

  it('swallows errors thrown by a buggy achievement', () => {
    const broken = new StubAchievement('broken', () => { throw new Error('oops'); });
    const engine = new AchievementEngine([broken]);
    expect(() => engine.evaluate(grading())).not.toThrow();
    expect(engine.evaluate(grading())).toEqual([]);
  });

  it('resetPilot clears state so the achievement can fire again', () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    engine.evaluate(grading({ playerUcid: 'pilot-1' }));
    engine.resetPilot('pilot-1');
    const result = engine.evaluate(grading({ playerUcid: 'pilot-1' }));
    expect(result[0].id).toBe('always');
  });
});

// ─── carrier_qualified ───────────────────────────────────────────────────────

describe('carrier_qualified achievement', () => {
  const ALL = require('../achievements');
  const carrierQualified = ALL.find(a => a.id === 'carrier_qualified');

  it('unlocks on the 6th trap', () => {
    const engine = new AchievementEngine([carrierQualified]);
    for (let i = 1; i <= 5; i++) {
      const result = engine.evaluate(grading());
      expect(result).toHaveLength(0);
    }
    const result = engine.evaluate(grading());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('carrier_qualified');
  });

  it('does not unlock on bolters', () => {
    const engine = new AchievementEngine([carrierQualified]);
    for (let i = 0; i < 10; i++) {
      engine.evaluate(bolterEvent());
    }
    expect(engine.unlockedByPilot.get('pilot-1')).not.toContain('carrier_qualified');
  });
});

// ─── night_qualified ─────────────────────────────────────────────────────────

describe('night_qualified achievement', () => {
  const ALL = require('../achievements');
  const nightQualified = ALL.find(a => a.id === 'night_qualified');

  it('unlocks on the 2nd night trap', () => {
    const engine = new AchievementEngine([nightQualified]);
    for (let i = 1; i <= 1; i++) {
      expect(engine.evaluate(grading({ night: true }))).toHaveLength(0);
    }
    expect(engine.evaluate(grading({ night: true }))).toHaveLength(1);
  });

  it('does not count daytime traps toward night qualification', () => {
    const engine = new AchievementEngine([nightQualified]);
    for (let i = 0; i < 6; i++) {
      engine.evaluate(grading({ night: false }));
    }
    expect(engine.evaluate(grading({ night: false }))).toHaveLength(0);
  });
});

// ─── three_wire ──────────────────────────────────────────────────────────────

describe('three_wire achievement', () => {
  const ALL = require('../achievements');
  const threeWire = ALL.find(a => a.id === 'three_wire');

  it('unlocks when wire is 3', () => {
    const engine = new AchievementEngine([threeWire]);
    expect(engine.evaluate(grading({ wire: 3 }))[0].id).toBe('three_wire');
  });

  it('does not unlock for wire 2', () => {
    const engine = new AchievementEngine([threeWire]);
    expect(engine.evaluate(grading({ wire: 2 }))).toHaveLength(0);
  });

  it('does not unlock for wire 4', () => {
    const engine = new AchievementEngine([threeWire]);
    expect(engine.evaluate(grading({ wire: 4 }))).toHaveLength(0);
  });
});

// ─── comeback_kid ────────────────────────────────────────────────────────────

describe('comeback_kid achievement', () => {
  const ALL = require('../achievements');
  const comebackKid = ALL.find(a => a.id === 'comeback_kid');

  it('unlocks when a trap follows a bolter', () => {
    const engine = new AchievementEngine([comebackKid]);
    engine.evaluate(bolterEvent());
    expect(engine.evaluate(grading())[0].id).toBe('comeback_kid');
  });

  it('does not unlock on first trap with no prior bolter', () => {
    const engine = new AchievementEngine([comebackKid]);
    expect(engine.evaluate(grading())).toHaveLength(0);
  });

  it('does not unlock trap → trap (no bolter in between)', () => {
    const engine = new AchievementEngine([comebackKid]);
    engine.evaluate(grading());
    expect(engine.evaluate(grading())).toHaveLength(0);
  });

  it('does not unlock bolter → bolter', () => {
    const engine = new AchievementEngine([comebackKid]);
    engine.evaluate(bolterEvent());
    expect(engine.evaluate(bolterEvent())).toHaveLength(0);
  });

  it('does not unlock bolter → wave-off (no trap)', () => {
    const engine = new AchievementEngine([comebackKid]);
    engine.evaluate(bolterEvent());
    expect(engine.evaluate(waveOffEvent())).toHaveLength(0);
  });
});

// ─── bolter_bolter ───────────────────────────────────────────────────────────

describe('bolter_bolter achievement', () => {
  const ALL = require('../achievements');
  const bolterBolter = ALL.find(a => a.id === 'bolter_bolter');

  it('unlocks on the second consecutive bolter', () => {
    const engine = new AchievementEngine([bolterBolter]);
    engine.evaluate(bolterEvent());
    expect(engine.evaluate(bolterEvent())[0].id).toBe('bolter_bolter');
  });

  it('does not unlock on a single bolter', () => {
    const engine = new AchievementEngine([bolterBolter]);
    expect(engine.evaluate(bolterEvent())).toHaveLength(0);
  });

  it('does not unlock when streak is broken by a trap', () => {
    const engine = new AchievementEngine([bolterBolter]);
    engine.evaluate(bolterEvent());
    engine.evaluate(grading());          // resets streak
    expect(engine.evaluate(bolterEvent())).toHaveLength(0);
  });

  it('does not unlock when streak is broken by a wave-off', () => {
    const engine = new AchievementEngine([bolterBolter]);
    engine.evaluate(bolterEvent());
    engine.evaluate(waveOffEvent());     // resets streak
    expect(engine.evaluate(bolterEvent())).toHaveLength(0);
  });
});

// ─── barely_recovered ────────────────────────────────────────────────────────

describe('barely_recovered achievement', () => {
  const ALL = require('../achievements');
  const barelyRecovered = ALL.find(a => a.id === 'barely_recovered');

  it('unlocks when fuelState < 0.05 on a trap', () => {
    const engine = new AchievementEngine([barelyRecovered]);
    expect(engine.evaluate(grading({ fuelState: 0.04 }))[0].id).toBe('barely_recovered');
  });

  it('does not unlock when fuelState >= 0.05', () => {
    const engine = new AchievementEngine([barelyRecovered]);
    expect(engine.evaluate(grading({ fuelState: 0.15 }))).toHaveLength(0);
  });

  it('does not unlock when fuelState is absent', () => {
    const engine = new AchievementEngine([barelyRecovered]);
    expect(engine.evaluate(grading({ fuelState: null }))).toHaveLength(0);
  });

  it('does not unlock on a bolter even with low fuel', () => {
    const engine = new AchievementEngine([barelyRecovered]);
    expect(engine.evaluate(bolterEvent({ fuelState: 0.02 }))).toHaveLength(0);
  });

  it('does not unlock at exactly 0.05 fuel (must be strictly less)', () => {
    const engine = new AchievementEngine([barelyRecovered]);
    expect(engine.evaluate(grading({ fuelState: 0.05 }))).toHaveLength(0);
  });
});

// ─── loadAchievementsFromApi ─────────────────────────────────────────────────

describe('AchievementEngine — loadAchievementsFromApi', () => {
  it('pre-populates the unlocked set so already-earned achievements do not fire again', async () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    const apiClient = {
      fetchPilotAchievements: jest.fn().mockResolvedValue({ achievement_ids: ['always'] }),
    };

    await engine.loadAchievementsFromApi('pilot-1', apiClient);

    expect(apiClient.fetchPilotAchievements).toHaveBeenCalledWith('pilot-1');
    // 'always' is already in the unlocked set — evaluate should not fire it again
    expect(engine.evaluate(grading({ playerUcid: 'pilot-1' }))).toHaveLength(0);
  });

  it('allows achievements not in the API list to still fire', async () => {
    const a = new StubAchievement('a', () => true);
    const b = new StubAchievement('b', () => true);
    const engine = new AchievementEngine([a, b]);
    const apiClient = {
      fetchPilotAchievements: jest.fn().mockResolvedValue({ achievement_ids: ['a'] }),
    };

    await engine.loadAchievementsFromApi('pilot-1', apiClient);

    const result = engine.evaluate(grading({ playerUcid: 'pilot-1' }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('handles an empty achievement_ids list without error', async () => {
    const engine = new AchievementEngine([]);
    const apiClient = {
      fetchPilotAchievements: jest.fn().mockResolvedValue({ achievement_ids: [] }),
    };

    await expect(engine.loadAchievementsFromApi('pilot-1', apiClient)).resolves.toBeUndefined();
  });

  it('handles a null/missing achievement_ids gracefully', async () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    const apiClient = {
      fetchPilotAchievements: jest.fn().mockResolvedValue({}),
    };

    await engine.loadAchievementsFromApi('pilot-1', apiClient);

    // Should still be able to fire since no achievements were pre-loaded
    expect(engine.evaluate(grading({ playerUcid: 'pilot-1' }))).toHaveLength(1);
  });
});
