const log = require('electron-log');
const PilotState = require('./pilotState');
const ALL_ACHIEVEMENTS = require('../achievements');

const AVENGER_TTL_MS = 5 * 60 * 1000;

/**
 * AchievementEngine evaluates all active achievements on every relevant event.
 *
 * - Maintains per-pilot PilotState instances keyed by playerUcid.
 * - Tracks which achievements each pilot has already unlocked this session
 *   so each achievement fires at most once per pilot per session.
 * - Dispatches events by type: each achievement declares a triggerType and is
 *   only evaluated when an event of that type arrives.
 * - State is in-memory only; it resets when the Electron process restarts.
 */
class AchievementEngine {
  /**
   * @param {Achievement[]} [achievements] - list of achievement instances to evaluate,
   *   defaults to ALL_ACHIEVEMENTS. Injected for testing.
   */
  constructor(achievements = ALL_ACHIEVEMENTS) {
    this.achievements = achievements;
    /** @type {Map<string, PilotState>} */
    this.pilotStates = new Map();
    /** @type {Map<string, Set<string>>} */
    this.unlockedByPilot = new Map();
    /** @type {Map<string, string>} */
    this.pilotNames = new Map();
    /** @type {Map<string, number>} killerObjectId → wall-clock ms when they killed a friendly */
    this.recentFriendlyKillers = new Map();
  }

  /**
   * Pre-populate a pilot's unlocked set from the API so already-earned
   * achievements are never re-awarded after a daemon restart.
   * Should be called on connect events. Fire-and-forget from the caller is fine
   * since grading events in practice arrive well after connect.
   *
   * @param {string} ucid
   * @param {APIClient} apiClient
   * @returns {Promise<void>}
   */
  loadAchievementsFromApi(ucid, apiClient) {
    return apiClient.fetchPilotAchievements(ucid)
      .then(({ achievement_ids: ids }) => {
        const unlocked = this._getOrCreateUnlocked(ucid);
        (ids || []).forEach(id => unlocked.add(id));
        log.info(`AchievementEngine: loaded ${unlocked.size} achievement(s) for pilot ${ucid}`);
      });
  }

