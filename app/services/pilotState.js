/**
 * PilotState tracks per-pilot grading history within a session.
 * A new instance is created per pilot when their first grading event arrives.
 * State is held in memory only — it does not persist across sessions.
 */

const BOLTER_GRADE = 'BOLTER';

class PilotState {
  constructor() {
    this.trapCount = 0;
    this.nightTrapCount = 0;
    this.consecutiveBolters = 0;
    // Snapshot of lastPassWasBolter from BEFORE the current applyGrading call,
    // so that achievements can reference the previous pass state.
    this.prevLastPassWasBolter = false;
    this.lastPassWasBolter = false;
    this.fuelAtTrap = null;
  }

  /**
   * Update state from a raw grading event.
   * Must be called before evaluating achievements so that counts are current,
   * but prevLastPassWasBolter is snapshotted first so comeback-style achievements work.
   *
   * @param {object} event - raw grading event (lsoGrade, wire, night, fuelState, ...)
   */
  applyGrading(event) {
    const isBolter = event.lsoGrade === BOLTER_GRADE;
    const isTrap = !isBolter && Number.isFinite(event.wire);

    // Snapshot before updating so achievements can see the previous pass state.
    this.prevLastPassWasBolter = this.lastPassWasBolter;

    if (isTrap) {
      this.trapCount++;
      if (event.night) {
        this.nightTrapCount++;
      }
      this.fuelAtTrap = typeof event.fuelState === 'number' ? event.fuelState : null;
    }

    if (isBolter) {
      this.consecutiveBolters++;
    } else {
      // Wave-off, trap, or anything else resets the consecutive bolter streak.
      this.consecutiveBolters = 0;
    }

    this.lastPassWasBolter = isBolter;
  }
}

module.exports = PilotState;
