const GameEvent = require('./gameEvent');
const ConnectEvent = require('./connectEvent');

describe('ConnectEvent', () => {

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prepares the expected payload', () => {
    const occurredAt = '2023-01-01T00:00:00.000Z';
    jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue(occurredAt);

    const rawEvent = {
      type: "connect",
      playerUcid: "test1",
      playerName: "Test Pilot"
    }

    const event = new ConnectEvent(rawEvent);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event: {
        event_type: 'connect',
        occurred_at: occurredAt,
        event_data: {
          player_ucid: "test1",
          player_name: "Test Pilot",
        }
      }
    });
  });
});
