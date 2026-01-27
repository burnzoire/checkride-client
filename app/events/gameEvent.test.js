const GameEvent = require('./gameEvent');

describe('GameEvent', () => {
  it('throws an error when prepare is called', () => {
    const event = new GameEvent({ type: 'sampleType' });

    expect(() => event.prepare()).toThrow('You have to implement the method toGameEvent!');
  });

  it('extracts occurredAt from occurredAt string', () => {
    const rawEvent = { type: 'sample', occurredAt: '2026-01-28T10:00:00.000Z' };
    const occurredAt = GameEvent.extractOccurredAt(rawEvent);

    expect(occurredAt).toBe('2026-01-28T10:00:00.000Z');
  });

  it('extracts occurredAt from occurred_at string', () => {
    const rawEvent = { type: 'sample', occurred_at: '2026-01-28T11:00:00.000Z' };
    const occurredAt = GameEvent.extractOccurredAt(rawEvent);

    expect(occurredAt).toBe('2026-01-28T11:00:00.000Z');
  });

  it('returns null for invalid occurredAt values', () => {
    expect(GameEvent.extractOccurredAt(null)).toBeNull();
    expect(GameEvent.extractOccurredAt({})).toBeNull();
    expect(GameEvent.extractOccurredAt({ occurredAt: 123 })).toBeNull();
    expect(GameEvent.extractOccurredAt({ occurredAt: 'not-a-date' })).toBeNull();
  });

  it('uses generated occurredAt when missing from raw event', () => {
    const generateSpy = jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue('2026-01-28T12:00:00.000Z');

    const event = new GameEvent({ type: 'sampleType' });

    expect(event.occurredAt).toBe('2026-01-28T12:00:00.000Z');
    expect(generateSpy).toHaveBeenCalled();

    generateSpy.mockRestore();
  });
});
