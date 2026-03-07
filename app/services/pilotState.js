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
    this.lastTakeoffAtMs = null;

    this.refuelContactStartedAtMs = null;
    this.refuelStartFuelState = null;
    this.lastRefuelFuelGain = null;
    this.lastRefuelContactDurationSeconds = null;
    this.longestRefuelContactSeconds = 0;

    this.currentSpeedKts = null;
    this.currentAltitudeFt = null;
    this.inAir = false;
    this.currentSlotId = null;
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
    this.lastTakeoffAtMs = this._parseOccurredAt(event);
    this.inAir = true;

    this.refuelContactStartedAtMs = null;
    this.refuelStartFuelState = null;
    this.lastRefuelFuelGain = null;
    this.lastRefuelContactDurationSeconds = null;
    this.currentSpeedKts = null;
    this.currentAltitudeFt = null;
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

  applyRefuelEnrichment(event) {
    const contactEvent = event.contactEvent ?? event.contact_event ?? event.contact ?? null;
    const occurredAtMs = this._parseOccurredAt(event);

    if (contactEvent === 'contact_start') {
      this.refuelContactStartedAtMs = occurredAtMs;
      this.refuelStartFuelState = this._normalizeFuelState(event.fuelState);
      this.lastRefuelFuelGain = null;
      this.lastRefuelContactDurationSeconds = null;
      return;
    }

    if (contactEvent !== 'contact_end') {
      return;
    }

    const endFuelState = this._normalizeFuelState(event.fuelState);

    if (this.refuelContactStartedAtMs !== null && occurredAtMs !== null) {
      const durationSeconds = Math.max(0, (occurredAtMs - this.refuelContactStartedAtMs) / 1000);
      this.lastRefuelContactDurationSeconds = durationSeconds;
      this.longestRefuelContactSeconds = Math.max(this.longestRefuelContactSeconds, durationSeconds);
    } else {
      this.lastRefuelContactDurationSeconds = null;
    }

    if (this.refuelStartFuelState !== null && endFuelState !== null) {
      this.lastRefuelFuelGain = Math.max(0, endFuelState - this.refuelStartFuelState);
    } else {
      this.lastRefuelFuelGain = null;
    }

    this.refuelContactStartedAtMs = null;
    this.refuelStartFuelState = null;
  }

  applyFlightSampleEnrichment(event) {
    const speed = event.speedKts ?? event.speed_kts;
    const altitude = event.altitudeFt ?? event.altitude_ft;
    const inAir = event.inAir ?? event.in_air;

    this.currentSpeedKts = typeof speed === 'number' && Number.isFinite(speed) ? speed : this.currentSpeedKts;
    this.currentAltitudeFt = typeof altitude === 'number' && Number.isFinite(altitude) ? altitude : this.currentAltitudeFt;
    this.inAir = typeof inAir === 'boolean' ? inAir : this.inAir;
  }

  applyTakeoff(event) {
    const takeoffLocation = event?.airdromeName ?? event?.airdrome_name;

    this.lastTakeoffAtMs = this._parseOccurredAt(event) ?? this.lastTakeoffAtMs;
    if (typeof takeoffLocation === 'string' && takeoffLocation.length > 0) {
      this.takeoffLocation = takeoffLocation;
      this.launchedFromCarrier = false;
    }
    this.inAir = true;
  }

  applyLanding() {
    this.inAir = false;
  }

  applyPilotDown() {
    this.inAir = false;
  }

  applyChangeSlot(event = {}) {
    const inAir = event.inAir ?? event.in_air;
    const flyable = event.flyable;
    const nextSlotId = event.slotId ?? event.slot_id ?? null;
    const previousSlotId = this.currentSlotId;
    const slotChanged =
      previousSlotId !== null &&
      nextSlotId !== null &&
      String(previousSlotId) !== String(nextSlotId);

    this.kills = [];
    this.lastTakeoffAtMs = null;
    this.takeoffLocation = null;
    this.launchedFromCarrier = false;
    this.refuelContactStartedAtMs = null;
    this.refuelStartFuelState = null;
    this.lastRefuelFuelGain = null;
    this.lastRefuelContactDurationSeconds = null;
    this.currentSpeedKts = null;
    this.currentAltitudeFt = null;
    this.currentSlotId = nextSlotId;

    if (typeof inAir === 'boolean') {
      this.inAir = inAir;
      return;
    }

    if (slotChanged) {
      this.inAir = false;
      return;
    }

    if (typeof flyable === 'boolean') {
      this.inAir = flyable;
      return;
    }

    this.inAir = false;
  }

  /**
   * Update state from a raw grading event.
   *
   * @param {GradingEvent} event
   */
  applyGrading(event) {
    this.passes.push(event);
  }

  _parseOccurredAt(event) {
    const candidate = event.occurredAt ?? event.occurred_at;
    if (typeof candidate !== 'string') return null;

    const ms = Date.parse(candidate);
    return Number.isFinite(ms) ? ms : null;
  }

  _normalizeFuelState(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
}

module.exports = PilotState;
