jest.mock('uuid', () => {
  const actual = jest.requireActual('uuid');
  const v4 = jest.fn();
  const v5 = actual.v5;
  v5.URL = actual.v5.URL;

  return {
    ...actual,
    v4,
    v5
  };
});

const uuid = require('uuid');
const actualUuid = jest.requireActual('uuid');
const { EventProcessor, stableStringify } = require('./eventProcessor');

const EVENT_NAMESPACE = actualUuid.v5('checkride-client:event', actualUuid.v5.URL);

describe('EventProcessor', () => {
  let processor;

  beforeEach(() => {
    uuid.v4.mockReset();
    processor = new EventProcessor();
  });

  it('generates a stable event_uid and does not mutate the prepared payload', () => {
    const rawEvent = { type: 'takeoff', playerUcid: 'pilot-1' };
    const prepared = { event: { event_type: 'takeoff', event_data: { player_ucid: 'pilot-1' } } };

    const preparedSnapshot = JSON.parse(JSON.stringify(prepared));
    const result = processor.process(rawEvent, prepared);

    expect(result).not.toBe(prepared);
    expect(prepared).toEqual(preparedSnapshot);

    expect(result.event.event_data.flight_uid).toBeUndefined();
    expect(result.event.event_data.killer_flight_uid).toBeUndefined();
    expect(result.event.event_data.victim_flight_uid).toBeUndefined();

    const { event_uid: generatedUid, ...eventWithoutUid } = result.event;
    expect(generatedUid).toBe(actualUuid.v5(stableStringify(eventWithoutUid), EVENT_NAMESPACE));
  });

  it('adds duration_seconds to landing when airborne is tracked', () => {
    const pilotUcid = 'pilot-1';

    processor.process(
      { type: 'change_slot', playerUcid: pilotUcid },
      {
        event: {
          event_type: 'change_slot',
          occurred_at: '2026-01-21T00:00:00.000Z',
          event_data: { player_ucid: pilotUcid, flyable: true }
        }
      }
    );

    processor.process(
      { type: 'takeoff', playerUcid: pilotUcid },
      {
        event: {
          event_type: 'takeoff',
          occurred_at: '2026-01-21T00:01:00.000Z',
          event_data: { player_ucid: pilotUcid, unit_type: 'F-16' }
        }
      }
    );

    const landingResult = processor.process(
      { type: 'landing', playerUcid: pilotUcid },
      {
        event: {
          event_type: 'landing',
          occurred_at: '2026-01-21T00:02:05.000Z',
          event_data: { player_ucid: pilotUcid, unit_type: 'F-16' }
        }
      }
    );

    expect(landingResult.event.event_data.duration_seconds).toBe(65);
  });

  it('adds duration_seconds to landing for air starts using change_slot occurred_at when no takeoff is observed', () => {
    const pilotUcid = 'pilot-airstart';

    processor.process(
      { type: 'change_slot', playerUcid: pilotUcid },
      {
        event: {
          event_type: 'change_slot',
          occurred_at: '2026-01-21T00:00:00.000Z',
          event_data: { player_ucid: pilotUcid, flyable: true }
        }
      }
    );

    const landingResult = processor.process(
      { type: 'landing', playerUcid: pilotUcid },
      {
        event: {
          event_type: 'landing',
          occurred_at: '2026-01-21T00:03:05.000Z',
          event_data: { player_ucid: pilotUcid, unit_type: 'F-16' }
        }
      }
    );

    expect(landingResult.event.event_data.duration_seconds).toBe(185);
  });

  it('clears airborne state on crash so a later landing does not get duration_seconds', () => {
    const pilotUcid = 'pilot-2';

    processor.process(
      { type: 'change_slot', playerUcid: pilotUcid },
      {
        event: {
          event_type: 'change_slot',
          occurred_at: '2026-01-21T00:00:00.000Z',
          event_data: { player_ucid: pilotUcid, flyable: true }
        }
      }
    );

    processor.process(
      { type: 'takeoff', playerUcid: pilotUcid },
      {
        event: {
          event_type: 'takeoff',
          occurred_at: '2026-01-21T00:01:00.000Z',
          event_data: { player_ucid: pilotUcid, unit_type: 'F-16' }
        }
      }
    );

    processor.process(
      { type: 'crash', playerUcid: pilotUcid },
      {
        event: {
          event_type: 'crash',
          occurred_at: '2026-01-21T00:01:10.000Z',
          event_data: { player_ucid: pilotUcid, unit_type: 'F-16' }
        }
      }
    );

    const landingResult = processor.process(
      { type: 'landing', playerUcid: pilotUcid },
      {
        event: {
          event_type: 'landing',
          occurred_at: '2026-01-21T00:02:10.000Z',
          event_data: { player_ucid: pilotUcid, unit_type: 'F-16' }
        }
      }
    );

    expect(landingResult.event.event_data.duration_seconds).toBeUndefined();
  });
});
