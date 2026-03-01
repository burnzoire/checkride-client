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
    expect(state.lastPassWasBolter).toBe(false);
    expect(state.prevLastPassWasBolter).toBe(false);
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

  it('sets lastPassWasBolter after a bolter', () => {
    state.applyGrading(bolter());
    expect(state.lastPassWasBolter).toBe(true);
  });

  it('clears lastPassWasBolter after a trap', () => {
    state.applyGrading(bolter());
    state.applyGrading(trap());
    expect(state.lastPassWasBolter).toBe(false);
  });

  it('snapshots prevLastPassWasBolter before updating', () => {
    state.applyGrading(bolter());
    // After the trap, prevLastPassWasBolter should reflect the bolter state
    state.applyGrading(trap());
    expect(state.prevLastPassWasBolter).toBe(true);
    expect(state.lastPassWasBolter).toBe(false);
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
