/**
 * @typedef {Object} Kill
 * @property {'air'|'ground'|'ship'|'other'} victimUnitCategory
 * @property {number|null} carrierDistanceNm - distance in nautical miles from the pilot's carrier, or null if no carrier reference exists
 */

/**
 * @typedef {Object} GradingEvent
 * @property {'_OK_'|'OK'|'(OK)'|'--'|'B'|'C'|'WO'} lsoGrade
 * @property {number|null} wire - arrested wire number, or null for bolter/wave-off
 * @property {boolean} night
 * @property {number|null} fuelState - normalized 0.0–1.0, or null if unavailable
 * @property {string|null} [carrierName]
 * @property {string|null} [unitType]
 * @property {string|null} [gradingRaw]
 */

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
    // Chronological record of every grading pass this session. All per-pass
    // counters and flags are derived from this array via getters so there is
    // no duplicated or stale incremental state to maintain.
    /** @type {GradingEvent[]} */
    this.passes = [];

    // ── Sortie state (reset on each takeoff) ───────────────────────────────────
    // Set by applyTakeoffEnrichment when the mission script confirms where the
    // pilot launched from. Cleared and re-set on every new takeoff so an old
    // carrier sortie never bleeds into a land-base sortie.
    this.launchedFromCarrier = false;
    this.takeoffLocation = null;  // carrier/airdrome name, or null
    /** @type {Kill[]} */
    this.kills = [];              // array of { victimUnitCategory, carrierDistanceNm }
  }

  // ── Derived grading state ──────────────────────────────────────────────────

  get trapCount() {
    return this.passes.filter(p => Number.isFinite(p.wire)).length;
  }

  get nightTrapCount() {
    return this.passes.filter(p => Number.isFinite(p.wire) && p.night).length;
  }

  get consecutiveBolters() {
    let count = 0;
    for (let i = this.passes.length - 1; i >= 0; i--) {
      if (this.passes[i].lsoGrade === BOLTER_GRADE) count++;
      else break;
    }
    return count;
  }

  get prevPassWasBolter() {
    return this.passes.length > 1 &&
      this.passes[this.passes.length - 2].lsoGrade === BOLTER_GRADE;
  }

  get fuelAtTrap() {
    for (let i = this.passes.length - 1; i >= 0; i--) {
      const p = this.passes[i];
      if (Number.isFinite(p.wire)) {
        return typeof p.fuelState === 'number' ? p.fuelState : null;
      }
    }
    return null;
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
   * @param {'air'|'ground'|'ship'|'other'} event.victimUnitCategory
   * @param {number|null} event.carrierDistanceNm
   */
  applyKill(event) {
    this.kills.push({
      victimUnitCategory: event.victimUnitCategory ?? null,
      carrierDistanceNm: typeof event.carrierDistanceNm === 'number' ? event.carrierDistanceNm : null,
    });
  }

  /**
   * Update state from a raw grading event.
   *
   * @param {GradingEvent} event
   */
  applyGrading(event) {
    this.passes.push(event);
  }
}

module.exports = PilotState;
