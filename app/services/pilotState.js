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

const WEAPON_CLASS_AIR_TO_AIR_MISSILE = 'AAM';
const WEAPON_COMPLETED_TTL_MS = 60 * 1000;
const WEAPON_MAX_TRACKS = 100;
const ORDNANCE_LOG_MAX_TRACKS = 500;
const INBOUND_MISSILE_TTL_MS = 60 * 1000;
class PilotState {
  constructor() {
    // ── Session state — survives across sorties ────────────────────────────────
    /** @type {GradingEvent[]} */
    this.passes = [];
    this.currentSlotId = null;
    this.inAir = false;
    /** @type {'ground'|'airborne'|'dead'} */
    this.aircraftStatus = 'ground';

    // ── Sortie state — reset on each takeoff or slot change ────────────────────
    this._resetSortieState();
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
    this.aircraftStatus = 'airborne';
  }

  /**
   * Called when a kill_enrichment event arrives from the mission script.
   * Appends the kill to the kills array for achievement evaluation.
   *
   * @param {object} event - kill_enrichment event
   * @param {'air'|'ground'|'ship'|'other'} event.victimUnitCategory
   * @param {'AIRPLANE'|'HELICOPTER'|null} event.victimAirType - only set when victimUnitCategory is 'air'
   * @param {number|null} event.carrierDistanceNm
   */
  applyKill(event) {
    const victimRoles = Array.isArray(event.victimRoles) ? event.victimRoles : [];
    this.kills.push({
      victimUnitCategory:  event.victimUnitCategory ?? null,
      victimAirType:       event.victimAirType ?? null,
      carrierDistanceNm:   typeof event.carrierDistanceNm === 'number' ? event.carrierDistanceNm : null,
      killedAtMs:          event.killedAtMs ?? null,
      victimRoles,
      weaponGuidance:      event.weaponGuidance ?? null,
      victimPositionX:     event.victimPositionX ?? null,
      victimPositionY:     event.victimPositionY ?? null,
      pilotAltitudeFt:     this.currentAltitudeFt,
      pilotSpeedKts:       this.currentSpeedKts,
      pilotSpeedMach:      this.currentSpeedMach,
      night:               event.night ?? null,
      killerUnitCategory:  event.killerUnitCategory ?? null,
      victimTypeName:      event.victimTypeName ?? null,
      victimObjectId:      event.victimObjectId ?? null,
      weaponClass:         event.weaponClass ?? null,
      avengedFriendly:     event.avengedFriendly === true,
    });

  }

