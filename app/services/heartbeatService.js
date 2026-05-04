const log = require('electron-log');

const DEFAULT_HEARTBEAT_INTERVAL = 60000; // 60 seconds

class HeartbeatService {
  constructor(apiClient, interval = DEFAULT_HEARTBEAT_INTERVAL, getPlayerCount = () => 0, newRelicClient = null) {
    this.apiClient = apiClient;
    this.interval = interval;
    this.getPlayerCount = getPlayerCount;
    this.newRelicClient = newRelicClient;
    this.intervalId = null;
  }

  async beat() {
    const playerCount = this.getPlayerCount();
    try {
      const result = await this.apiClient.heartbeat(playerCount);
      log.debug('Heartbeat sent');
      if (this.newRelicClient) {
        if (result?.server_name && !this.newRelicClient.serverName) {
          this.newRelicClient.setServerName(result.server_name);
          log.info(`New Relic server name set to: ${result.server_name}`);
        }
        this.newRelicClient.recordLog('heartbeat', {
          logType: 'heartbeat',
          connectedPlayerCount: playerCount,
          success: true,
        });
      }
    } catch (error) {
      log.warn('Heartbeat failed:', error.message);
      if (this.newRelicClient) {
        this.newRelicClient.recordLog('heartbeat failed', {
          logType: 'heartbeat',
          connectedPlayerCount: playerCount,
          success: false,
          errorMessage: error.message,
        });
      }
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
