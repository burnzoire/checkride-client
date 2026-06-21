const PilotState = require('./pilotState');

function trap(wire = 3, night = false, fuelState = null) {
  return { lsoGrade: 'OK', wire, night, fuelState };
}

function bolter() {
  return { lsoGrade: 'B', wire: null, night: false, fuelState: null };
}

function waveOff() {
  return { lsoGrade: 'WO', wire: null, night: false, fuelState: null };
}

describe('PilotState', () => {
  let state;

  beforeEach(() => {
    state = new PilotState();
  });

  it('starts with zeroed counters', () => {
    expect(state.trapCount).toBe(0);
    expect(state.nightTrapCount).toBe(0);
    expect(state.consecutiveBolters).toBe(0);
    expect(state.prevPassWasBolter).toBe(false);
    expect(state.fuelAtTrap).toBeNull();
  });

  it('increments trapCount on a daytime trap', () => {
    state.applyGrading(trap(3, false));
    expect(state.trapCount).toBe(1);
    expect(state.nightTrapCount).toBe(0);
  });

  it('increments both trapCount and nightTrapCount on a night trap', () => {
    state.applyGrading(trap(3, true));
    expect(state.trapCount).toBe(1);
    expect(state.nightTrapCount).toBe(1);
  });

  it('does not increment trapCount on a bolter', () => {
    state.applyGrading(bolter());
    expect(state.trapCount).toBe(0);
  });

  it('does not increment trapCount on a wave-off', () => {
    state.applyGrading(waveOff());
    expect(state.trapCount).toBe(0);
  });

  it('tracks consecutive bolters', () => {
    state.applyGrading(bolter());
    expect(state.consecutiveBolters).toBe(1);
    state.applyGrading(bolter());
    expect(state.consecutiveBolters).toBe(2);
  });

  it('resets consecutive bolters after a trap', () => {
    state.applyGrading(bolter());
    state.applyGrading(bolter());
    state.applyGrading(trap());
    expect(state.consecutiveBolters).toBe(0);
  });

  it('resets consecutive bolters after a wave-off', () => {
    state.applyGrading(bolter());
    state.applyGrading(waveOff());
    expect(state.consecutiveBolters).toBe(0);
  });

  it('prevPassWasBolter reflects the pass before the current one', () => {
    state.applyGrading(bolter());
    // After the trap, prevPassWasBolter should reflect the bolter state
    state.applyGrading(trap());
    expect(state.prevPassWasBolter).toBe(true);
  });

  it('records fuelAtTrap from grading event', () => {
    state.applyGrading(trap(3, false, 0.07));
    expect(state.fuelAtTrap).toBeCloseTo(0.07);
  });

  it('records null fuelAtTrap when fuelState is absent', () => {
    state.applyGrading(trap(3, false, null));
    expect(state.fuelAtTrap).toBeNull();
  });

  it('does not update fuelAtTrap on a bolter', () => {
    state.applyGrading(trap(3, false, 0.5));
    state.applyGrading({ lsoGrade: 'B', wire: null, night: false, fuelState: 0.1 });
    // fuelAtTrap should still reflect the last trap, not the bolter
    expect(state.fuelAtTrap).toBeCloseTo(0.5);
  });
});

// ─── sortie state (takeoff / kill enrichment) ────────────────────────────────

