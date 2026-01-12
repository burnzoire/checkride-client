const ConnectEvent = require('./connectEvent');

describe('ConnectEvent', () => {

  it('prepares the expected payload', () => {
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
        event_data: {
          player_ucid: "test1",
          player_name: "Test Pilot",
        }
      }
    });
  });
});