  /**
   * Evaluate all achievements for a single event.
   * Dispatches to the correct state-apply method based on event type, then
   * evaluates only achievements whose triggerType matches the event type.
   *
   * Supported event types:
   *   - grading            → state.applyGrading()         → triggerType 'grading' achievements
  *   - takeoff            → state.applyTakeoff()         → (state update only)
  *   - landing            → state.applyLanding()         → (state update only)
  *   - crash/eject/pilot_death/disconnect/self_kill → state.applyPilotDown() → (state update only)
   *   - takeoff_enrichment → state.applyTakeoffEnrichment() → (state update only, no achievements yet)
   *   - kill_enrichment    → state.applyKill()             → triggerType 'kill_enrichment' achievements
   *   - refuel_enrichment  → state.applyRefuelEnrichment() → triggerType 'refuel_enrichment' achievements
  *   - shot_enrichment    → state.applyShotEnrichment()   → (state update only)
  *   - hit_enrichment     → state.applyHitEnrichment()    → (state update only)
  *   - weapon_sample_enrichment → state.applyWeaponSampleEnrichment() → (state update only)
   *   - flight_sample_enrichment → state.applyFlightSampleEnrichment() → (state update only)
   *   - change_slot        → state.applyChangeSlot()       → (state update only)
   *
   * Returns an array of newly-unlocked Achievement instances (may be empty).
   *
   * @param {object} event - raw event from DCS
   * @returns {Achievement[]}
   */
  evaluate(event) {
    if (event.type === 'friendly_killed_enrichment') {
      if (event.killerObjectId != null) {
        this.recentFriendlyKillers.set(String(event.killerObjectId), Date.now());
      }
      return [];
    }

    if (event.type === 'kill_enrichment' && event.victimObjectId != null) {
      const killedFriendlyAt = this.recentFriendlyKillers.get(String(event.victimObjectId));
      if (killedFriendlyAt != null && (Date.now() - killedFriendlyAt) <= AVENGER_TTL_MS) {
        event.avengedFriendly = true;
      }
    }

    const DISPATCH = {
      grading:             { ucidField: 'playerUcid', stateMethod: 'applyGrading' },
      takeoff:             { ucidField: 'playerUcid', stateMethod: 'applyTakeoff' },
      landing:             { ucidField: 'playerUcid', stateMethod: 'applyLanding' },
      landing_enrichment:  { ucidField: 'playerUcid', stateMethod: 'applyLandingEnrichment' },
      crash:               { ucidField: 'playerUcid', stateMethod: 'applyPilotDown' },
      eject:               { ucidField: 'playerUcid', stateMethod: 'applyPilotDown' },
      pilot_death:         { ucidField: 'playerUcid', stateMethod: 'applyPilotDown' },
      disconnect:          { ucidField: 'playerUcid', stateMethod: 'applyPilotDown' },
      self_kill:           { ucidField: 'playerUcid', stateMethod: 'applyPilotDown' },
      takeoff_enrichment:  { ucidField: 'playerUcid', stateMethod: 'applyTakeoffEnrichment' },
      kill_enrichment:     { ucidField: 'playerUcid', stateMethod: 'applyKill' },
      refuel_enrichment:   { ucidField: 'playerUcid', stateMethod: 'applyRefuelEnrichment' },
      shot_enrichment:     { ucidField: 'playerUcid', stateMethod: 'applyShotEnrichment' },
      hit_enrichment:      { ucidField: 'playerUcid', stateMethod: 'applyHitEnrichment' },
      weapon_sample_enrichment: { ucidField: 'playerUcid', stateMethod: 'applyWeaponSampleEnrichment' },
      flight_sample_enrichment: { ucidField: 'playerUcid', stateMethod: 'applyFlightSampleEnrichment' },
      change_slot:              { ucidField: 'playerUcid', stateMethod: 'applyChangeSlot' },
      inbound_missile:          { ucidField: 'playerUcid', stateMethod: 'applyInboundMissile' },
      inbound_missile_hit:      { ucidField: 'playerUcid', stateMethod: 'applyInboundMissileHit' },
      gun_burst_start:          { ucidField: 'playerUcid', stateMethod: 'applyGunBurstStart' },
      gun_burst_end:            { ucidField: 'playerUcid', stateMethod: 'applyGunBurstEnd' },
    };

    const dispatch = DISPATCH[event.type];
    if (!dispatch) return [];

    const ucid = event[dispatch.ucidField];
    if (!ucid) return [];

    if (event.playerName) {
      this.pilotNames.set(ucid, event.playerName);
    }

    const state = this._getOrCreateState(ucid);
    state[dispatch.stateMethod](event);

    const unlocked = this._getOrCreateUnlocked(ucid);
    const newlyUnlocked = [];

    for (const achievement of this.achievements) {
      if (unlocked.has(achievement.id)) continue;
      if (achievement.triggerType !== event.type) continue;

      let earned = false;
      try {
        earned = achievement.evaluate(event, state);
      } catch (err) {
        log.error(`AchievementEngine: error evaluating "${achievement.id}":`, err);
      }

      if (earned) {
        unlocked.add(achievement.id);
        newlyUnlocked.push(achievement);
        log.info(`AchievementEngine: "${achievement.id}" unlocked for pilot ${ucid}`);
      }
    }

    return newlyUnlocked;
  }

  buildSnapshot({ pilotUcid, triggerEvent, unlockedAchievements = [] }) {
    if (!pilotUcid) return null;

    const state = this.pilotStates.get(pilotUcid);
    if (!state) return null;

    return {
      pilot_uid: pilotUcid,
      pilot_name: triggerEvent?.playerName || null,
      trigger_event_type: triggerEvent?.type || null,
      trigger_event_at: triggerEvent?.occurredAt || null,
      snapshot_at: new Date().toISOString(),
      unlocked_ids: unlockedAchievements.map((a) => a.id),
      state: this.serializeState(state)
    };
  }

