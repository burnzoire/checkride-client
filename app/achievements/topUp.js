const Achievement = require('./achievement');

const TEN_MINUTES_MS = 10 * 60 * 1000;

class TopUp extends Achievement {
  constructor() {
    super({
      id: 'quick_tank',
      name: 'Top Up',
      description: 'Make tanker contact within 10 minutes of takeoff.',
      triggerType: 'refuel_enrichment',
      iconHint: 'Rapid post-takeoff tanker join-up',
      iconDescription: 'A fighter quickly joining on a tanker shortly after launch with stopwatch motif indicating rapid contact.',
    });
  }

  evaluate(event, state) {
    const contactEvent = event.contactEvent ?? event.contact_event ?? event.contact;
    if (contactEvent !== 'contact_start') return false;
    if (!Number.isFinite(state.lastTakeoffAtMs)) return false;

    const occurredAt = event.occurredAt ?? event.occurred_at;
    const contactAtMs = typeof occurredAt === 'string' ? Date.parse(occurredAt) : NaN;
    if (!Number.isFinite(contactAtMs)) return false;

    const delta = contactAtMs - state.lastTakeoffAtMs;
    return delta >= 0 && delta <= TEN_MINUTES_MS;
  }
}

module.exports = new TopUp();
