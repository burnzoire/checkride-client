const Achievement = require('./achievement');

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const MIN_FUEL_GAIN = 0.10;

class TopUp extends Achievement {
  constructor() {
    super({
      id: 'quick_tank',
      name: 'Top Up',
      description: 'Take on at least 10% fuel within 15 minutes of takeoff.',
      triggerType: 'refuel_enrichment',
      iconHint: 'Rapid post-takeoff tanker join-up',
      iconDescription: 'A fighter quickly joining on a tanker shortly after launch with stopwatch motif indicating rapid contact.',
    });
  }

  evaluate(event, state) {
    if (event.refuelStatus !== 'started') return false;
    const fuelGain = event.fuelGain ?? event.fuel_gain;
    if (!(typeof fuelGain === 'number' && Number.isFinite(fuelGain) && fuelGain >= MIN_FUEL_GAIN)) return false;
    if (!Number.isFinite(state.lastTakeoffAtMs)) return false;

    const missionTime = event?.startedAtMissionTime ?? event?.started_at_mission_time ?? event?.missionTime ?? event?.mission_time;
    const contactAtMs = (typeof missionTime === 'number' && Number.isFinite(missionTime))
      ? missionTime * 1000
      : NaN;
    if (!Number.isFinite(contactAtMs)) return false;

    const delta = contactAtMs - state.lastTakeoffAtMs;
    return delta >= 0 && delta <= FIFTEEN_MINUTES_MS;
  }
}

module.exports = new TopUp();
