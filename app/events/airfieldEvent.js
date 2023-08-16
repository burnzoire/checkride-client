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
      event_type: this.eventType,
      event: {
        player_ucid: this.playerUcid,
        player_name: this.playerName,
        unit_type: this.unitType,
        unit_category: this.unitCategory,
        unit_tags: this.tagDictionary.getTagsForField('units', this.unitType),
        airdrome_name: this.airdromeName
      }
    };
  }
}

module.exports = AirfieldEvent;
