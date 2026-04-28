const Achievement = require('./achievement');

// Gun shells (SHELL = 0) don't count as ordnance for Winchester purposes.
// Any remaining item with a non-zero category means missiles/bombs/rockets remain.
function isWinchester(payload) {
  if (!Array.isArray(payload)) return false;
  return payload.every(item => item.category === 0);
}

class Winchester extends Achievement {
  constructor() {
    super({
      id: 'winchester',
      name: 'Winchester',
      description: 'Land with no munitions left after scoring at least one kill.',
      triggerType: 'landing',
    });
  }

  evaluate(_event, state) {
    if (state.kills.length === 0) return false;
    return isWinchester(state.currentPayload);
  }
}

module.exports = new Winchester();
