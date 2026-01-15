const GameEvent = require('./gameEvent');

class PilotEvent extends GameEvent {
  constructor(rawEvent) {
    super(rawEvent);
    this.playerUcid = rawEvent.playerUcid;
    this.playerName = rawEvent.playerName;
    this.unitType = rawEvent.unitType;
  }

  prepare() {
    return {
      event: {
        event_type: this.eventType,
        occurred_at: this.occurredAt,
        event_data: {
          player_ucid: this.playerUcid,
          player_name: this.playerName,
          unit_type: this.unitType,
        }
      }
    }
  }
}

module.exports = PilotEvent;
