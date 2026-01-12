const GameEvent = require('./gameEvent');

describe('GameEvent', () => {
  it('throws an error when prepare is called', () => {
    const event = new GameEvent({ type: 'sampleType' });

    expect(() => event.prepare()).toThrow('You have to implement the method toGameEvent!');
  });
});
