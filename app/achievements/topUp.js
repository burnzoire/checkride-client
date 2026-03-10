const Achievement = require('./achievement');

const TWENTY_MINUTES_MS = 20 * 60 * 1000;

class TopUp extends Achievement {
  constructor() {
    super({
      id: 'quick_tank',
      name: 'Top Up',
      description: 'Make tanker contact within 20 minutes of takeoff.',
      triggerType: 'refuel_enrichment',
      iconHint: 'Rapid post-takeoff tanker join-up',
      iconDescription: 'A fighter quickly joining on a tanker shortly after launch with stopwatch motif indicating rapid contact.',
    });
  }

  evaluate(event, state) {
    const contactEvent = event.contactEvent ?? event.contact_event ?? event.contact;
    if (contactEvent !== 'contact_start') return false;
    if (!Number.isFinite(state.lastTakeoffAtMs)) return false;

    const missionTime = event?.missionTime ?? event?.mission_time;
    const contactAtMs = (typeof missionTime === 'number' && Number.isFinite(missionTime))
      ? missionTime * 1000
      : NaN;
    if (!Number.isFinite(contactAtMs)) return false;

    const delta = contactAtMs - state.lastTakeoffAtMs;
    return delta >= 0 && delta <= TWENTY_MINUTES_MS;
  }
}

module.exports = new TopUp();
