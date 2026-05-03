const log = require('electron-log');

const DEFAULT_HEARTBEAT_INTERVAL = 60000; // 60 seconds

class HeartbeatService {
  constructor(apiClient, interval = DEFAULT_HEARTBEAT_INTERVAL, getPlayerCount = () => 0, clientVersion = null, serverId = null) {
    this.apiClient = apiClient;
    this.interval = interval;
    this.getPlayerCount = getPlayerCount;
    this.clientVersion = clientVersion;
    this.serverId = serverId;
    this.intervalId = null;
  }

  async beat() {
    try {
      await this.apiClient.heartbeat({
        playerCount: this.getPlayerCount(),
        clientVersion: this.clientVersion,
        serverId: this.serverId,
      });
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
