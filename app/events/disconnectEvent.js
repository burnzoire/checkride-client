import GameEvent from './gameEvent';

class DisconnectEvent extends GameEvent {
  constructor(rawEvent) {
    super(rawEvent);
    this.playerUcid = rawEvent.playerUcid;
    this.playerName = rawEvent.playerName;
    this.playerSide = rawEvent.playerSide;
    this.reasonCode = rawEvent.reasonCode;
  }

  prepare() {
    return {
      event_type: this.eventType,
      event: {
        player_ucid: this.playerUcid,
        player_name: this.playerName,
        player_side: this.playerSide,
        reason_code: this.reasonCode
      }
    };
  }
}

export default DisconnectEvent