/**
 * Base class for all achievements.
 *
 * Each achievement defines:
 *   - id              unique snake_case identifier
 *   - name            human-readable short title
 *   - description     one-sentence description of how to earn it (used in notifications)
 *   - triggerType     event type that triggers evaluation: 'grading' | 'kill_enrichment'
 *                     | 'refuel_enrichment'
 *                     (defaults to 'grading' for backwards compatibility)
 *   - iconHint        brief phrase describing the intended icon concept (for asset generation)
 *   - iconDescription detailed visual description of the icon for image-generation prompts
 *   - evaluate()      returns true when the achievement should unlock
 */
class Achievement {
  constructor({ id, name, description, triggerType = 'grading', iconHint = '', iconDescription = '' }) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.triggerType = triggerType;
    this.iconHint = iconHint;
    this.iconDescription = iconDescription;
  }

  /**
   * Evaluate whether this achievement should unlock.
   * Called AFTER the relevant state apply method (applyGrading, applyKill, etc.)
   * so state reflects the current event.
   *
   * @param {object} event - raw event received from DCS
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

  personalMessage() {
    return `[✓] "${this.name}" — ${this.description}`;
  }
}

module.exports = Achievement;
