const GameEvent = require('./gameEvent');

class AAREvent extends GameEvent {
  constructor(rawEvent) {
    super(rawEvent);
    this.playerUcid = rawEvent.playerUcid;
    this.playerName = rawEvent.playerName;
    this.unitType = rawEvent.unitType;
    this.system = rawEvent.system;
    this.night = rawEvent.night;
    this.contactEvent = rawEvent.contactEvent ?? rawEvent.contact_event ?? rawEvent.contact;
    this.contactDurationSeconds = rawEvent.contactDurationSeconds ?? rawEvent.contact_duration_seconds;
    this.fuelState = rawEvent.fuelState;
    this.fuelGain = rawEvent.fuelGain ?? rawEvent.fuel_gain;
    this.source = rawEvent.source || 'mission';
  }

  prepare() {
    if (this.contactEvent !== 'contact_end') {
      return null;
    }

    const eventData = {
      player_ucid: this.playerUcid,
      player_name: this.playerName,
      unit_type: this.unitType,
      contact_event: this.contactEvent,
      aar_system: this.system,
    };

    if (typeof this.night === 'boolean') {
      eventData.night = this.night;
    }

    if (typeof this.contactDurationSeconds === 'number' && Number.isFinite(this.contactDurationSeconds)) {
      eventData.duration_seconds = this.contactDurationSeconds;
    }

    if (typeof this.fuelState === 'number' && Number.isFinite(this.fuelState)) {
      eventData.fuel_state = this.fuelState;
    }

    if (typeof this.fuelGain === 'number' && Number.isFinite(this.fuelGain)) {
      eventData.fuel_gain = this.fuelGain;
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
