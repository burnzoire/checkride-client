const log = require('electron-log');
const { HealthChecker } = require('./healthChecker');

describe('HealthChecker', () => {
  let apiClient;
  let store;
  let storeData;

  const buildStore = (initial = {}) => {
    storeData = { ...initial };
    return {
      get: jest.fn((key, defaultValue) => {
        if (Object.prototype.hasOwnProperty.call(storeData, key)) {
          return storeData[key];
        }
        return defaultValue;
      }),
      set: jest.fn((key, value) => {
        storeData[key] = value;
      })
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    apiClient = {
      healthcheck: jest.fn()
    };
    store = buildStore({ api_healthy: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes status from store', () => {
    store = buildStore({ api_healthy: false });

    const checker = new HealthChecker(apiClient, store);

    expect(store.get).toHaveBeenCalledWith('api_healthy', true);
    expect(checker.isHealthy).toBe(false);
  });

  it('updates status, persists to store, and notifies on change', () => {
    const onStatusChange = jest.fn();
    const checker = new HealthChecker(apiClient, store, 5000, onStatusChange);

    checker.updateStatus(true);

    expect(store.set).toHaveBeenCalledWith('api_healthy', true);
    expect(onStatusChange).not.toHaveBeenCalled();

    checker.updateStatus(false);

    expect(store.set).toHaveBeenCalledWith('api_healthy', false);
    expect(onStatusChange).toHaveBeenCalledWith(false);
  });

  it('checks health successfully', async () => {
    store = buildStore({ api_healthy: false });
    apiClient.healthcheck.mockResolvedValue({ status: 'ok' });
    const onStatusChange = jest.fn();

    const checker = new HealthChecker(apiClient, store, 5000, onStatusChange);

    await checker.checkHealth();

    expect(apiClient.healthcheck).toHaveBeenCalled();
    expect(store.set).toHaveBeenCalledWith('api_healthy', true);
    expect(onStatusChange).toHaveBeenCalledWith(true);
  });

  it('handles failed health checks and logs warning', async () => {
    apiClient.healthcheck.mockRejectedValue(new Error('boom'));
    const onStatusChange = jest.fn();

    const checker = new HealthChecker(apiClient, store, 5000, onStatusChange);

    await checker.checkHealth();

    expect(apiClient.healthcheck).toHaveBeenCalled();
    expect(store.set).toHaveBeenCalledWith('api_healthy', false);
    expect(onStatusChange).toHaveBeenCalledWith(false);
    expect(log.warn).toHaveBeenCalledWith('API health check failed:', 'boom');
  });

  it('starts immediately and on an interval', () => {
    jest.useFakeTimers();
    apiClient.healthcheck.mockResolvedValue({ status: 'ok' });

    const checker = new HealthChecker(apiClient, store, 1000);
    const checkSpy = jest.spyOn(checker, 'checkHealth').mockResolvedValue();

    checker.start();

    expect(log.info).toHaveBeenCalledWith('Starting health checker with 1000ms interval');
    expect(checkSpy).toHaveBeenCalledTimes(1);
    expect(checker.intervalId).not.toBeNull();

    jest.advanceTimersByTime(1000);
    expect(checkSpy).toHaveBeenCalledTimes(2);

    checker.start();
    expect(log.warn).toHaveBeenCalledWith('Health checker is already running');
  });

  it('stops and clears the interval', () => {
    jest.useFakeTimers();
    apiClient.healthcheck.mockResolvedValue({ status: 'ok' });

    const checker = new HealthChecker(apiClient, store, 1000);
    const clearSpy = jest.spyOn(global, 'clearInterval');

    checker.start();
    checker.stop();

    expect(clearSpy).toHaveBeenCalled();
    expect(checker.intervalId).toBeNull();
    expect(log.info).toHaveBeenCalledWith('Health checker stopped');
  });

  it('returns current and stored status', () => {
    store = buildStore({ api_healthy: false });
    const checker = new HealthChecker(apiClient, store);

    checker.updateStatus(true);

    expect(checker.getStatus()).toEqual({
      isHealthy: true,
      lastStatus: true
    });
  });
});
