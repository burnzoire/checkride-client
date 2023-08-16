const GameEvent = require('./gameEvent');

class ChangeSlotEvent extends GameEvent {
  constructor(rawEvent, tagDictionary) {
    super(rawEvent, tagDictionary);
    this.playerUcid = rawEvent.playerUcid;
    this.playerName = rawEvent.playerName;
    this.slotId = rawEvent.slotId;
    this.prevSide = rawEvent.prevSide;
  }

  prepare() {
    return {
      event_type: this.eventType,
      event: {
        player_ucid: this.playerUcid,
        player_name: this.playerName,
        slot_id: this.slotId,
        prev_side: this.prevSide
      }
    };
  }
}

module.exports = ChangeSlotEvent;
