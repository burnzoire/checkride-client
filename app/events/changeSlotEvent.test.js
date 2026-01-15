const GameEvent = require('./gameEvent');
const ChangeSlotEvent = require('./changeSlotEvent');

describe('ChangeSlotEvent', () => {

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prepares the expected payload', () => {
    const occurredAt = '2023-01-01T00:00:00.000Z';
    jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue(occurredAt);

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
        occurred_at: occurredAt,
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
