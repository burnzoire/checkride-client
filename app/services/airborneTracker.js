class AirborneTracker {
  constructor() {
    this.takeoffByPilot = new Map();
    this.flyableByPilot = new Map();
  }

  /**
   * Mutates the given event object in-place (expected to already be a cloned payload).
   *
   * Rules:
   * - Track takeoff time per pilot when we know they are in a flyable slot.
   * - On landing, attach duration_seconds and clear state.
   * - On crash/eject/pilot_death/disconnect, clear state.
   */
  apply(event) {
    if (!event || typeof event !== 'object') {
      return;
    }

    const eventType = event.event_type;
    const eventData = event.event_data || {};
    const pilotUcid = eventData.player_ucid;

    if (eventType === 'change_slot' && pilotUcid) {
      this.flyableByPilot.set(pilotUcid, Boolean(eventData.flyable));
      return;
    }

    if (pilotUcid && (eventType === 'crash' || eventType === 'eject' || eventType === 'pilot_death' || eventType === 'disconnect')) {
      this.takeoffByPilot.delete(pilotUcid);
      return;
    }

    if (eventType === 'takeoff') {
      if (!pilotUcid) {
        return;
      }

      if (this.takeoffByPilot.has(pilotUcid)) {
        return;
      }

      const isFlyable = this.flyableByPilot.get(pilotUcid);
      if (isFlyable !== true) {
        return;
      }

      const takeoffAtMs = Date.parse(event.occurred_at);
      if (!Number.isFinite(takeoffAtMs)) {
        return;
      }

      this.takeoffByPilot.set(pilotUcid, takeoffAtMs);
      return;
    }

    if (eventType === 'landing') {
      if (!pilotUcid) {
        return;
      }

      const takeoffAtMs = this.takeoffByPilot.get(pilotUcid);
      if (!Number.isFinite(takeoffAtMs)) {
        return;
      }

      const landingAtMs = Date.parse(event.occurred_at);
      if (!Number.isFinite(landingAtMs)) {
        this.takeoffByPilot.delete(pilotUcid);
        return;
      }

      const durationSeconds = Math.max(0, Math.floor((landingAtMs - takeoffAtMs) / 1000));

      if (!event.event_data || typeof event.event_data !== 'object') {
        event.event_data = {};
      }

      event.event_data.duration_seconds = durationSeconds;
      this.takeoffByPilot.delete(pilotUcid);
    }
  }
}

module.exports = {
  AirborneTracker
};
