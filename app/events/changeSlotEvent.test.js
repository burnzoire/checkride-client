const ChangeSlotEvent = require('./changeSlotEvent');

describe('ChangeSlotEvent', () => {

  it('prepares the expected payload', () => {
    const rawEvent = {
      type: "change_slot",
      playerUcid: "test1",
      playerName: "Test Pilot",
      slotId: "1",
      prevSide: "1",
      flyable: true
    }
    const event = new ChangeSlotEvent(rawEvent);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event: {
        event_type: 'change_slot',
        event_data: {
          player_ucid: "test1",
          player_name: "Test Pilot",
          slot_id: "1",
          prev_side: "1",
          flyable: true
        }
      }
    });
  });
});
