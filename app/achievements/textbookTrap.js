const Achievement = require('./achievement');

/**
 * Textbook Trap — score a perfect LSO Grade (_OK_ 3-wire) on a carrier landing.
 */
class TextbookTrap extends Achievement {
  constructor() {
    super({
      id: 'textbook_trap',
      name: 'Textbook Trap',
      description: 'Score a perfect LSO Grade (_OK_ 3-wire) on a carrier landing.',
      triggerType: 'grading',
      iconHint: 'Aircraft dead-center in the LSO monitor',
      iconDescription: 'A view of the LSO monitor showing an aircraft perfectly centered, indicating a textbook trap with an OK underline grade.',
    });
  }

  evaluate(event, _state) {
    return event.wire === 3 && event.grade === '_OK_';
  }
}

module.exports = new TextbookTrap();