describe('PilotState — sortie fields', () => {
  let state;

  beforeEach(() => {
    state = new PilotState();
  });

  it('starts with launchedFromCarrier false, takeoffLocation null, and empty kills', () => {
    expect(state.launchedFromCarrier).toBe(false);
    expect(state.takeoffLocation).toBeNull();
    expect(state.kills).toEqual([]);
    expect(state.inAir).toBe(false);
  });

  describe('applyTakeoffEnrichment', () => {
    it('sets launchedFromCarrier to true when takeoff was from a carrier', () => {
      state.applyTakeoffEnrichment({ launchedFromCarrier: true, carrierName: 'CVN-71' });
      expect(state.launchedFromCarrier).toBe(true);
      expect(state.inAir).toBe(true);
    });

    it('sets launchedFromCarrier to false when takeoff was from a land base', () => {
      state.applyTakeoffEnrichment({ launchedFromCarrier: false });
      expect(state.launchedFromCarrier).toBe(false);
    });

    it('clears kills array on each new takeoff', () => {
      state.applyKill({ victimUnitCategory: 'air', carrierDistanceNm: 20 });
      expect(state.kills).toHaveLength(1);
      state.applyTakeoffEnrichment({ launchedFromCarrier: true });
      expect(state.kills).toHaveLength(0);
    });

    it('stores carrierName on the state', () => {
      state.applyTakeoffEnrichment({ launchedFromCarrier: true, takeoffLocation: 'CVN-71' });
      expect(state.takeoffLocation).toBe('CVN-71');
    });
  });

  describe('applyKill', () => {
    it('appends a kill entry with victimUnitCategory and carrierDistanceNm', () => {
      state.applyKill({ victimUnitCategory: 'air', carrierDistanceNm: 30 });
      expect(state.kills).toHaveLength(1);
      expect(state.kills[0]).toMatchObject({ victimUnitCategory: 'air', carrierDistanceNm: 30 });
    });

    it('accumulates multiple kills within the same sortie', () => {
      state.applyKill({ victimUnitCategory: 'air', carrierDistanceNm: 30 });
      state.applyKill({ victimUnitCategory: 'ground', carrierDistanceNm: 10 });
      expect(state.kills).toHaveLength(2);
    });

    it('accepts null carrierDistanceNm when no carrier reference exists', () => {
      state.applyKill({ victimUnitCategory: 'air', carrierDistanceNm: null });
      expect(state.kills[0].carrierDistanceNm).toBeNull();
    });

    it('stores weaponGuidance from the kill event', () => {
      state.applyKill({ victimUnitCategory: 'air', weaponGuidance: 'RADAR_ACTIVE' });
      expect(state.kills[0].weaponGuidance).toBe('RADAR_ACTIVE');
    });

    it('defaults weaponGuidance to null when absent', () => {
      state.applyKill({ victimUnitCategory: 'air' });
      expect(state.kills[0].weaponGuidance).toBeNull();
    });

    it('stores weaponClass from the kill event', () => {
      state.applyKill({ victimUnitCategory: 'air', weaponClass: 'AAM' });
      expect(state.kills[0].weaponClass).toBe('AAM');
    });

    it('flags fratricide only for a confirmed same-coalition kill (isEnemy false)', () => {
      state.applyKill({ victimUnitCategory: 'air', isEnemy: false });
      expect(state.kills[0].fratricide).toBe(true);
    });

    it('does not flag fratricide for an enemy kill (isEnemy true)', () => {
      state.applyKill({ victimUnitCategory: 'air', isEnemy: true });
      expect(state.kills[0].fratricide).toBe(false);
    });

    it('does not flag fratricide when coalition is unknown (isEnemy absent)', () => {
      state.applyKill({ victimUnitCategory: 'air' });
      expect(state.kills[0].fratricide).toBe(false);
    });
  });

  describe('applyRefuelEnrichment', () => {
    it('ignores started refuel events for completion metrics', () => {
      state.applyRefuelEnrichment({
        refuelStatus: 'started',
        missionTime: 120.0,
        startedAtMissionTime: 120.0,
        fuelGain: 0.02,
      });

      expect(state.lastRefuelDetectedAtMs).toBeNull();
      expect(state.lastRefuelContactDurationSeconds).toBeNull();
      expect(state.lastRefuelFuelGain).toBeNull();
      expect(state.longestRefuelContactSeconds).toBe(0);
    });

    it('stores mission-time based refuel completion from positive fuel gain', () => {
      state.applyRefuelEnrichment({
        refuelStatus: 'completed',
        missionTime: 195.0,
        fuelState: 0.60,
        fuelGain: 0.15,
        durationSeconds: 75,
      });

      expect(state.lastRefuelDetectedAtMs).toBe(195000);
      expect(state.lastRefuelContactDurationSeconds).toBe(75);
      expect(state.lastRefuelFuelGain).toBeCloseTo(0.15);
      expect(state.longestRefuelContactSeconds).toBe(75);
    });

    it('tracks longest contact across multiple refuels', () => {
      state.applyRefuelEnrichment({ refuelStatus: 'completed', missionTime: 150.0, fuelGain: 0.05, durationSeconds: 30 });
      state.applyRefuelEnrichment({ refuelStatus: 'completed', missionTime: 330.0, fuelGain: 0.15, durationSeconds: 90 });

      expect(state.longestRefuelContactSeconds).toBe(90);
      expect(state.lastRefuelFuelGain).toBeCloseTo(0.15);
    });

    it('does not compute contact duration when duration is missing', () => {
      state.applyRefuelEnrichment({
        refuelStatus: 'completed',
        occurredAt: '2026-03-07T10:01:15.000Z',
        fuelState: 0.60,
        fuelGain: 0.15,
      });

      expect(state.lastRefuelDetectedAtMs).toBe(Date.parse('2026-03-07T10:01:15.000Z'));
      expect(state.lastRefuelContactDurationSeconds).toBeNull();
      expect(state.longestRefuelContactSeconds).toBe(0);
      expect(state.lastRefuelFuelGain).toBeCloseTo(0.15);
    });

    it('marks event non-persistent when fuel gain is missing or zero', () => {
      const event = {
        refuelStatus: 'completed',
        missionTime: 123.0,
        fuelState: 0.55,
        fuelGain: 0,
      };
      state.applyRefuelEnrichment(event);

      expect(state.lastRefuelContactDurationSeconds).toBeNull();
      expect(state.lastRefuelFuelGain).toBeNull();
      expect(state.longestRefuelContactSeconds).toBe(0);
      expect(event.persist).toBe(false);
    });

    it('uses duration_seconds and fuel_gain aliases from snake_case payloads', () => {
      state.applyRefuelEnrichment({
        refuelStatus: 'completed',
        mission_time: 212.0,
        fuel_gain: 0.14,
        duration_seconds: 12,
      });

      expect(state.lastRefuelDetectedAtMs).toBe(212000);
      expect(state.lastRefuelContactDurationSeconds).toBe(12);
      expect(state.lastRefuelFuelGain).toBeCloseTo(0.14);
      expect(state.longestRefuelContactSeconds).toBe(12);
    });
  });

  describe('inAir tracking', () => {
    it('records takeoffLocation from takeoff event airdromeName', () => {
      state.applyTakeoff({ occurredAt: '2026-03-07T10:00:00.000Z', airdromeName: 'Batumi' });

      expect(state.inAir).toBe(true);
      expect(state.takeoffLocation).toBe('Batumi');
      expect(state.launchedFromCarrier).toBe(false);
    });

    it('sets inAir true on takeoff and false on landing', () => {
      state.applyTakeoff({ occurredAt: '2026-03-07T10:00:00.000Z' });
      expect(state.inAir).toBe(true);

      state.applyLanding();
      expect(state.inAir).toBe(false);
    });

    it('sets inAir false on pilot down events', () => {
      state.applyTakeoff({ occurredAt: '2026-03-07T10:00:00.000Z' });
      expect(state.inAir).toBe(true);

      state.applyPilotDown();
      expect(state.inAir).toBe(false);
    });

    it('resets inAir false on slot change', () => {
      state.applyTakeoff({ occurredAt: '2026-03-07T10:00:00.000Z' });
      expect(state.inAir).toBe(true);

      state.applyChangeSlot();
      expect(state.inAir).toBe(false);
    });

    it('sets inAir true on slot change when flyable is true', () => {
      state.applyChangeSlot({ flyable: true });
      expect(state.inAir).toBe(true);
    });

    it('sets inAir false on slot change when flyable is false', () => {
      state.applyTakeoff({ occurredAt: '2026-03-07T10:00:00.000Z' });
      expect(state.inAir).toBe(true);

      state.applyChangeSlot({ flyable: false });
      expect(state.inAir).toBe(false);
    });

    it('sets inAir false when changing between flyable slots', () => {
      state.applyChangeSlot({ slotId: '2', flyable: true });
      expect(state.inAir).toBe(true);

      state.applyChangeSlot({ slotId: '5', flyable: true });
      expect(state.inAir).toBe(false);
    });

    it('clears takeoffLocation and carrier flag on slot change', () => {
      state.applyTakeoffEnrichment({ launchedFromCarrier: true, takeoffLocation: 'CVN-71' });

      state.applyChangeSlot({ slotId: '5', flyable: true });

      expect(state.takeoffLocation).toBeNull();
      expect(state.launchedFromCarrier).toBe(false);
    });

    it('keeps inAir true for repeated change_slot on same flyable slot', () => {
      state.applyChangeSlot({ slotId: '2', flyable: true });
      expect(state.inAir).toBe(true);

      state.applyChangeSlot({ slotId: '2', flyable: true });
      expect(state.inAir).toBe(true);
    });

    it('uses inAir from flight sample enrichment when provided', () => {
      state.applyFlightSampleEnrichment({ inAir: true });
      expect(state.inAir).toBe(true);

      state.applyFlightSampleEnrichment({ in_air: false });
      expect(state.inAir).toBe(false);
    });

    it('captures currentFuelState from flight sample enrichment', () => {
      state.applyFlightSampleEnrichment({ currentFuelState: 0.62 });
      expect(state.currentFuelState).toBeCloseTo(0.62);

      state.applyFlightSampleEnrichment({ current_fuel_state: 0.59 });
      expect(state.currentFuelState).toBeCloseTo(0.59);
    });

    it('captures mach, radar altitude, and position from flight sample enrichment', () => {
      state.applyFlightSampleEnrichment({
        speedMach: 0.91,
        altRadarFt: 830,
        positionX: -241033.4,
        positionY: 524199.2,
      });

      expect(state.currentSpeedMach).toBeCloseTo(0.91);
      expect(state.currentRadarAltitudeFt).toBeCloseTo(830);
      expect(state.currentPositionX).toBeCloseTo(-241033.4);
      expect(state.currentPositionY).toBeCloseTo(524199.2);

      state.applyFlightSampleEnrichment({
        speed_mach: 0.87,
        alt_radar_ft: 760,
        position_x: -241000.0,
        position_y: 524250.0,
      });

      expect(state.currentSpeedMach).toBeCloseTo(0.87);
      expect(state.currentRadarAltitudeFt).toBeCloseTo(760);
      expect(state.currentPositionX).toBeCloseTo(-241000.0);
      expect(state.currentPositionY).toBeCloseTo(524250.0);
    });

    it('tracks air-to-air missile shot and hit lifecycle', () => {
      state.applyShotEnrichment({
        weaponKey: 'weapon-1',
        weaponName: 'AIM-120C',
        targetObjectId: 101,
        startX: 1000,
        startY: 2000,
        startAlt: 3000,
      });

      expect(state.missiles).toHaveLength(1);
      expect(state.missiles[0].inFlight).toBe(true);

      state.applyHitEnrichment({
        weaponKey: 'weapon-1',
        targetObjectId: 101,
        hitX: 1000,
        hitY: 3852,
        hitAlt: 3152.4,
      });

      expect(state.missiles[0].inFlight).toBe(false);
      expect(state.missiles[0].distanceNm).toBeCloseTo(1.0, 3);
      expect(state.missiles[0].heightDeltaFt).toBeCloseTo(500.0, 1);
      expect(state.longestMissileHit).toBeCloseTo(1.0, 3);
      expect(state.ordnanceLog).toHaveLength(1);
      expect(state.ordnanceLog[0]).toEqual(expect.objectContaining({
        weaponKey: 'weapon-1',
        weaponObjectId: null,
        startTimeMs: expect.any(Number),
        endTimeMs: expect.any(Number),
        hitOrMiss: 'hit',
        targetObjectId: 101,
      }));
    });

    it('updates longestMissileHit using explicit hit distance when provided', () => {
      state.applyShotEnrichment({
        weaponKey: 'weapon-2',
        weaponName: 'AIM-9X',
        targetObjectId: 202,
        startX: 0,
        startY: 0,
        startAlt: 0,
      });

      state.applyHitEnrichment({
        weaponKey: 'weapon-2',
        targetObjectId: 202,
        distanceNm: 12.5,
        heightDeltaFt: -430,
      });

      expect(state.longestMissileHit).toBeCloseTo(12.5);
      expect(state.missiles[0].heightDeltaFt).toBeCloseTo(-430);
    });

    it('matches missile hit by weaponKey when targetObjectId is missing', () => {
      state.applyShotEnrichment({
        weaponKey: 'weapon-2b',
        weaponName: 'AIM_120C',
        startX: 0,
        startY: 0,
        startAlt: 0,
      });

      state.applyHitEnrichment({
        weaponKey: 'weapon-2b',
        distanceNm: 18.2,
      });

      expect(state.missiles).toHaveLength(1);
      expect(state.missiles[0].inFlight).toBe(false);
      expect(state.missiles[0].distanceNm).toBeCloseTo(18.2);
      expect(state.longestMissileHit).toBeCloseTo(18.2);
    });

    it('matches missile hit by weaponObjectId when targetObjectId is missing', () => {
      state.applyShotEnrichment({
        weaponKey: 'weapon-2c',
        weaponName: 'AIM_54C',
        weaponObjectId: 4555,
        startX: 0,
        startY: 0,
        startAlt: 0,
      });

      state.applyHitEnrichment({
        weaponObjectId: 4555,
        distanceNm: 24.04,
      });

      expect(state.missiles).toHaveLength(1);
      expect(state.missiles[0].inFlight).toBe(false);
      expect(state.missiles[0].distanceNm).toBeCloseTo(24.04);
      expect(state.longestMissileHit).toBeCloseTo(24.04);
    });

    it('matches hit to in-flight missile by targetObjectId when weaponKey is missing', () => {
      state.applyShotEnrichment({
        weaponKey: 'weapon-3',
        weaponName: 'AIM-54C-Mk60',
        targetObjectId: 16777729,
        startX: 0,
        startY: 0,
        startAlt: 0,
      });

      state.applyHitEnrichment({
        targetObjectId: 16777729,
        distanceNm: 21.4,
      });

      expect(state.missiles[0].inFlight).toBe(false);
      expect(state.missiles[0].distanceNm).toBeCloseTo(21.4);
      expect(state.longestMissileHit).toBeCloseTo(21.4);
    });

    it('tracks non-missile weapons as first-class weapon objects', () => {
      state.applyShotEnrichment({
        weaponKey: 'weapon-4',
        weaponName: 'GBU-12',
        startX: 0,
        startY: 0,
        startAlt: 1000,
      });

      expect(state.weapons).toHaveLength(1);
      expect(state.weapons[0].weaponClass).toBe('BOMB');
      expect(state.missiles).toHaveLength(0);

      state.applyHitEnrichment({
        weaponKey: 'weapon-4',
        distanceNm: 7.3,
      });

      expect(state.weapons[0].inFlight).toBe(false);
      expect(state.weapons[0].distanceNm).toBeCloseTo(7.3);
      expect(state.longestWeaponHit).toBeCloseTo(7.3);
      expect(state.longestMissileHit).toBe(0);
    });

    it('marks an ordnance log entry as miss when weapon sample expires', () => {
      state.applyShotEnrichment({
        weaponKey: 'weapon-4b',
        weaponName: 'GBU-12',
        targetObjectId: 4444,
      });

      state.applyWeaponSampleEnrichment({
        weaponKey: 'weapon-4b',
        status: 'expired',
        inFlight: false,
      });

      expect(state.ordnanceLog).toHaveLength(1);
      expect(state.ordnanceLog[0]).toEqual(expect.objectContaining({
        weaponKey: 'weapon-4b',
        hitOrMiss: 'miss',
        targetObjectId: 4444,
        endTimeMs: expect.any(Number),
      }));
    });

    it('updates weapon track status/speed from weapon sample enrichment', () => {
      state.applyShotEnrichment({
        weaponKey: 'weapon-5',
        weaponName: 'AIM-54C-Mk60',
        targetObjectId: 777,
      });

      state.applyWeaponSampleEnrichment({
        weaponKey: 'weapon-5',
        weaponClass: 'AAM',
        inFlight: true,
        status: 'in_flight',
        speedKts: 980,
        speedMach: 2.4,
        ageSeconds: 4.2,
      });

      expect(state.weapons[0].status).toBe('in_flight');
      expect(state.weapons[0].speedKts).toBeCloseTo(980);
      expect(state.weapons[0].speedMach).toBeCloseTo(2.4);
      expect(state.missiles).toHaveLength(1);
    });
  });
});

