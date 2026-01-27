const { AirborneTracker } = require('./airborneTracker');

describe('AirborneTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new AirborneTracker();
  });

  it('tracks takeoff only for flyable slots and clears slot start on takeoff', () => {
    const pilotUcid = 'pilot-1';

    tracker.apply({
      event_type: 'change_slot',
      occurred_at: '2026-01-21T00:00:00.000Z',
      event_data: { player_ucid: pilotUcid, flyable: true }
    });

    tracker.apply({
      event_type: 'takeoff',
      occurred_at: '2026-01-21T00:01:00.000Z',
      event_data: { player_ucid: pilotUcid }
    });

    expect(tracker.takeoffByPilot.has(pilotUcid)).toBe(true);
    expect(tracker.slotStartByPilot.has(pilotUcid)).toBe(false);
  });

  it('does not track takeoff when slot is not flyable', () => {
    const pilotUcid = 'pilot-2';

    tracker.apply({
      event_type: 'change_slot',
      occurred_at: '2026-01-21T00:00:00.000Z',
      event_data: { player_ucid: pilotUcid, flyable: false }
    });

    tracker.apply({
      event_type: 'takeoff',
      occurred_at: '2026-01-21T00:01:00.000Z',
      event_data: { player_ucid: pilotUcid }
    });

    expect(tracker.takeoffByPilot.has(pilotUcid)).toBe(false);
  });

  it('adds duration_seconds on landing using takeoff time', () => {
    const pilotUcid = 'pilot-3';
    const landingEvent = {
      event_type: 'landing',
      occurred_at: '2026-01-21T00:02:05.000Z',
      event_data: { player_ucid: pilotUcid }
    };

    tracker.apply({
      event_type: 'change_slot',
      occurred_at: '2026-01-21T00:00:00.000Z',
      event_data: { player_ucid: pilotUcid, flyable: true }
    });

    tracker.apply({
      event_type: 'takeoff',
      occurred_at: '2026-01-21T00:01:00.000Z',
      event_data: { player_ucid: pilotUcid }
    });

    tracker.apply(landingEvent);

    expect(landingEvent.event_data.duration_seconds).toBe(65);
    expect(tracker.takeoffByPilot.has(pilotUcid)).toBe(false);
    expect(tracker.slotStartByPilot.has(pilotUcid)).toBe(false);
  });

  it('adds duration_seconds on landing using slot start when no takeoff is observed', () => {
    const pilotUcid = 'pilot-4';
    const landingEvent = {
      event_type: 'landing',
      occurred_at: '2026-01-21T00:03:05.000Z',
      event_data: { player_ucid: pilotUcid }
    };

    tracker.apply({
      event_type: 'change_slot',
      occurred_at: '2026-01-21T00:00:00.000Z',
      event_data: { player_ucid: pilotUcid, flyable: true }
    });

    tracker.apply(landingEvent);

    expect(landingEvent.event_data.duration_seconds).toBe(185);
  });

  it('preserves provided duration_seconds and clears state on landing', () => {
    const pilotUcid = 'pilot-5';
    const landingEvent = {
      event_type: 'landing',
      occurred_at: '2026-01-21T00:02:05.000Z',
      event_data: { player_ucid: pilotUcid, duration_seconds: 999 }
    };

    tracker.apply({
      event_type: 'change_slot',
      occurred_at: '2026-01-21T00:00:00.000Z',
      event_data: { player_ucid: pilotUcid, flyable: true }
    });

    tracker.apply({
      event_type: 'takeoff',
      occurred_at: '2026-01-21T00:01:00.000Z',
      event_data: { player_ucid: pilotUcid }
    });

    tracker.apply(landingEvent);

    expect(landingEvent.event_data.duration_seconds).toBe(999);
    expect(tracker.takeoffByPilot.has(pilotUcid)).toBe(false);
    expect(tracker.slotStartByPilot.has(pilotUcid)).toBe(false);
  });

  it('clears state on crash/eject/pilot_death/disconnect', () => {
    const pilotUcid = 'pilot-6';

    tracker.apply({
      event_type: 'change_slot',
      occurred_at: '2026-01-21T00:00:00.000Z',
      event_data: { player_ucid: pilotUcid, flyable: true }
    });

    tracker.apply({
      event_type: 'takeoff',
      occurred_at: '2026-01-21T00:01:00.000Z',
      event_data: { player_ucid: pilotUcid }
    });

    ['crash', 'eject', 'pilot_death', 'disconnect'].forEach((eventType) => {
      tracker.takeoffByPilot.set(pilotUcid, Date.parse('2026-01-21T00:01:00.000Z'));
      tracker.slotStartByPilot.set(pilotUcid, Date.parse('2026-01-21T00:00:00.000Z'));

      tracker.apply({
        event_type: eventType,
        occurred_at: '2026-01-21T00:01:10.000Z',
        event_data: { player_ucid: pilotUcid }
      });

      expect(tracker.takeoffByPilot.has(pilotUcid)).toBe(false);
      expect(tracker.slotStartByPilot.has(pilotUcid)).toBe(false);
    });
  });

  it('ignores invalid events', () => {
    expect(() => tracker.apply(null)).not.toThrow();
    expect(() => tracker.apply({ event_type: 'landing' })).not.toThrow();
  });
});
