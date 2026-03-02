/**
 * PilotState tracks per-pilot history within a session.
 * A new instance is created per pilot when their first event arrives.
 * State is held in memory only — it does not persist across sessions.
 *
 * Sortie state (takeoffLocation, launchedFromCarrier, kills) is reset on each
 * takeoff_enrichment event so stale data from a previous sortie never contaminates
 * achievement evaluation for a new one.
 */

const BOLTER_GRADE = 'B';

class PilotState {
  constructor() {
    // ── Grading state ──────────────────────────────────────────────────────────
    this.trapCount = 0;
    this.nightTrapCount = 0;
    this.consecutiveBolters = 0;
    // Snapshot of lastPassWasBolter from BEFORE the current applyGrading call,
    // so that achievements can reference the previous pass state.
    this.prevLastPassWasBolter = false;
    this.lastPassWasBolter = false;
    this.fuelAtTrap = null;

    // ── Sortie state (reset on each takeoff) ───────────────────────────────────
    // Set by applyTakeoffEnrichment when the mission script confirms where the
    // pilot launched from. Cleared and re-set on every new takeoff so an old
    // carrier sortie never bleeds into a land-base sortie.
    this.launchedFromCarrier = false;
    this.takeoffLocation = null;  // carrier/airdrome name, or null
    this.kills = [];              // array of { victimUnitCategory, carrierDistanceNm }
  }

  /**
   * Called when a takeoff_enrichment event arrives from the mission script.
   * Resets sortie state so kills from a prior sortie do not carry over.
   *
   * @param {object} event - takeoff_enrichment event
   *   { launchedFromCarrier: boolean, takeoffLocation: string|null }
   */
  applyTakeoffEnrichment(event) {
    this.launchedFromCarrier = event.launchedFromCarrier === true;
    this.takeoffLocation = event.takeoffLocation ?? null;
    this.kills = [];
  }

  /**
   * Called when a kill_enrichment event arrives from the mission script.
   * Appends the kill to the kills array for achievement evaluation.
   *
   * @param {object} event - kill_enrichment event
   *   { victimUnitCategory: string, carrierDistanceNm: number|null }
   */
  applyKill(event) {
    this.kills.push({
      victimUnitCategory: event.victimUnitCategory ?? null,
      carrierDistanceNm: typeof event.carrierDistanceNm === 'number' ? event.carrierDistanceNm : null,
    });
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
