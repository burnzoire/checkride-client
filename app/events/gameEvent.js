class GameEvent {
  constructor(rawEvent) {
    this.eventType = rawEvent.type;
    this.occurredAt = GameEvent.generateOccurredAt();
  }

  prepare() {
    throw new Error('You have to implement the method toGameEvent!');
  }

  static generateOccurredAt() {
    return new Date().toISOString();
  }
}
module.exports = GameEvent;
