const GameEvent = require('./gameEvent');
const GradingEvent = require('./gradingEvent');


describe('GradingEvent', () => {

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prepares the expected payload', () => {
    const occurredAt = '2023-01-01T00:00:00.000Z';
    jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue(occurredAt);

    const rawEvent = {
      type: 'grading',
      playerName: 'Maverick',
      unitType: 'FA-18C_hornet',
      lsoGrade: '_OK_',
      wire: 3,
      night: false,
      gradingRaw: 'LSO: GRADE:_OK_ :WOP TLU(AFU)IM BC WIRE# 3',
      carrierName: 'CVN-74 John C. Stennis',
      source: 'mission'
    };

    const event = new GradingEvent(rawEvent);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event: {
        event_type: 'grading',
        occurred_at: occurredAt,
        source: 'mission',
        event_data: {
          player_name: 'Maverick',
          unit_type: 'FA-18C_hornet',
          lso_grade: '_OK_',
          wire: 3,
          night: false,
          grading_raw: 'LSO: GRADE:_OK_ :WOP TLU(AFU)IM BC WIRE# 3',
          airdrome_name: 'CVN-74 John C. Stennis'
        }
      }
    });
  });

  it('defaults source to mission', () => {
    const occurredAt = '2023-01-01T00:00:00.000Z';
    jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue(occurredAt);

    const rawEvent = {
      type: 'grading',
      playerName: 'Goose',
      unitType: 'F-14B',
      lsoGrade: 'OK',
      wire: 2,
      night: false,
      gradingRaw: 'LSO: GRADE:OK :WIRE# 2',
      carrierName: 'CVN-71 Theodore Roosevelt'
    };

    const event = new GradingEvent(rawEvent);
    const preparedPayload = event.prepare();

    expect(preparedPayload.event.source).toBe('mission');
  });

  it('omits wire when not a finite number', () => {
    const occurredAt = '2023-01-01T00:00:00.000Z';
    jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue(occurredAt);

    const rawEvent = {
      type: 'grading',
      playerName: 'Maverick',
      unitType: 'FA-18C_hornet',
      lsoGrade: 'B',
      wire: null,
      night: true,
      gradingRaw: 'LSO: GRADE:BOLTER :FLY THROUGH',
      carrierName: 'CVN-74 John C. Stennis',
      source: 'mission'
    };

    const event = new GradingEvent(rawEvent);
    const preparedPayload = event.prepare();

    expect(preparedPayload.event.event_data.wire).toBeUndefined();
    expect(preparedPayload.event.event_data.night).toBe(true);
  });

  it('omits night when not a boolean', () => {
    const occurredAt = '2023-01-01T00:00:00.000Z';
    jest.spyOn(GameEvent, 'generateOccurredAt').mockReturnValue(occurredAt);

    const rawEvent = {
      type: 'grading',
      playerName: 'Maverick',
      unitType: 'FA-18C_hornet',
      lsoGrade: 'OK',
      wire: 3,
      gradingRaw: 'LSO: GRADE:OK :WIRE# 3',
      carrierName: 'CVN-74 John C. Stennis',
      source: 'mission'
    };

    const event = new GradingEvent(rawEvent);
    const preparedPayload = event.prepare();

    expect(preparedPayload.event.event_data.night).toBeUndefined();
    expect(preparedPayload.event.event_data.wire).toBe(3);
  });
});
