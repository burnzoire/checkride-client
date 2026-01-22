const GameEvent = require('./gameEvent.js');

class AirfieldEvent extends GameEvent {
  constructor(rawEvent) {
    super(rawEvent);
    this.playerUcid = rawEvent.playerUcid;
    this.playerName = rawEvent.playerName;
    this.unitType = rawEvent.unitType;
    this.airdromeName = rawEvent.airdromeName;
    this.durationSeconds = rawEvent.durationSeconds;
  }

  prepare() {
    const durationSeconds = Number.isFinite(this.durationSeconds) ? Math.max(0, Math.floor(this.durationSeconds)) : null;

    const eventData = {
      player_ucid: this.playerUcid,
      player_name: this.playerName,
      unit_type: this.unitType,
      airdrome_name: this.airdromeName
    };

    if (durationSeconds !== null) {
      eventData.duration_seconds = durationSeconds;
    }

    return {
      event: {
        event_type: this.eventType,
        occurred_at: this.occurredAt,
        event_data: eventData
      }
    };
  }
}

module.exports = AirfieldEvent;