  applyRefuelEnrichment(event) {
    if (event.refuelStatus === 'started') {
      return;
    }

    const occurredAtMs = this._parseMissionTimeMs(event) ?? this._parseOccurredAt(event);
    const fuelGain = this._normalizeFiniteNumber(event.fuelGain ?? event.fuel_gain);
    const durationSeconds = this._normalizeFiniteNumber(
      event.durationSeconds ?? event.duration_seconds ?? event.contactDurationSeconds ?? event.contact_duration_seconds
    );

    if (!(typeof fuelGain === 'number' && Number.isFinite(fuelGain) && fuelGain > 0)) {
      event.persist = false;
      this.lastRefuelFuelGain = null;
      this.lastRefuelContactDurationSeconds = null;
      return;
    }

    this.lastRefuelDetectedAtMs = occurredAtMs;
    this.lastRefuelFuelGain = fuelGain;

    if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)) {
      const normalizedDuration = Math.max(0, durationSeconds);
      this.lastRefuelContactDurationSeconds = normalizedDuration;
      this.longestRefuelContactSeconds = Math.max(this.longestRefuelContactSeconds, normalizedDuration);
    } else {
      this.lastRefuelContactDurationSeconds = null;
    }
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
    const newPosX = typeof positionX === 'number' && Number.isFinite(positionX) ? positionX : null;
    const newPosY = typeof positionY === 'number' && Number.isFinite(positionY) ? positionY : null;
    const radarAltForNoe = typeof altRadarFt === 'number' && Number.isFinite(altRadarFt) ? altRadarFt : null;
    const inAirForNoe = typeof inAir === 'boolean' ? inAir : this.inAir;
    if (inAirForNoe && newPosX !== null && newPosY !== null
        && this.currentPositionX !== null && this.currentPositionY !== null) {
      const dx = newPosX - this.currentPositionX;
      const dy = newPosY - this.currentPositionY;
      const distKm = Math.sqrt(dx * dx + dy * dy) / 1000;
      if (distKm < 5) {
        this.sortieDistanceKm += distKm;
        if (radarAltForNoe !== null && radarAltForNoe <= 100) {
          this.noeDistanceKm += distKm;
          this.noeConsecutiveDistanceKm += distKm;
          if (this.noeConsecutiveDistanceKm > this.longestNoeConsecutiveDistanceKm) {
            this.longestNoeConsecutiveDistanceKm = this.noeConsecutiveDistanceKm;
          }
        } else if (radarAltForNoe !== null && radarAltForNoe > 100) {
          this.noeConsecutiveDistanceKm = 0;
        }
      }
    }

    this.currentPositionX = newPosX !== null ? newPosX : this.currentPositionX;
    this.currentPositionY = newPosY !== null ? newPosY : this.currentPositionY;
    this.currentFuelState = typeof currentFuelState === 'number' && Number.isFinite(currentFuelState)
      ? currentFuelState
      : this.currentFuelState;
    if (typeof inAir === 'boolean') {
      this.inAir = inAir;
      if (this.aircraftStatus !== 'dead') {
        this.aircraftStatus = inAir ? 'airborne' : 'ground';
      }
    }
    if (event.unitCategory != null) this.currentUnitCategory = event.unitCategory;
    const ammoPayload = event.ammoPayload ?? event.ammo_payload;
    if (Array.isArray(ammoPayload)) {
      this.currentPayload = ammoPayload;
    }

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
    weaponTrack.hitOrMiss = null;

    const existingIndex = this.weapons.findIndex((candidate) => candidate.weaponKey === weaponTrack.weaponKey && candidate.inFlight);
    if (existingIndex >= 0) {
      this.weapons[existingIndex] = weaponTrack;
      this._upsertOrdnanceLogEntry(weaponTrack);
      this._pruneCompletedWeapons();
      this._syncMissileView();
      return;
    }

    this.weapons.push(weaponTrack);
    this._upsertOrdnanceLogEntry(weaponTrack);
    if (weaponTrack.weaponClass === WEAPON_CLASS_AIR_TO_AIR_MISSILE) {
      this.sortieAamFiredCount++;
    }
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
      weaponTrack.hitOrMiss = status === 'hit' ? 'hit' : 'miss';
    }

    this._upsertOrdnanceLogEntry(weaponTrack);
    this._pruneCompletedWeapons();
    this._syncMissileView();
  }

  applyHitEnrichment(event = {}) {
    if (event.roleCoalition) {
      this.hitCounters[event.roleCoalition] = (this.hitCounters[event.roleCoalition] ?? 0) + 1;
    }
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

    weaponTrack.inFlight = false;
    weaponTrack.status = event.status ?? 'hit';
    weaponTrack.hitOrMiss = 'hit';
    weaponTrack.targetObjectId = event.targetObjectId ?? event.target_object_id ?? weaponTrack.targetObjectId;
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

    this._upsertOrdnanceLogEntry(weaponTrack);
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
    this.aircraftStatus = 'airborne';
  }

  applyLanding() {
    this.inAir = false;
    this.aircraftStatus = 'ground';
  }

  applyLandingEnrichment(event) {
    const fuelState = this._normalizeFiniteNumber(event.fuelState ?? event.fuel_state);
    this.lastLandingFuelState = fuelState;
    this.lastLandingFriendlyBase = event.landedAtFriendlyBase === true;
  }

  applyPilotDown(event) {
    this.inAir = false;
    const deathTypes = ['crash', 'eject', 'pilot_death', 'self_kill'];
    if (event?.type === 'disconnect') {
      this.aircraftStatus = 'disconnected';
    } else if (event?.type && deathTypes.includes(event.type)) {
      this.aircraftStatus = 'dead';
    } else {
      this.aircraftStatus = 'ground';
    }
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
    this.aircraftStatus = 'ground';

    if (typeof inAir === 'boolean') {
      this.inAir = inAir;
      this.aircraftStatus = inAir ? 'airborne' : 'ground';
      return;
    }

    if (slotChanged) {
      this.inAir = false;
      return;
    }

    if (typeof flyable === 'boolean') {
      this.inAir = flyable;
      this.aircraftStatus = flyable ? 'airborne' : 'ground';
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

  applyInboundMissile(event) {
    const weaponKey = event.weaponKey;
    if (!weaponKey) return;

    this.inboundMissiles.push({
      weaponKey:         String(weaponKey),
      weaponName:        event.weaponName ?? null,
      weaponGuidance:    event.weaponGuidance ?? null,
      initiatorRole:     event.initiatorRole ?? null,
      initiatorObjectId: event.initiatorObjectId ?? null,
      inFlight:          true,
      status:            'in_flight',
      launchedAtMs:      this._parseMissionTimeMs(event) ?? this._parseEventTimeMs(event),
      completedAtMs:     null,
    });
    this._pruneInboundMissiles();
  }

  applyInboundMissileHit(event) {
    const weaponKey = event.weaponKey ? String(event.weaponKey) : null;
    if (!weaponKey) return;
    const track = this.inboundMissiles.find(m => m.weaponKey === weaponKey && m.inFlight);
    if (!track) return;
    track.inFlight = false;
    track.status = 'hit';
    track.completedAtMs = this._parseMissionTimeMs(event) ?? this._parseEventTimeMs(event);
    this._pruneInboundMissiles();
  }

applyGunBurstStart(event) {
    this.gunBurstStartAtMs = event.startAtMs ?? this._parseMissionTimeMs(event);
  }

  applyGunBurstEnd(event) {
    if (this.gunBurstStartAtMs == null) return;
    const endAtMs = event.endAtMs ?? this._parseMissionTimeMs(event);
    if (endAtMs == null) return;
    const durationSeconds = (endAtMs - this.gunBurstStartAtMs) / 1000;
    if (durationSeconds > this.longestGunBurstSeconds) {
      this.longestGunBurstSeconds = durationSeconds;
    }
    this.gunBurstStartAtMs = null;
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

  _normalizeFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  _resetSortieState() {
    this.kills = [];
    this.lastTakeoffAtMs = null;
    this.takeoffLocation = null;
    this.launchedFromCarrier = false;

    this.lastRefuelDetectedAtMs = null;
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
    this.currentPayload = null;

    this.weapons = [];
    this.missiles = [];
    this.ordnanceLog = [];
    this.sortieAamFiredCount = 0;
    this.longestWeaponHit = 0;
    this.longestMissileHit = 0;

    this.inboundMissiles = [];
    this.currentUnitCategory = null;
    this.hitCounters = {};
    this.gunBurstStartAtMs = null;
    this.longestGunBurstSeconds = 0;

    this.sortieDistanceKm = 0;
    this.noeDistanceKm = 0;
    this.noeConsecutiveDistanceKm = 0;
    this.longestNoeConsecutiveDistanceKm = 0;

    this.lastLandingFuelState = null;
    this.lastLandingFriendlyBase = false;
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

  _pruneInboundMissiles() {
    const nowMs = Date.now();
    this.inboundMissiles = this.inboundMissiles.filter(track => {
      if (track.inFlight) return true;
      if (!Number.isFinite(track.completedAtMs)) return false;
      return (nowMs - track.completedAtMs) <= INBOUND_MISSILE_TTL_MS;
    });
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

  _upsertOrdnanceLogEntry(weaponTrack) {
    if (!weaponTrack || !weaponTrack.weaponKey) return;

    const entry = {
      weaponKey: weaponTrack.weaponKey,
      weaponObjectId: weaponTrack.weaponObjectId ?? null,
      startTimeMs: weaponTrack.firedAtMs ?? null,
      endTimeMs: weaponTrack.completedAtMs ?? weaponTrack.hitAtMs ?? null,
      hitOrMiss: weaponTrack.hitOrMiss ?? null,
      targetObjectId: weaponTrack.targetObjectId ?? null,
    };

    const activeByKeyIndex = this.ordnanceLog.findIndex(
      (candidate) => candidate.weaponKey === weaponTrack.weaponKey && candidate.endTimeMs === null
    );
    if (activeByKeyIndex >= 0) {
      this.ordnanceLog[activeByKeyIndex] = {
        ...this.ordnanceLog[activeByKeyIndex],
        ...entry,
      };
      return;
    }

    const activeByObjectIdIndex = entry.weaponObjectId == null
      ? -1
      : this.ordnanceLog.findIndex(
        (candidate) => candidate.weaponObjectId === entry.weaponObjectId && candidate.endTimeMs === null
      );
    if (activeByObjectIdIndex >= 0) {
      this.ordnanceLog[activeByObjectIdIndex] = {
        ...this.ordnanceLog[activeByObjectIdIndex],
        ...entry,
      };
      return;
    }

    this.ordnanceLog.push(entry);
    if (this.ordnanceLog.length > ORDNANCE_LOG_MAX_TRACKS) {
      this.ordnanceLog = this.ordnanceLog.slice(-ORDNANCE_LOG_MAX_TRACKS);
    }
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
      return 'UNKNOWN';
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
      return 'MISSILE';
    }

    if (normalizedName.includes('GBU') || normalizedName.includes('BOMB') || normalizedName.includes('MK-')) {
      return 'BOMB';
    }

    if (normalizedName.includes('ROCKET') || normalizedName.includes('HYDRA')) {
      return 'ROCKET';
    }

    return 'UNKNOWN';
  }
}

module.exports = PilotState;
