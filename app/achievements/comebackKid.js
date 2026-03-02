const Achievement = require('./achievement');

/**
 * Comeback Kid — successfully trap after a previous bolter.
 * Checks the pre-update snapshot so we know the last pass was a bolter,
 * then confirms the current pass resulted in a trap (not another bolter/WO).
 */
class ComebackKid extends Achievement {
  constructor() {
    super({
      id: 'comeback_kid',
      name: 'Comeback Kid',
      description: 'Trap on your very next pass after a bolter.',
      triggerType: 'grading',
      iconHint: 'Fighter jet going around then returning to land',
      iconDescription: 'A fighter at full burner clawing away from the deck on a bolter, with a second silhouette of the same aircraft on final approach behind it.',

    });
  }

  evaluate(event, state) {
    const isTrap = event.lsoGrade !== 'B' && Number.isFinite(event.wire);
    return state.prevPassWasBolter && isTrap;
  }
}

module.exports = new ComebackKid();
