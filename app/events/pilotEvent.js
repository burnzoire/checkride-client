const GameEvent = require('./gameEvent');

class PilotEvent extends GameEvent {
  prepare() {
    return {
      event_type: this.eventType,
      event: {
        player_ucid: this.playerUcid,
        player_name: this.playerName,
        unit_type: this.unitType,
        unit_category: this.unitCategory
      }
    }
  }
}

module.exports = PilotEvent;