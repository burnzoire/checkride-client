class GameEvent {
  constructor(rawEvent) {
    this.eventType = rawEvent.type;
    this.occurredAt = GameEvent.extractOccurredAt(rawEvent) || GameEvent.generateOccurredAt();
  }

  prepare() {
    throw new Error('You have to implement the method toGameEvent!');
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
