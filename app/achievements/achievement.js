/**
 * Base class for all achievements.
 *
 * Each achievement defines:
 *   - id              unique snake_case identifier
 *   - name            human-readable short title
 *   - description     one-sentence description of how to earn it (used in notifications)
 *   - iconHint        brief phrase describing the intended icon concept (for asset generation)
 *   - iconDescription detailed visual description of the icon for image-generation prompts
 *   - evaluate()      returns true when the achievement should unlock
 */
class Achievement {
  constructor({ id, name, description, iconHint = '', iconDescription = '' }) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.iconHint = iconHint;
    this.iconDescription = iconDescription;
  }

  /**
   * Evaluate whether this achievement should unlock for the given grading event.
   * Called AFTER PilotState.applyGrading() so trapCount, nightTrapCount, and
   * consecutiveBolters reflect the current pass, while prevLastPassWasBolter
   * still reflects the pass before it.
   *
   * @param {object} event - raw grading event received from DCS
   * @param {PilotState} state - pilot's accumulated session state (post-apply)
   * @returns {boolean}
   */
  evaluate(_event, _state) {
    throw new Error(`Achievement "${this.id}" must implement evaluate(event, state)`);
  }

  /**
   * Build a notification message string for this achievement.
   * @param {string} pilotName
   * @returns {string}
   */
  message(pilotName) {
    return `${pilotName} earned "${this.name}" — ${this.description}`;
  }
}

module.exports = Achievement;
