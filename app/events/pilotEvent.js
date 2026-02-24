const GameEvent = require('./gameEvent');

class PilotEvent extends GameEvent {
  constructor(rawEvent) {
    super(rawEvent);
    this.playerUcid = rawEvent.playerUcid;
    this.playerName = rawEvent.playerName;
    this.unitType = rawEvent.unitType;
  }

  prepare() {
    return this.buildEventEnvelope({
      player_ucid: this.playerUcid,
      player_name: this.playerName,
      unit_type: this.unitType,
    });
  }
}

module.exports = PilotEvent;
