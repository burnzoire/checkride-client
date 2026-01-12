const DisconnectEvent = require('./disconnectEvent');

describe('DisconnectEvent', () => {

  it('prepares the expected payload', () => {
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
