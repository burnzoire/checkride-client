const GameEvent = require('./gameEvent');
const PilotEvent = require('./pilotEvent');

describe('PilotEvent', () => {

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prepares the expected payload', () => {
    const occurredAt = '2023-01-01T00:00:00.000Z';
    jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue(occurredAt);

    const rawEvent = {
      type: "crash",
      playerUcid: "test1",
      playerName: "Test Pilot",
      unitType: "F-14A",
    };

    const event = new PilotEvent(rawEvent);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event: {
        event_type: 'crash',
        occurred_at: occurredAt,
        event_data: {
          player_ucid: "test1",
          player_name: "Test Pilot",
          unit_type: "F-14A",
        }
      }
    });
  });
});