  serializeState(state) {
    const killsAir = state.kills.filter((k) => k.victimUnitCategory === 'air').length;
    const killsGround = state.kills.filter((k) => k.victimUnitCategory === 'ground').length;
    const ARMOUR_ROLES = ['Armour', 'Tanks', 'IFV', 'APC'];
    const armoredKills = state.kills.filter((k) => k.victimUnitCategory === 'ground' && Array.isArray(k.victimRoles) && k.victimRoles.some((r) => ARMOUR_ROLES.includes(r))).length;
    const seadKills = state.kills.filter((k) => k.victimRoles.some((r) => ['SAM SR', 'SAM TR', 'SAM launcher', 'AAA'].includes(r))).length;
    const munitionsInFlight = state.weapons.filter((weaponTrack) => weaponTrack.inFlight === true).length;

    return {
      telemetry: {
        inAir: state.inAir,
        aircraftStatus: state.aircraftStatus,
        takeoffLocation: state.takeoffLocation,
        takeoffFromCarrier: state.launchedFromCarrier,
        speedKts: state.currentSpeedKts,
        currentFuelState: state.currentFuelState,
        speedMach: state.currentSpeedMach,
        altBaroFt: state.currentAltitudeFt,
        altRadarFt: state.currentRadarAltitudeFt,
        positionX: state.currentPositionX,
        positionY: state.currentPositionY,
        payload: state.currentPayload,
      },
      state: {
        passes: state.passes,
        trapCount: state.trapCount,
        nightTrapCount: state.nightTrapCount,
        consecutiveBolters: state.consecutiveBolters,
        prevPassWasBolter: state.prevPassWasBolter,
        fuelAtTrap: state.fuelAtTrap,
        launchedFromCarrier: state.launchedFromCarrier,
        takeoffLocation: state.takeoffLocation,
        lastTakeoffAtMs: state.lastTakeoffAtMs,
        killsGround,
        armoredKills,
        seadKills,
        killsAir,
        killsCount: state.kills.length,
        kills: state.kills,
        lastRefuelDetectedAtMs: state.lastRefuelDetectedAtMs,
        lastRefuelFuelGain: state.lastRefuelFuelGain,
        lastRefuelContactDurationSeconds: state.lastRefuelContactDurationSeconds,
        longestRefuelContactSeconds: state.longestRefuelContactSeconds,
        weapons: state.weapons,
        munitionsInFlight,
        missiles: state.missiles,
        sortieAamFiredCount: state.sortieAamFiredCount,
        longestWeaponHit: state.longestWeaponHit,
        longestMissileHit: state.longestMissileHit,
        inboundMissiles: state.inboundMissiles,
        currentUnitCategory: state.currentUnitCategory,
        hitCounters: state.hitCounters,
        longestGunBurstSeconds: state.longestGunBurstSeconds,
        highestSpeedKts: state.highestSpeedKts,
        highestSpeedMach: state.highestSpeedMach,
        highestAltitudeFt: state.highestAltitudeFt,
        sortieDistanceKm: state.sortieDistanceKm,
        noeDistanceKm: state.noeDistanceKm,
        noeConsecutiveDistanceKm: state.noeConsecutiveDistanceKm,
      },
      gauges: {
        most_ground_kills_in_sortie: killsGround,
        most_armored_kills_in_sortie: armoredKills,
        most_sead_kills_in_sortie: seadKills,
        most_air_kills_in_sortie: killsAir,
        longest_refuel_contact_seconds: state.longestRefuelContactSeconds,
        longest_missile_hit_nm: state.longestMissileHit,
        longest_weapon_hit_nm: state.longestWeaponHit,
        highest_speed_kts: state.highestSpeedKts,
        highest_speed_mach: state.highestSpeedMach,
        highest_altitude_ft: state.highestAltitudeFt,
        longest_gun_burst_seconds: state.longestGunBurstSeconds,
        sortie_distance_km: state.sortieDistanceKm,
        noe_distance_km: state.noeDistanceKm,
        longest_sortie_distance_nm: state.sortieDistanceKm / 1.852,
        longest_noe_distance_nm: state.longestNoeConsecutiveDistanceKm / 1.852,
      },
    };
  }

  getAllPilotSnapshots() {
    const result = [];
    for (const [ucid, state] of this.pilotStates.entries()) {
      result.push({
        ucid,
        name: this.pilotNames.get(ucid) ?? ucid,
        state: this.serializeState(state),
      });
    }
    return result;
  }

  /**
   * Reset session state for a specific pilot (e.g. on slot change / disconnect).
   * @param {string} ucid
   */
  resetPilot(ucid) {
    this.pilotStates.delete(ucid);
    this.unlockedByPilot.delete(ucid);
    this.pilotNames.delete(ucid);
  }

  _getOrCreateState(ucid) {
    if (!this.pilotStates.has(ucid)) {
      this.pilotStates.set(ucid, new PilotState());
    }
    return this.pilotStates.get(ucid);
  }

  _getOrCreateUnlocked(ucid) {
    if (!this.unlockedByPilot.has(ucid)) {
      this.unlockedByPilot.set(ucid, new Set());
    }
    return this.unlockedByPilot.get(ucid);
  }
}

module.exports = AchievementEngine;
