const log = require('electron-log');

const DEFAULT_HEALTH_CHECK_INTERVAL = 5000; // 5 seconds

class HealthChecker {
  constructor(apiClient, store, interval = DEFAULT_HEALTH_CHECK_INTERVAL, onStatusChange = null) {
    this.apiClient = apiClient;
    this.store = store;
    this.interval = interval;
    this.isHealthy = this.store.get('api_healthy', true);
    this.intervalId = null;
    this.onStatusChange = onStatusChange;
  }

  setOnStatusChange(onStatusChange) {
    this.onStatusChange = onStatusChange;
  }

  updateStatus(nextStatus) {
    const didChange = this.isHealthy !== nextStatus;
    this.isHealthy = nextStatus;
    this.store.set('api_healthy', nextStatus);

    if (didChange && typeof this.onStatusChange === 'function') {
      this.onStatusChange(nextStatus);
    }
  }

  async checkHealth() {
    try {
      await this.apiClient.healthcheck();
      this.updateStatus(true);
    } catch (error) {
      this.updateStatus(false);
      log.warn('API health check failed:', error.message);
    }
  }

  start() {
    if (this.intervalId) {
      log.warn('Health checker is already running');
      return;
    }

    log.info(`Starting health checker with ${this.interval}ms interval`);

    // Run initial check immediately
    this.checkHealth();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkHealth();
    }, this.interval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      log.info('Health checker stopped');
    }
  }

  getStatus() {
    return {
      isHealthy: this.isHealthy,
      lastStatus: this.store.get('api_healthy', true)
    };
  }
}

module.exports = { HealthChecker };
