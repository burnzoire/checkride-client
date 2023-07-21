import GameEvent from './gameEvent';

export default class ConnectEvent extends GameEvent {
  constructor(rawEvent) {
    super(rawEvent);
    this.playerUcid = rawEvent.playerUcid;
    this.playerName = rawEvent.playerName;
  }

  prepare() {
    return {
      event_type: this.eventType,
      event: {
        player_ucid: this.playerUcid,
        player_name: this.playerName
      }
    };
  }
}
