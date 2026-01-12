const GameEvent = require('./gameEvent.js');

class AirfieldEvent extends GameEvent {
  constructor(rawEvent) {
    super(rawEvent);
    this.playerUcid = rawEvent.playerUcid;
    this.playerName = rawEvent.playerName;
    this.unitType = rawEvent.unitType;
    this.airdromeName = rawEvent.airdromeName;
  }

  prepare() {
    return {
      event: {
        event_type: this.eventType,
        event_data: {
          player_ucid: this.playerUcid,
          player_name: this.playerName,
          unit_type: this.unitType,
          airdrome_name: this.airdromeName
        }
      }
    };
  }
}

module.exports = AirfieldEvent;