// ─── applyKill — null/missing field branches ─────────────────────────────────

describe('PilotState — applyKill null field branches', () => {
  let state;
  beforeEach(() => { state = new PilotState(); });

  it('uses null when victimUnitCategory is not provided', () => {
    state.applyKill({ carrierDistanceNm: 10 });
    expect(state.kills[0].victimUnitCategory).toBeNull();
  });

  it('uses empty array when victimRoles is not an array', () => {
    state.applyKill({ victimUnitCategory: 'air', victimRoles: null });
    expect(state.kills[0].victimRoles).toEqual([]);
  });

  it('stores victimRoles array when provided', () => {
    state.applyKill({ victimUnitCategory: 'ground', victimRoles: ['SAM SR', 'SAM launcher'] });
    expect(state.kills[0].victimRoles).toEqual(['SAM SR', 'SAM launcher']);
  });
});

// ─── applyFlightSampleEnrichment — dead status branch + unitCategory ────────

describe('PilotState — applyFlightSampleEnrichment dead status', () => {
  let state;
  beforeEach(() => { state = new PilotState(); });

  it('updates inAir but does not change aircraftStatus when status is dead', () => {
    state.applyPilotDown({ type: 'crash' });
    expect(state.aircraftStatus).toBe('dead');
    state.applyFlightSampleEnrichment({ inAir: true });
    expect(state.inAir).toBe(true);
    expect(state.aircraftStatus).toBe('dead');
  });

  it('sets currentUnitCategory when unitCategory is provided', () => {
    state.applyFlightSampleEnrichment({ unitCategory: 'AIRPLANE' });
    expect(state.currentUnitCategory).toBe('AIRPLANE');
  });
});

