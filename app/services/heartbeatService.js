const log = require('electron-log');

const DEFAULT_HEARTBEAT_INTERVAL = 60000; // 60 seconds

class HeartbeatService {
  constructor(apiClient, interval = DEFAULT_HEARTBEAT_INTERVAL) {
    this.apiClient = apiClient;
    this.interval = interval;
    this.intervalId = null;
  }

  async beat() {
    try {
      await this.apiClient.heartbeat();
      log.debug('Heartbeat sent');
    } catch (error) {
      log.warn('Heartbeat failed:', error.message);
    }
  }

  start() {
    if (this.intervalId) {
      log.warn('Heartbeat service is already running');
      return;
    }

    log.info(`Starting heartbeat service with ${this.interval}ms interval`);
    this.beat();
    this.intervalId = setInterval(() => this.beat(), this.interval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      log.info('Heartbeat service stopped');
    }
  }
}

module.exports = { HeartbeatService };
