const Achievement = require('./achievement');

const MIN_CONTACT_SECONDS = 120;

class PerfectContact extends Achievement {
  constructor() {
    super({
      id: 'perfect_contact',
      name: 'Perfect Contact',
      description: 'Maintain uninterrupted AAR contact for at least 2 minutes.',
      triggerType: 'refuel_enrichment',
      iconHint: 'Refueling probe locked in drogue basket',
      iconDescription: 'A refueling probe perfectly seated in a drogue basket with fuel transfer lines glowing, both aircraft in stable formation.',
    });
  }

  evaluate(_event, state) {
    return state.longestRefuelContactSeconds >= MIN_CONTACT_SECONDS;
  }
}

module.exports = new PerfectContact();