// ─── applyShotEnrichment — early return on missing weaponKey ─────────────────

describe('PilotState — applyShotEnrichment early return', () => {
  let state;
  beforeEach(() => { state = new PilotState(); });

  it('returns early and does not add a weapon when weaponKey is missing', () => {
    state.applyShotEnrichment({ weaponName: 'AIM-120C' });
    expect(state.weapons).toHaveLength(0);
  });
});

// ─── applyFlightSampleEnrichment — highest tracking + payload ────────────────

describe('PilotState — applyFlightSampleEnrichment highest tracking', () => {
  let state;
  beforeEach(() => { state = new PilotState(); });

  it('tracks highestSpeedKts as a running max', () => {
    state.applyFlightSampleEnrichment({ speedKts: 400 });
    state.applyFlightSampleEnrichment({ speedKts: 600 });
    state.applyFlightSampleEnrichment({ speedKts: 500 });
    expect(state.highestSpeedKts).toBe(600);
  });

  it('tracks highestAltitudeFt as a running max', () => {
    state.applyFlightSampleEnrichment({ altitudeFt: 20000 });
    state.applyFlightSampleEnrichment({ altitudeFt: 45000 });
    state.applyFlightSampleEnrichment({ altitudeFt: 30000 });
    expect(state.highestAltitudeFt).toBe(45000);
  });

  it('sets currentPayload from ammoPayload array', () => {
    const payload = [{ count: 4, typeName: 'AIM-120C', displayName: 'AMRAAM', category: 1 }];
    state.applyFlightSampleEnrichment({ ammoPayload: payload });
    expect(state.currentPayload).toEqual(payload);
  });

  it('does not set currentPayload when ammoPayload is not an array', () => {
    state.applyFlightSampleEnrichment({ ammoPayload: null });
    expect(state.currentPayload).toBeNull();
  });
});

