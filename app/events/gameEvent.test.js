const GameEvent = require('./gameEvent');

describe('GameEvent', () => {
  it('throws an error when prepare is called', () => {
    const event = new GameEvent({ type: 'sampleType' });

    expect(() => event.prepare()).toThrow('You have to implement the method toGameEvent!');
  });

  it('enriches event with tags', () => {
    // Create a mock of TagDictionary
    const mockTagDictionary = {
      getTagsForField: jest.fn().mockReturnValue(['tomcat', 'fighter']),
    };

    // Create a sample event
    const rawEvent = {
      type: 'sampleType',
      unit: 'F-14A',
    };

    const event = new GameEvent(rawEvent, mockTagDictionary);

    // Make assertions
    expect(event.getTagsForField('units', rawEvent.unit)).toEqual(['tomcat', 'fighter']);
    expect(mockTagDictionary.getTagsForField).toHaveBeenCalledWith('units', 'F-14A');
  });
});
