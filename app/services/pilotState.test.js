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
      expect(state.kills[0]).toEqual({ victimUnitCategory: 'air', carrierDistanceNm: 30 });
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
  });

  describe('applyRefuelEnrichment', () => {
    it('stores refuel contact start timestamp and fuel state on contact_start', () => {
      state.applyRefuelEnrichment({
        contactEvent: 'contact_start',
        occurredAt: '2026-03-07T10:00:00.000Z',
        fuelState: 0.4,
      });

      expect(state.refuelContactStartedAtMs).toBe(Date.parse('2026-03-07T10:00:00.000Z'));
      expect(state.refuelStartFuelState).toBe(0.4);
    });

    it('computes contact duration and fuel gain on contact_end', () => {
      state.applyRefuelEnrichment({
        contactEvent: 'contact_start',
        occurredAt: '2026-03-07T10:00:00.000Z',
        fuelState: 0.45,
      });

      state.applyRefuelEnrichment({
        contactEvent: 'contact_end',
        occurredAt: '2026-03-07T10:01:15.000Z',
        fuelState: 0.60,
      });

      expect(state.lastRefuelContactDurationSeconds).toBe(75);
      expect(state.lastRefuelFuelGain).toBeCloseTo(0.15);
      expect(state.longestRefuelContactSeconds).toBe(75);
    });

    it('tracks longest contact across multiple refuels', () => {
      state.applyRefuelEnrichment({ contactEvent: 'contact_start', occurredAt: '2026-03-07T10:00:00.000Z', fuelState: 0.3 });
      state.applyRefuelEnrichment({ contactEvent: 'contact_end', occurredAt: '2026-03-07T10:00:30.000Z', fuelState: 0.35 });
      state.applyRefuelEnrichment({ contactEvent: 'contact_start', occurredAt: '2026-03-07T10:02:00.000Z', fuelState: 0.35 });
      state.applyRefuelEnrichment({ contactEvent: 'contact_end', occurredAt: '2026-03-07T10:03:30.000Z', fuelState: 0.50 });

      expect(state.longestRefuelContactSeconds).toBe(90);
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
  });
});