// ─── applyShotEnrichment — update existing + max tracks ─────────────────────

describe('PilotState — applyShotEnrichment edge cases', () => {
  let state;
  beforeEach(() => { state = new PilotState(); });

  it('updates existing in-flight weapon when weaponKey matches', () => {
    state.applyShotEnrichment({ weaponKey: 'w1', weaponName: 'AIM-120C', speedMach: 2.1 });
    state.applyShotEnrichment({ weaponKey: 'w1', weaponName: 'AIM-120C', speedMach: 2.5 });
    expect(state.weapons).toHaveLength(1);
    expect(state.weapons[0].speedMach).toBeCloseTo(2.5);
  });

  it('caps weapons array at 100 tracks', () => {
    for (let i = 0; i < 101; i++) {
      state.applyShotEnrichment({ weaponKey: `w${i}`, weaponName: 'GBU-12' });
    }
    expect(state.weapons.length).toBeLessThanOrEqual(100);
  });
});

// ─── applyWeaponSampleEnrichment — fallback paths ───────────────────────────

describe('PilotState — applyWeaponSampleEnrichment fallback paths', () => {
  let state;
  beforeEach(() => { state = new PilotState(); });

  it('finds track by weaponObjectId when weaponKey lookup misses', () => {
    state.applyShotEnrichment({ weaponKey: 'w1', weaponName: 'AIM-54C', weaponObjectId: 999 });
    state.applyWeaponSampleEnrichment({ weaponObjectId: 999, speedMach: 3.1, inFlight: true, status: 'in_flight' });
    expect(state.weapons[0].speedMach).toBeCloseTo(3.1);
  });

  it('creates a new track from weapon sample when no prior track found', () => {
    state.applyWeaponSampleEnrichment({ weaponKey: 'new-w', weaponName: 'AIM-120C', inFlight: true, status: 'in_flight' });
    expect(state.weapons).toHaveLength(1);
    expect(state.weapons[0].weaponKey).toBe('new-w');
  });

  it('returns early when no weaponKey and no matching track', () => {
    state.applyWeaponSampleEnrichment({ weaponObjectId: 999 });
    expect(state.weapons).toHaveLength(0);
  });

  it('sets completedAtMs when weapon sample status is expired', () => {
    state.applyShotEnrichment({ weaponKey: 'w1', weaponName: 'AIM-120C' });
    state.applyWeaponSampleEnrichment({ weaponKey: 'w1', inFlight: false, status: 'expired' });
    expect(Number.isFinite(state.weapons[0].completedAtMs)).toBe(true);
  });

  it('sets completedAtMs when weapon sample status is hit', () => {
    state.applyShotEnrichment({ weaponKey: 'w1', weaponName: 'AIM-120C' });
    state.applyWeaponSampleEnrichment({ weaponKey: 'w1', inFlight: false, status: 'hit' });
    expect(Number.isFinite(state.weapons[0].completedAtMs)).toBe(true);
  });
});

