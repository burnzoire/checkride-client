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
});
