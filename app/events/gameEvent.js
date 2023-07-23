class GameEvent {
  constructor(rawEvent) {
    this.eventType = rawEvent.type;
  }

  prepare() {
    throw new Error('You have to implement the method toGameEvent!');
  }
}
export default GameEvent;