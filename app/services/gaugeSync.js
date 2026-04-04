const log = require('electron-log');

const DEFAULT_SETTLE_FOR_MS = 6000;

const FLUSH_TRIGGER_EVENT_TYPES = new Set([
  'landing',
  'crash',
  'eject',
  'pilot_death',
  'disconnect',
  'change_slot',
  'self_kill',
]);

class GaugeSync {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.gaugesByPilot = new Map();
    this.loadingByPilot = new Map();
    this.inflightByGauge = new Set();
    this.pendingByGauge = new Map();
  }

  syncSnapshot(snapshot) {
    const playerUcid = snapshot?.pilot_uid;
    const playerName = snapshot?.pilot_name;
    const gauges = snapshot?.state?.gauges;
    const triggerEventType = snapshot?.trigger_event_type;
    const shouldFlushSettlingWrites = FLUSH_TRIGGER_EVENT_TYPES.has(triggerEventType);

    if (!playerUcid || !gauges || typeof gauges !== 'object') {
      return;
    }

    this.ensureLoaded(playerUcid)
      .then(() => {
        const pilotGauges = this.gaugesByPilot.get(playerUcid) || {};

        Object.entries(gauges).forEach(([gaugeId, rawValue]) => {
          const value = this.normalizeNumber(rawValue);
          if (value === null) return;

          const current = pilotGauges[gaugeId];
          const currentValue = this.normalizeNumber(current?.value);
          if (currentValue !== null && value <= currentValue) {
            return;
          }

          this.handleSettlingGauge({
            playerUcid,
            playerName,
            gaugeId,
            value,
            settleForMs: DEFAULT_SETTLE_FOR_MS,
            flushNow: shouldFlushSettlingWrites,
          });
        });
      })
      .catch((error) => {
        log.warn(`GaugeSync failed to load gauges for ${playerUcid}:`, error?.message || error);
      });
  }

  handleSettlingGauge({ playerUcid, playerName, gaugeId, value, settleForMs, flushNow }) {
    const key = `${playerUcid}:${gaugeId}`;
    const pending = this.pendingByGauge.get(key);
    let valueIncreased = false;

    if (!pending || value > pending.value) {
      valueIncreased = true;
      if (pending?.timer) {
        clearTimeout(pending.timer);
      }

      const nextPending = {
        playerUcid,
        playerName,
        gaugeId,
        value,
        timer: null,
      };

      this.pendingByGauge.set(key, nextPending);
    }

    const currentPending = this.pendingByGauge.get(key);
    if (!currentPending) return;

    if (flushNow) {
      this.flushPendingGauge(key);
      return;
    }

    if (!valueIncreased && currentPending.timer) {
      return;
    }

    currentPending.timer = setTimeout(() => {
      this.flushPendingGauge(key);
    }, settleForMs);
  }

  flushPendingGauge(key) {
    const pending = this.pendingByGauge.get(key);
    if (!pending) return;

    if (pending.timer) {
      clearTimeout(pending.timer);
    }

    this.pendingByGauge.delete(key);
    this.submitGaugeUpdate({
      playerUcid: pending.playerUcid,
      playerName: pending.playerName,
      gaugeId: pending.gaugeId,
      value: pending.value,
    });
  }

  submitGaugeUpdate({ playerUcid, playerName, gaugeId, value }) {
    const inflightKey = `${playerUcid}:${gaugeId}`;
    if (this.inflightByGauge.has(inflightKey)) {
      this.handleSettlingGauge({ playerUcid, playerName, gaugeId, value, settleForMs: DEFAULT_SETTLE_FOR_MS, flushNow: false });
      return;
    }

    this.inflightByGauge.add(inflightKey);
    this.apiClient.updatePilotGauge({
      playerUcid,
      playerName,
      gaugeId,
      value,
      comparison: 'max',
    })
      .then((response) => {
        const serverValue = this.normalizeNumber(response?.value);
        const bestKnownValue = (serverValue !== null && serverValue > value) ? serverValue : value;
        const nextPilotGauges = this.gaugesByPilot.get(playerUcid) || {};
        nextPilotGauges[gaugeId] = {
          value: bestKnownValue,
          updated_at: response?.updated_at || null,
        };
        this.gaugesByPilot.set(playerUcid, nextPilotGauges);
      })
      .catch((error) => {
        log.warn(`GaugeSync failed to update gauge ${gaugeId} for ${playerUcid}:`, error?.message || error);
      })
      .finally(() => {
        this.inflightByGauge.delete(inflightKey);
      });
  }

  ensureLoaded(playerUcid) {
    if (this.gaugesByPilot.has(playerUcid)) {
      return Promise.resolve(this.gaugesByPilot.get(playerUcid));
    }

    if (this.loadingByPilot.has(playerUcid)) {
      return this.loadingByPilot.get(playerUcid);
    }

    const loadPromise = this.apiClient.fetchPilotGauges(playerUcid)
      .then((response) => {
        const gauges = response?.gauges && typeof response.gauges === 'object' ? response.gauges : {};
        this.gaugesByPilot.set(playerUcid, gauges);
        return gauges;
      })
      .finally(() => {
        this.loadingByPilot.delete(playerUcid);
      });

    this.loadingByPilot.set(playerUcid, loadPromise);
    return loadPromise;
  }

  normalizeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
}

module.exports = GaugeSync;