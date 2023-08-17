class GameEvent {
  constructor(rawEvent, tagDictionary) {
    this.eventType = rawEvent.type;
    this.tagDictionary = tagDictionary;
  }

  prepare() {
    throw new Error('You have to implement the method toGameEvent!');
  }

  getTagsForField(dictionaryName, value) {
    return this.tagDictionary.getTagsForField(dictionaryName, value);
  }
}
module.exports = GameEvent;
