const Achievement = require('./achievement');

class HeyManNiceShot extends Achievement {
  constructor() {
    super({
      id: 'hey_man_nice_shot',
      name: 'Hey Man, Nice Shot',
      description: 'Kill an enemy fighter after evading one of their missiles.',
      triggerType: 'kill_enrichment',
    });
  }

  evaluate(event, state) {
    if (event.victimUnitCategory !== 'air') return false;
    const victimObjectId = event.victimObjectId ?? null;
    if (victimObjectId == null) return false;
    return state.inboundMissiles.some(
      m => m.status === 'evaded' && m.initiatorObjectId === victimObjectId
    );
  }
}

module.exports = new HeyManNiceShot();
