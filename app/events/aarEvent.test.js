const GameEvent = require('./gameEvent');
const AAREvent = require('./aarEvent');

describe('AAREvent', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null when fuel gain is missing', () => {
    const occurredAt = '2026-03-07T10:00:00.000Z';
    jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue(occurredAt);

    const event = new AAREvent({
      type: 'aar',
      playerUcid: 'pilot-1',
      occurredAt,
    });

    expect(event.prepare()).toBeNull();
  });

  it('serializes positive fuel gain as event_type aar', () => {
    const occurredAt = '2026-03-07T10:01:10.000Z';
    jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue(occurredAt);

    const event = new AAREvent({
      type: 'aar',
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
      unitType: 'F/A-18C',
      system: 'basket',
      night: true,
      durationSeconds: 65,
      fuelState: 0.72,
      fuelGain: 0.14,
      occurredAt,
      source: 'mission'
    });

    expect(event.prepare()).toEqual({
      event: {
        event_type: 'aar',
        occurred_at: occurredAt,
        source: 'mission',
        event_data: {
          player_ucid: 'pilot-1',
          player_name: 'Maverick',
          unit_type: 'F/A-18C',
          aar_system: 'basket',
          fuel_gain: 0.14,
          night: true,
          duration_seconds: 65,
          fuel_state: 0.72,
        }
      }
    });
  });
});
