const PilotEvent = require('./pilotEvent');

describe('PilotEvent', () => {

  it('prepares the expected payload', () => {
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
        event_data: {
          player_ucid: "test1",
          player_name: "Test Pilot",
          unit_type: "F-14A",
        }
      }
    });
  });
});