// ─── applyHitEnrichment — hitCounters + fallback matching ───────────────────

describe('PilotState — applyHitEnrichment edge cases', () => {
  let state;
  beforeEach(() => { state = new PilotState(); });

  it('increments hitCounters by roleCoalition', () => {
    state.applyHitEnrichment({ roleCoalition: 'sam_enemy' });
    state.applyHitEnrichment({ roleCoalition: 'sam_enemy' });
    state.applyHitEnrichment({ roleCoalition: 'armour_enemy' });
    expect(state.hitCounters['sam_enemy']).toBe(2);
    expect(state.hitCounters['armour_enemy']).toBe(1);
  });

  it('returns early when no candidates match', () => {
    expect(() => state.applyHitEnrichment({})).not.toThrow();
    expect(state.weapons).toHaveLength(0);
  });

  it('filters to non-AAM weapons when no identifiers are provided', () => {
    state.applyShotEnrichment({ weaponKey: 'aam', weaponName: 'AIM-120C', targetObjectId: 1 });
    state.applyShotEnrichment({ weaponKey: 'bomb', weaponName: 'GBU-12', targetObjectId: 2 });
    state.applyHitEnrichment({ distanceNm: 5.0 });
    expect(state.weapons.find(w => w.weaponKey === 'bomb').inFlight).toBe(false);
    expect(state.weapons.find(w => w.weaponKey === 'aam').inFlight).toBe(true);
  });

  it('falls back to weaponObjectId lookup when primary candidates are empty', () => {
    state.applyShotEnrichment({ weaponKey: 'w1', weaponName: 'AIM-120C', weaponObjectId: 777, targetObjectId: 1 });
    state.applyHitEnrichment({ weaponObjectId: 777, targetObjectId: 99, distanceNm: 10 });
    expect(state.weapons[0].inFlight).toBe(false);
    expect(state.weapons[0].distanceNm).toBeCloseTo(10);
  });

  it('returns null distanceNm when start coordinates are missing', () => {
    state.applyShotEnrichment({ weaponKey: 'w-nopos', weaponName: 'AIM-120C' });
    state.applyHitEnrichment({ weaponKey: 'w-nopos', hitX: 1000, hitY: 2000, hitAlt: 3000 });
    expect(state.missiles[0].distanceNm).toBeNull();
  });
});

// ─── applyChangeSlot — inAir field ──────────────────────────────────────────

describe('PilotState — applyChangeSlot inAir field', () => {
  let state;
  beforeEach(() => { state = new PilotState(); });

  it('sets inAir and aircraftStatus directly from inAir field, overriding flyable', () => {
    state.applyChangeSlot({ inAir: true, flyable: false });
    expect(state.inAir).toBe(true);
    expect(state.aircraftStatus).toBe('airborne');
  });

  it('sets inAir false and aircraftStatus ground when inAir is false', () => {
    state.applyChangeSlot({ inAir: false });
    expect(state.inAir).toBe(false);
    expect(state.aircraftStatus).toBe('ground');
  });
});

// ─── inbound missile tracking ────────────────────────────────────────────────

