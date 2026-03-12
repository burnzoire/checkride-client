const GameEvent = require('./gameEvent');

class AAREvent extends GameEvent {
  constructor(rawEvent) {
    super(rawEvent);
    this.playerUcid = rawEvent.playerUcid;
    this.playerName = rawEvent.playerName;
    this.unitType = rawEvent.unitType;
    this.system = rawEvent.system;
    this.night = rawEvent.night;
    this.durationSeconds = rawEvent.durationSeconds ?? rawEvent.duration_seconds ?? rawEvent.contactDurationSeconds ?? rawEvent.contact_duration_seconds;
    this.fuelState = rawEvent.fuelState;
    this.fuelGain = rawEvent.fuelGain ?? rawEvent.fuel_gain;
    this.source = rawEvent.source || 'mission';
  }

  prepare() {
    if (!(typeof this.fuelGain === 'number' && Number.isFinite(this.fuelGain) && this.fuelGain > 0)) {
      return null;
    }

    const eventData = {
      player_ucid: this.playerUcid,
      player_name: this.playerName,
      unit_type: this.unitType,
      aar_system: this.system,
      fuel_gain: this.fuelGain,
    };

    if (typeof this.night === 'boolean') {
      eventData.night = this.night;
    }

    if (typeof this.durationSeconds === 'number' && Number.isFinite(this.durationSeconds)) {
      eventData.duration_seconds = this.durationSeconds;
    }

    if (typeof this.fuelState === 'number' && Number.isFinite(this.fuelState)) {
      eventData.fuel_state = this.fuelState;
    }

    return {
      event: {
        event_type: 'aar',
        occurred_at: this.occurredAt,
        source: this.source,
        event_data: eventData,
      }
    };
  }
}

module.exports = AAREvent;
