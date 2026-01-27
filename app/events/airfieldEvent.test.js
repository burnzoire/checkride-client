const GameEvent = require('./gameEvent');
const AirfieldEvent = require('./airfieldEvent');


describe('AirfieldEvent', () => {

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prepares the expected payload', () => {
    const occurredAt = '2023-01-01T00:00:00.000Z';
    jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue(occurredAt);

    const rawEvent = {
      type: "takeoff",
      playerUcid: "test1",
      playerName: "Test Pilot",
      unitType: "F-14A",
      airdromeName: "Test Field"
    };

    const event = new AirfieldEvent(rawEvent);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event: {
        event_type: 'takeoff',
        occurred_at: occurredAt,
        event_data: {
          player_ucid: "test1",
          player_name: "Test Pilot",
          unit_type: "F-14A",
          airdrome_name: "Test Field"
        }
      }
    });
  });

  it('includes duration_seconds when provided', () => {
    const occurredAt = '2023-01-01T00:00:00.000Z';
    jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue(occurredAt);

    const rawEvent = {
      type: "landing",
      playerUcid: "test2",
      playerName: "Test Pilot 2",
      unitType: "F-18",
      airdromeName: "Test Field",
      durationSeconds: -5.7
    };

    const event = new AirfieldEvent(rawEvent);
    const preparedPayload = event.prepare();

    expect(preparedPayload.event.event_data.duration_seconds).toBe(0);
  });
});