describe('PilotState — inbound missile tracking', () => {
  let state;
  beforeEach(() => { state = new PilotState(); });

  it('tracks an inbound missile', () => {
    state.applyInboundMissile({ weaponKey: 'inbound-1', weaponName: 'SA-6', weaponGuidance: 'RADAR_SEMI_ACTIVE', initiatorRole: 'SAM', missionTime: 200 });
    expect(state.inboundMissiles).toHaveLength(1);
    expect(state.inboundMissiles[0].inFlight).toBe(true);
    expect(state.inboundMissiles[0].status).toBe('in_flight');
  });

  it('returns early when inboundMissile has no weaponKey', () => {
    state.applyInboundMissile({});
    expect(state.inboundMissiles).toHaveLength(0);
  });

  it('marks inbound missile as hit', () => {
    state.applyInboundMissile({ weaponKey: 'inbound-1' });
    state.applyInboundMissileHit({ weaponKey: 'inbound-1' });
    expect(state.inboundMissiles[0].inFlight).toBe(false);
    expect(state.inboundMissiles[0].status).toBe('hit');
  });

  it('returns early from inboundMissileHit when weaponKey is missing', () => {
    state.applyInboundMissile({ weaponKey: 'inbound-1', missionTime: 200 });
    expect(() => state.applyInboundMissileHit({})).not.toThrow();
    expect(state.inboundMissiles[0].inFlight).toBe(true);
  });

  it('returns early from inboundMissileHit when no matching track', () => {
    state.applyInboundMissile({ weaponKey: 'inbound-1', missionTime: 200 });
    state.applyInboundMissileHit({ weaponKey: 'no-match', missionTime: 202 });
    expect(state.inboundMissiles[0].inFlight).toBe(true);
  });

  it('retains completed inbound missiles within TTL', () => {
    state.applyInboundMissile({ weaponKey: 'w1' });
    state.applyInboundMissileHit({ weaponKey: 'w1' });
    state.applyInboundMissile({ weaponKey: 'w2' });
    expect(state.inboundMissiles).toHaveLength(2);
  });

  it('prunes completed inbound missiles after TTL expires', () => {
    jest.useFakeTimers();
    state.applyInboundMissile({ weaponKey: 'old' });
    state.applyInboundMissileHit({ weaponKey: 'old' });
    jest.advanceTimersByTime(61000);
    state.applyInboundMissile({ weaponKey: 'new' });
    expect(state.inboundMissiles.find(m => m.weaponKey === 'old')).toBeUndefined();
    expect(state.inboundMissiles.find(m => m.weaponKey === 'new')).toBeDefined();
    jest.useRealTimers();
  });

  it('prunes completed inbound missiles with null completedAtMs', () => {
    state.applyInboundMissile({ weaponKey: 'w1' });
    state.inboundMissiles[0].inFlight = false;
    state.inboundMissiles[0].completedAtMs = null;
    state.applyInboundMissile({ weaponKey: 'w2' });
    expect(state.inboundMissiles.find(m => m.weaponKey === 'w1')).toBeUndefined();
  });
});

// ─── gun burst tracking ──────────────────────────────────────────────────────

describe('PilotState — gun burst tracking', () => {
  let state;
  beforeEach(() => { state = new PilotState(); });

  it('tracks gun burst duration', () => {
    state.applyGunBurstStart({ startAtMs: 10000 });
    state.applyGunBurstEnd({ endAtMs: 13500 });
    expect(state.longestGunBurstSeconds).toBeCloseTo(3.5);
    expect(state.gunBurstStartAtMs).toBeNull();
  });

  it('tracks longest gun burst across multiple bursts', () => {
    state.applyGunBurstStart({ startAtMs: 1000 });
    state.applyGunBurstEnd({ endAtMs: 3000 });
    state.applyGunBurstStart({ startAtMs: 5000 });
    state.applyGunBurstEnd({ endAtMs: 10000 });
    expect(state.longestGunBurstSeconds).toBeCloseTo(5.0);
  });

  it('ignores gun burst end when no start recorded', () => {
    state.applyGunBurstEnd({ endAtMs: 5000 });
    expect(state.longestGunBurstSeconds).toBe(0);
  });

  it('ignores gun burst end when endAtMs is missing', () => {
    state.applyGunBurstStart({ startAtMs: 1000 });
    state.applyGunBurstEnd({});
    expect(state.longestGunBurstSeconds).toBe(0);
  });

  it('uses missionTime as fallback for gun burst start', () => {
    state.applyGunBurstStart({ missionTime: 10.0 });
    state.applyGunBurstEnd({ endAtMs: 12500 });
    expect(state.longestGunBurstSeconds).toBeCloseTo(2.5);
  });

  it('does not update longestGunBurstSeconds when burst is shorter than current longest', () => {
    state.applyGunBurstStart({ startAtMs: 0 });
    state.applyGunBurstEnd({ endAtMs: 5000 }); // 5s
    state.applyGunBurstStart({ startAtMs: 10000 });
    state.applyGunBurstEnd({ endAtMs: 12000 }); // 2s — shorter
    expect(state.longestGunBurstSeconds).toBeCloseTo(5.0);
  });
});

// ─── _pruneCompletedWeapons TTL ──────────────────────────────────────────────

