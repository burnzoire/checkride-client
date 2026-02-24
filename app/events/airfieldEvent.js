const GameEvent = require('./gameEvent.js');

class AirfieldEvent extends GameEvent {
  constructor(rawEvent) {
    super(rawEvent);
    this.playerUcid = rawEvent.playerUcid;
    this.playerName = rawEvent.playerName;
    this.unitType = rawEvent.unitType;
    this.airdromeName = rawEvent.airdromeName;
    this.airdromeTypeName = rawEvent.airdromeTypeName;
    this.airdromeCategory = rawEvent.airdromeCategory;
    this.fuelStateInternal = rawEvent.fuelStateInternal;
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

    if (this.airdromeTypeName != null) {
      eventData.airdrome_type_name = this.airdromeTypeName;
    }

    if (this.airdromeCategory != null) {
      eventData.airdrome_category = this.airdromeCategory;
    }

    if (this.fuelStateInternal != null) {
      eventData.fuel_state_internal = this.fuelStateInternal;
    }

    if (durationSeconds !== null) {
      eventData.duration_seconds = durationSeconds;
    }

    return this.buildEventEnvelope(eventData);
  }
}

module.exports = AirfieldEvent;
