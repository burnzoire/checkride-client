const GameEvent = require('./gameEvent');
const DisconnectEvent = require('./disconnectEvent');

describe('DisconnectEvent', () => {

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prepares the expected payload', () => {
    const occurredAt = '2023-01-01T00:00:00.000Z';
    jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue(occurredAt);

    const rawEvent = {
      type: "disconnect",
      playerUcid: "test1",
      playerName: "Test Pilot",
      playerSide: "1",
      reasonCode: "1"
    }

    const event = new DisconnectEvent(rawEvent);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event: {
        event_type: 'disconnect',
        occurred_at: occurredAt,
        event_data: {
          player_ucid: "test1",
          player_name: "Test Pilot",
          player_side: "1",
          reason_code: "1"
        }
      }
    });
  });
});