describe('PilotState — _pruneCompletedWeapons TTL', () => {
  let state;
  beforeEach(() => { state = new PilotState(); });

  it('prunes completed weapons after 60s TTL expires', () => {
    jest.useFakeTimers();
    state.applyShotEnrichment({ weaponKey: 'old', weaponName: 'GBU-12' });
    state.applyHitEnrichment({ weaponKey: 'old', distanceNm: 3.0 });
    jest.advanceTimersByTime(61000);
    state.applyShotEnrichment({ weaponKey: 'new', weaponName: 'GBU-12' });
    expect(state.weapons.find(w => w.weaponKey === 'old')).toBeUndefined();
    expect(state.weapons.find(w => w.weaponKey === 'new')).toBeDefined();
    jest.useRealTimers();
  });
});

// ─── distance gauges ─────────────────────────────────────────────────────────

describe('PilotState — sortie and NOE distance tracking', () => {
  let state;
  beforeEach(() => { state = new PilotState(); });

  function sample(positionX, positionY, altRadarFt, inAir = true) {
    return { positionX, positionY, altRadarFt, inAir };
  }

  it('accumulates sortieDistanceKm between flight samples while airborne', () => {
    // 1852m = 1 NM = 1km * (1/1.852) — use a round 1852m step
    state.applyFlightSampleEnrichment(sample(0, 0, 500));
    state.applyFlightSampleEnrichment(sample(1852, 0, 500));
    expect(state.sortieDistanceKm).toBeCloseTo(1.852, 3);
  });

  it('does not accumulate distance when not airborne', () => {
    state.applyFlightSampleEnrichment(sample(0, 0, 500, false));
    state.applyFlightSampleEnrichment(sample(1852, 0, 500, false));
    expect(state.sortieDistanceKm).toBe(0);
  });

  it('ignores jumps greater than 5 km (teleports/slot changes)', () => {
    state.applyFlightSampleEnrichment(sample(0, 0, 500));
    state.applyFlightSampleEnrichment(sample(6000, 0, 500));
    expect(state.sortieDistanceKm).toBe(0);
  });

  it('accumulates noeConsecutiveDistanceKm while radar alt <= 100 ft', () => {
    state.applyFlightSampleEnrichment(sample(0, 0, 50));
    state.applyFlightSampleEnrichment(sample(1852, 0, 80));
    expect(state.noeConsecutiveDistanceKm).toBeCloseTo(1.852, 3);
  });

  it('resets noeConsecutiveDistanceKm when climbing above 100 ft', () => {
    state.applyFlightSampleEnrichment(sample(0, 0, 50));
    state.applyFlightSampleEnrichment(sample(1852, 0, 50));
    state.applyFlightSampleEnrichment(sample(3704, 0, 500)); // climb — resets consecutive
    expect(state.noeConsecutiveDistanceKm).toBe(0);
  });

  it('tracks longestNoeConsecutiveDistanceKm across a broken NOE run', () => {
    // First NOE leg: 1852m
    state.applyFlightSampleEnrichment(sample(0, 0, 50));
    state.applyFlightSampleEnrichment(sample(1852, 0, 50));
    // Climb breaks the streak
    state.applyFlightSampleEnrichment(sample(3704, 0, 500));
    // Second NOE leg: only 926m — shorter
    state.applyFlightSampleEnrichment(sample(4630, 0, 50));
    state.applyFlightSampleEnrichment(sample(5556, 0, 50));
    expect(state.longestNoeConsecutiveDistanceKm).toBeCloseTo(1.852, 3);
  });

  it('resets all distance state on takeoff_enrichment', () => {
    state.applyFlightSampleEnrichment(sample(0, 0, 50));
    state.applyFlightSampleEnrichment(sample(1852, 0, 50));
    state.applyTakeoffEnrichment({ launchedFromCarrier: false });
    expect(state.sortieDistanceKm).toBe(0);
    expect(state.noeConsecutiveDistanceKm).toBe(0);
    expect(state.longestNoeConsecutiveDistanceKm).toBe(0);
  });
});

// ─── _inferWeaponClassFromName ───────────────────────────────────────────────

describe('PilotState — _inferWeaponClassFromName', () => {
  let state;
  beforeEach(() => { state = new PilotState(); });

  it('returns unknown for empty weapon name', () => {
    state.applyShotEnrichment({ weaponKey: 'w1', weaponName: '' });
    expect(state.weapons[0].weaponClass).toBe('UNKNOWN');
  });

  it('classifies AGM as MISSILE', () => {
    state.applyShotEnrichment({ weaponKey: 'w1', weaponName: 'AGM-65D' });
    expect(state.weapons[0].weaponClass).toBe('MISSILE');
  });

  it('classifies Maverick as MISSILE', () => {
    state.applyShotEnrichment({ weaponKey: 'w1', weaponName: 'Maverick' });
    expect(state.weapons[0].weaponClass).toBe('MISSILE');
  });

  it('classifies Hydra as ROCKET', () => {
    state.applyShotEnrichment({ weaponKey: 'w1', weaponName: 'Hydra-70' });
    expect(state.weapons[0].weaponClass).toBe('ROCKET');
  });

  it('classifies unrecognised weapon names as UNKNOWN', () => {
    state.applyShotEnrichment({ weaponKey: 'w1', weaponName: 'UnknownWeapon' });
    expect(state.weapons[0].weaponClass).toBe('UNKNOWN');
  });
});
