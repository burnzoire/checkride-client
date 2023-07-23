import GameEvent from './gameEvent.js';

export default class AirfieldEvent extends GameEvent {
  constructor(rawEvent) {
    super(rawEvent);
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
        airdrome_name: this.airdromeName
      }
    };
  }
}
