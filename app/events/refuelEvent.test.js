const GameEvent = require('./gameEvent');
const RefuelEvent = require('./refuelEvent');

describe('RefuelEvent', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null for contact_start (state-only event)', () => {
    const occurredAt = '2026-03-07T10:00:00.000Z';
    jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue(occurredAt);

    const event = new RefuelEvent({
      type: 'refuel_enrichment',
      playerUcid: 'pilot-1',
      contactEvent: 'contact_start',
      occurredAt,
    });

    expect(event.prepare()).toBeNull();
  });

  it('serializes contact_end as event_type aar', () => {
    const occurredAt = '2026-03-07T10:01:10.000Z';
    jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue(occurredAt);

    const event = new RefuelEvent({
      type: 'refuel_enrichment',
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
      unitType: 'F/A-18C',
      contactEvent: 'contact_end',
      system: 'basket',
      night: true,
      contactDurationSeconds: 65,
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
          contact_event: 'contact_end',
          aar_system: 'basket',
          night: true,
          duration_seconds: 65,
          fuel_state: 0.72,
          fuel_gain: 0.14,
        }
      }
    });
  });
});
