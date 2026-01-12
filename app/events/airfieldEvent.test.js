const AirfieldEvent = require('./airfieldEvent');


describe('AirfieldEvent', () => {

  it('prepares the expected payload', () => {
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
        event_data: {
          player_ucid: "test1",
          player_name: "Test Pilot",
          unit_type: "F-14A",
          airdrome_name: "Test Field"
        }
      }
    });
  });
});
