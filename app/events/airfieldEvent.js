const GameEvent = require('./gameEvent.js');

class AirfieldEvent extends GameEvent {
  constructor(rawEvent, tagDictionary) {
    super(rawEvent, tagDictionary);
    this.playerUcid = rawEvent.playerUcid;
    this.playerName = rawEvent.playerName;
    this.unitType = rawEvent.unitType;
    this.unitCategory = rawEvent.unitCategory;
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
          unit_category: this.unitCategory,
          airdrome_name: this.airdromeName
        }
      }
    };
  }
}

module.exports = AirfieldEvent;
