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
const METERS_TO_NM = 0.00053995680345572;
const METERS_TO_FEET = 3.2808398950131;

const WEAPON_CLASS_AIR_TO_AIR_MISSILE = 'air_to_air_missile';
const WEAPON_COMPLETED_TTL_MS = 60 * 1000;
const WEAPON_MAX_TRACKS = 100;
const MIN_REFUEL_CONTACT_SECONDS = 5;

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

    this.weapons = [];
    this.missiles = [];
    this.longestWeaponHit = 0;
    this.longestMissileHit = 0;

    this.currentSpeedKts = null;
    this.currentSpeedMach = null;
    this.highestSpeedKts = 0;
    this.highestSpeedMach = 0;
    this.currentAltitudeFt = null;
    this.highestAltitudeFt = 0;
    this.currentRadarAltitudeFt = null;
    this.currentPositionX = null;
    this.currentPositionY = null;
    this.currentFuelState = null;
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
    this._resetSortieState();
    this.launchedFromCarrier = event.launchedFromCarrier === true;
    this.takeoffLocation = event.takeoffLocation ?? null;
    this.lastTakeoffAtMs = this._parseMissionTimeMs(event) ?? this._parseOccurredAt(event);
    this.inAir = true;
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
    const occurredAtMs = this._parseMissionTimeMs(event);

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
      if (durationSeconds < MIN_REFUEL_CONTACT_SECONDS) {
        event.persist = false;
        this.lastRefuelContactDurationSeconds = null;
        this.lastRefuelFuelGain = null;
        this.refuelContactStartedAtMs = null;
        this.refuelStartFuelState = null;
        return;
      }

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
    const speedMach = event.speedMach ?? event.speed_mach;
    const altitude = event.altitudeFt ?? event.altitude_ft;
    const altRadarFt = event.altRadarFt ?? event.alt_radar_ft;
    const positionX = event.positionX ?? event.position_x;
    const positionY = event.positionY ?? event.position_y;
    const currentFuelState = event.currentFuelState ?? event.current_fuel_state ?? event.fuelState ?? event.fuel_state;
    const inAir = event.inAir ?? event.in_air;

    this.currentSpeedKts = typeof speed === 'number' && Number.isFinite(speed) ? speed : this.currentSpeedKts;
    this.currentSpeedMach = typeof speedMach === 'number' && Number.isFinite(speedMach) ? speedMach : this.currentSpeedMach;
    if (typeof this.currentSpeedKts === 'number' && Number.isFinite(this.currentSpeedKts)) {
      this.highestSpeedKts = Math.max(this.highestSpeedKts, this.currentSpeedKts);
    }
    if (typeof this.currentSpeedMach === 'number' && Number.isFinite(this.currentSpeedMach)) {
      this.highestSpeedMach = Math.max(this.highestSpeedMach, this.currentSpeedMach);
    }
    this.currentAltitudeFt = typeof altitude === 'number' && Number.isFinite(altitude) ? altitude : this.currentAltitudeFt;
    if (typeof this.currentAltitudeFt === 'number' && Number.isFinite(this.currentAltitudeFt)) {
      this.highestAltitudeFt = Math.max(this.highestAltitudeFt, this.currentAltitudeFt);
    }
    this.currentRadarAltitudeFt = typeof altRadarFt === 'number' && Number.isFinite(altRadarFt)
      ? altRadarFt
      : this.currentRadarAltitudeFt;
    this.currentPositionX = typeof positionX === 'number' && Number.isFinite(positionX) ? positionX : this.currentPositionX;
    this.currentPositionY = typeof positionY === 'number' && Number.isFinite(positionY) ? positionY : this.currentPositionY;
    this.currentFuelState = typeof currentFuelState === 'number' && Number.isFinite(currentFuelState)
      ? currentFuelState
      : this.currentFuelState;
    this.inAir = typeof inAir === 'boolean' ? inAir : this.inAir;
  }

  applyShotEnrichment(event = {}) {
    const weaponKey = event.weaponKey ?? event.weapon_key;
    if (!weaponKey) return;

    const weaponName = event.weaponName ?? event.weapon_name ?? null;
    const weaponDisplayName = event.weaponDisplayName ?? event.weapon_display_name ?? null;
    const weaponClass = this._normalizeWeaponClass(event.weaponClass ?? event.weapon_class, weaponName);

    const weaponTrack = {
      weaponKey: String(weaponKey),
      weaponClass,
      weaponName,
      weaponDisplayName,
      weaponObjectId: event.weaponObjectId ?? event.weapon_object_id ?? null,
      targetObjectId: event.targetObjectId ?? event.target_object_id ?? null,
      inFlight: true,
      startX: this._normalizeFiniteNumber(event.startX ?? event.start_x),
      startY: this._normalizeFiniteNumber(event.startY ?? event.start_y),
      startAlt: this._normalizeFiniteNumber(event.startAlt ?? event.start_alt),
      hitX: null,
      hitY: null,
      hitAlt: null,
      distanceNm: null,
      heightDeltaFt: null,
      speedKts: this._normalizeFiniteNumber(event.speedKts ?? event.speed_kts),
      speedMach: this._normalizeFiniteNumber(event.speedMach ?? event.speed_mach),
      status: event.status ?? 'in_flight',
      ageSeconds: this._normalizeFiniteNumber(event.ageSeconds ?? event.age_seconds),
      firedAtMs: this._parseEventTimeMs(event),
      hitAtMs: null,
      completedAtMs: null,
      lastSampleAtMs: this._parseEventTimeMs(event),
    };

    const existingIndex = this.weapons.findIndex((candidate) => candidate.weaponKey === weaponTrack.weaponKey && candidate.inFlight);
    if (existingIndex >= 0) {
      this.weapons[existingIndex] = weaponTrack;
      this._pruneCompletedWeapons();
      this._syncMissileView();
      return;
    }

    this.weapons.push(weaponTrack);
    if (this.weapons.length > WEAPON_MAX_TRACKS) {
      this.weapons = this.weapons.slice(-WEAPON_MAX_TRACKS);
    }

    this._pruneCompletedWeapons();
    this._syncMissileView();
  }

  applyWeaponSampleEnrichment(event = {}) {
    const weaponKey = event.weaponKey ?? event.weapon_key;
    const weaponObjectId = event.weaponObjectId ?? event.weapon_object_id;

    let weaponTrack = null;

    if (weaponKey) {
      weaponTrack = this.weapons.find((candidate) => candidate.weaponKey === String(weaponKey)) || null;
    }

    if (!weaponTrack && weaponObjectId != null) {
      weaponTrack = this.weapons.find((candidate) => candidate.weaponObjectId === weaponObjectId) || null;
    }

    if (!weaponTrack) {
      if (!weaponKey) return;

      this.applyShotEnrichment(event);
      weaponTrack = this.weapons.find((candidate) => candidate.weaponKey === String(weaponKey)) || null;
      if (!weaponTrack) return;
    }

    const status = event.status ?? weaponTrack.status ?? null;
    const inFlight = event.inFlight ?? event.in_flight;

    weaponTrack.status = status;
    if (typeof inFlight === 'boolean') {
      weaponTrack.inFlight = inFlight;
    }

    weaponTrack.speedKts = this._normalizeFiniteNumber(event.speedKts ?? event.speed_kts) ?? weaponTrack.speedKts;
    weaponTrack.speedMach = this._normalizeFiniteNumber(event.speedMach ?? event.speed_mach) ?? weaponTrack.speedMach;
    weaponTrack.weaponDisplayName = event.weaponDisplayName ?? event.weapon_display_name ?? weaponTrack.weaponDisplayName;
    weaponTrack.hitX = this._normalizeFiniteNumber(event.positionX ?? event.position_x) ?? weaponTrack.hitX;
    weaponTrack.hitY = this._normalizeFiniteNumber(event.positionY ?? event.position_y) ?? weaponTrack.hitY;
    weaponTrack.hitAlt = this._normalizeFiniteNumber(event.altitudeFt ?? event.altitude_ft) ?? weaponTrack.hitAlt;
    weaponTrack.ageSeconds = this._normalizeFiniteNumber(event.ageSeconds ?? event.age_seconds) ?? weaponTrack.ageSeconds;
    weaponTrack.lastSampleAtMs = this._parseEventTimeMs(event);

    if (weaponTrack.inFlight === false || status === 'expired' || status === 'hit') {
      weaponTrack.completedAtMs = weaponTrack.lastSampleAtMs;
    }

    this._pruneCompletedWeapons();
    this._syncMissileView();
  }

  applyHitEnrichment(event = {}) {
    const weaponKey = event.weaponKey ?? event.weapon_key;
    const targetObjectId = event.targetObjectId ?? event.target_object_id;
    const weaponObjectId = event.weaponObjectId ?? event.weapon_object_id;

    let candidates = this.weapons.filter((candidate) => candidate.inFlight);

    if (targetObjectId != null) {
      candidates = candidates.filter((candidate) => candidate.targetObjectId === targetObjectId);
    } else if (weaponKey) {
      candidates = candidates.filter((candidate) => candidate.weaponKey === String(weaponKey));
    } else if (weaponObjectId != null) {
      candidates = candidates.filter((candidate) => candidate.weaponObjectId === weaponObjectId);
    } else {
      candidates = candidates.filter((candidate) => candidate.weaponClass !== WEAPON_CLASS_AIR_TO_AIR_MISSILE);
    }

    if (weaponKey && targetObjectId != null) {
      candidates = candidates.filter((candidate) => candidate.weaponKey === String(weaponKey));
    }

    if (weaponObjectId != null && candidates.length === 0) {
      candidates = this.weapons.filter((candidate) => candidate.inFlight && candidate.weaponObjectId === weaponObjectId);
    }

    if (candidates.length === 0) {
      return;
    }

    const weaponTrack = candidates[candidates.length - 1];
    if (!weaponTrack) {
      return;
    }

    weaponTrack.inFlight = false;
    weaponTrack.status = event.status ?? 'hit';
    weaponTrack.hitX = this._normalizeFiniteNumber(event.hitX ?? event.hit_x);
    weaponTrack.hitY = this._normalizeFiniteNumber(event.hitY ?? event.hit_y);
    weaponTrack.hitAlt = this._normalizeFiniteNumber(event.hitAlt ?? event.hit_alt);
    weaponTrack.hitAtMs = this._parseEventTimeMs(event);
    weaponTrack.completedAtMs = weaponTrack.hitAtMs;
    weaponTrack.lastSampleAtMs = weaponTrack.hitAtMs;
    weaponTrack.weaponDisplayName = event.weaponDisplayName ?? event.weapon_display_name ?? weaponTrack.weaponDisplayName;

    const eventDistanceNm = this._normalizeFiniteNumber(event.distanceNm ?? event.distance_nm);
    const eventHeightDeltaFt = this._normalizeFiniteNumber(event.heightDeltaFt ?? event.height_delta_ft);

    if (eventDistanceNm !== null) {
      weaponTrack.distanceNm = eventDistanceNm;
    } else {
      const computedDistanceNm = this._computeMissileDistanceNm(weaponTrack);
      weaponTrack.distanceNm = computedDistanceNm;
    }

    if (eventHeightDeltaFt !== null) {
      weaponTrack.heightDeltaFt = eventHeightDeltaFt;
    } else {
      const computedHeightDeltaFt = this._computeMissileHeightDeltaFt(weaponTrack);
      weaponTrack.heightDeltaFt = computedHeightDeltaFt;
    }

    if (typeof weaponTrack.distanceNm === 'number' && Number.isFinite(weaponTrack.distanceNm)) {
      this.longestWeaponHit = Math.max(this.longestWeaponHit, weaponTrack.distanceNm);
      if (weaponTrack.weaponClass === WEAPON_CLASS_AIR_TO_AIR_MISSILE) {
        this.longestMissileHit = Math.max(this.longestMissileHit, weaponTrack.distanceNm);
      }
    }

    this._pruneCompletedWeapons();
    this._syncMissileView();
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

    this._resetSortieState();
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

  _parseMissionTimeMs(event) {
    const missionTime = event?.missionTime ?? event?.mission_time ?? event?.time;
    if (typeof missionTime === 'number' && Number.isFinite(missionTime)) {
      return missionTime * 1000;
    }

    return null;
  }

  _parseEventTimeMs(event) {
    return this._parseOccurredAt(event) ?? Date.now();
  }

  _normalizeFuelState(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  _normalizeFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  _resetSortieState() {
    this.kills = [];
    this.lastTakeoffAtMs = null;
    this.takeoffLocation = null;
    this.launchedFromCarrier = false;

    this.refuelContactStartedAtMs = null;
    this.refuelStartFuelState = null;
    this.lastRefuelFuelGain = null;
    this.lastRefuelContactDurationSeconds = null;
    this.longestRefuelContactSeconds = 0;

    this.currentSpeedKts = null;
    this.currentSpeedMach = null;
    this.highestSpeedKts = 0;
    this.highestSpeedMach = 0;
    this.currentAltitudeFt = null;
    this.highestAltitudeFt = 0;
    this.currentRadarAltitudeFt = null;
    this.currentPositionX = null;
    this.currentPositionY = null;
    this.currentFuelState = null;

    this.weapons = [];
    this.missiles = [];
    this.longestWeaponHit = 0;
    this.longestMissileHit = 0;
  }

  _computeMissileDistanceNm(missile) {
    if (
      typeof missile.startX !== 'number' ||
      typeof missile.startY !== 'number' ||
      typeof missile.hitX !== 'number' ||
      typeof missile.hitY !== 'number'
    ) {
      return null;
    }

    const dx = missile.hitX - missile.startX;
    const dy = missile.hitY - missile.startY;
    const distanceMeters = Math.sqrt((dx * dx) + (dy * dy));
    return distanceMeters * METERS_TO_NM;
  }

  _computeMissileHeightDeltaFt(missile) {
    if (typeof missile.startAlt !== 'number' || typeof missile.hitAlt !== 'number') {
      return null;
    }

    return (missile.hitAlt - missile.startAlt) * METERS_TO_FEET;
  }

  _syncMissileView() {
    this.missiles = this.weapons.filter((weaponTrack) => weaponTrack.weaponClass === WEAPON_CLASS_AIR_TO_AIR_MISSILE);
  }

  _pruneCompletedWeapons() {
    const nowMs = Date.now();
    this.weapons = this.weapons.filter((weaponTrack) => {
      if (weaponTrack.inFlight) return true;
      const completedAtMs = weaponTrack.completedAtMs ?? weaponTrack.hitAtMs ?? weaponTrack.lastSampleAtMs;
      if (!Number.isFinite(completedAtMs)) return false;
      return (nowMs - completedAtMs) <= WEAPON_COMPLETED_TTL_MS;
    });
  }

  _normalizeWeaponClass(weaponClass, weaponName) {
    if (typeof weaponClass === 'string' && weaponClass.length > 0) {
      return weaponClass;
    }

    return this._inferWeaponClassFromName(weaponName);
  }

  _inferWeaponClassFromName(weaponName) {
    const normalizedName = typeof weaponName === 'string' ? weaponName.toUpperCase() : '';
    if (!normalizedName) {
      return 'unknown';
    }

    if (
      normalizedName.includes('AIM-') ||
      normalizedName.includes('AIM_') ||
      normalizedName.includes('AMRAAM') ||
      normalizedName.includes('PHOENIX') ||
      normalizedName.includes('SIDEWINDER') ||
      /^R[-_]\d/.test(normalizedName)
    ) {
      return WEAPON_CLASS_AIR_TO_AIR_MISSILE;
    }

    if (normalizedName.includes('AGM') || normalizedName.includes('MAVERICK')) {
      return 'air_to_ground_missile';
    }

    if (normalizedName.includes('GBU') || normalizedName.includes('BOMB') || normalizedName.includes('MK-')) {
      return 'bomb';
    }

    if (normalizedName.includes('ROCKET') || normalizedName.includes('HYDRA')) {
      return 'rocket';
    }

    return 'other';
  }
}

module.exports = PilotState;
