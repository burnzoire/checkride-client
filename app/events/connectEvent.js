const GameEvent = require('./gameEvent');

class ConnectEvent extends GameEvent {
  constructor(rawEvent, tagDictionary) {
    super(rawEvent, tagDictionary);
    this.playerUcid = rawEvent.playerUcid;
    this.playerName = rawEvent.playerName;
  }

  prepare() {
    return {
      event: {
        event_type: this.eventType,
        event_data: {
          player_ucid: this.playerUcid,
          player_name: this.playerName
        }
      }
    };
  }
}

module.exports = ConnectEvent;
