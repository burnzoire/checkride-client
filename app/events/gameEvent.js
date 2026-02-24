class GameEvent {
  constructor(rawEvent) {
    this.eventType = rawEvent.type;
    this.occurredAt = GameEvent.extractOccurredAt(rawEvent) || GameEvent.generateOccurredAt();
    this.missionScriptingAvailable = rawEvent.missionScriptingAvailable === true;
  }

  prepare() {
    throw new Error('You have to implement the method toGameEvent!');
  }

  buildEventEnvelope(eventData) {
    return {
      event: {
        event_type: this.eventType,
        occurred_at: this.occurredAt,
        mission_scripting_available: this.missionScriptingAvailable,
        event_data: eventData
      }
    };
  }

  static generateOccurredAt() {
    return new Date().toISOString();
  }

  static extractOccurredAt(rawEvent) {
    if (!rawEvent || typeof rawEvent !== 'object') {
      return null;
    }

    const candidate = rawEvent.occurredAt || rawEvent.occurred_at;
    if (!candidate || typeof candidate !== 'string') {
      return null;
    }

    const ms = Date.parse(candidate);
    if (!Number.isFinite(ms)) {
      return null;
    }

    return new Date(ms).toISOString();
  }
}
module.exports = GameEvent;
