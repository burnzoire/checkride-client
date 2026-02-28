const log = require('electron-log');
const PilotState = require('./pilotState');
const ALL_ACHIEVEMENTS = require('../achievements');

/**
 * AchievementEngine evaluates all active achievements on every grading event.
 *
 * - Maintains per-pilot PilotState instances keyed by playerUcid.
 * - Tracks which achievements each pilot has already unlocked this session
 *   so each achievement fires at most once per pilot per session.
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
   * Evaluate all achievements for a single grading event.
   * Returns an array of newly-unlocked Achievement instances (may be empty).
   *
   * @param {object} event - raw grading event from DCS
   * @returns {Achievement[]}
   */
  evaluate(event) {
    if (event.type !== 'grading') return [];

    const ucid = event.playerUcid;
    if (!ucid) return [];

    const state = this._getOrCreateState(ucid);
    state.applyGrading(event);

    const unlocked = this._getOrCreateUnlocked(ucid);
    const newlyUnlocked = [];

    for (const achievement of this.achievements) {
      if (unlocked.has(achievement.id)) continue;

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

  /**
   * Reset session state for a specific pilot (e.g. on slot change / disconnect).
   * @param {string} ucid
   */
  resetPilot(ucid) {
    this.pilotStates.delete(ucid);
    this.unlockedByPilot.delete(ucid);
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
