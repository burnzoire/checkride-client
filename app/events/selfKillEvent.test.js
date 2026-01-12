const SelfKillEvent = require('./selfKillEvent');

describe('SelfKillEvent', () => {

  it('prepares the expected payload', () => {
    const rawEvent = {
      type: "crash",
      playerUcid: "test1",
      playerName: "Test Pilot",
    };

    const event = new SelfKillEvent(rawEvent);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event: {
        event_type: 'crash',
        event_data: {
          player_ucid: "test1",
          player_name: "Test Pilot",
        }
      }
    });
  });
});
