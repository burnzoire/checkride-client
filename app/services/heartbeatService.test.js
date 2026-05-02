const log = require('electron-log');
const { HeartbeatService } = require('./heartbeatService');

describe('HeartbeatService', () => {
  let apiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    apiClient = { heartbeat: jest.fn() };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends a heartbeat successfully', async () => {
    apiClient.heartbeat.mockResolvedValue({ ok: true });
    const service = new HeartbeatService(apiClient);

    await service.beat();

    expect(apiClient.heartbeat).toHaveBeenCalledTimes(1);
    expect(apiClient.heartbeat).toHaveBeenCalledWith(0);
    expect(log.debug).toHaveBeenCalledWith('Heartbeat sent');
  });

  it('passes current player count to heartbeat', async () => {
    apiClient.heartbeat.mockResolvedValue({ ok: true });
    let count = 3;
    const service = new HeartbeatService(apiClient, 60000, () => count);

    await service.beat();
    expect(apiClient.heartbeat).toHaveBeenCalledWith(3);

    count = 5;
    await service.beat();
    expect(apiClient.heartbeat).toHaveBeenCalledWith(5);
  });

  it('logs a warning when heartbeat fails and does not throw', async () => {
    apiClient.heartbeat.mockRejectedValue(new Error('connection refused'));
    const service = new HeartbeatService(apiClient);

    await expect(service.beat()).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith('Heartbeat failed:', 'connection refused');
  });

  it('starts immediately and fires on interval', () => {
    jest.useFakeTimers();
    apiClient.heartbeat.mockResolvedValue({ ok: true });

    const service = new HeartbeatService(apiClient, 1000);
    const beatSpy = jest.spyOn(service, 'beat').mockResolvedValue();

    service.start();

    expect(log.info).toHaveBeenCalledWith('Starting heartbeat service with 1000ms interval');
    expect(beatSpy).toHaveBeenCalledTimes(1);
    expect(service.intervalId).not.toBeNull();

    jest.advanceTimersByTime(1000);
    expect(beatSpy).toHaveBeenCalledTimes(2);
  });

  it('warns if started while already running', () => {
    jest.useFakeTimers();
    apiClient.heartbeat.mockResolvedValue({ ok: true });

    const service = new HeartbeatService(apiClient, 1000);
    jest.spyOn(service, 'beat').mockResolvedValue();

    service.start();
    service.start();

    expect(log.warn).toHaveBeenCalledWith('Heartbeat service is already running');
  });

  it('stops and clears the interval', () => {
    jest.useFakeTimers();
    apiClient.heartbeat.mockResolvedValue({ ok: true });

    const service = new HeartbeatService(apiClient, 1000);
    jest.spyOn(service, 'beat').mockResolvedValue();
    const clearSpy = jest.spyOn(global, 'clearInterval');

    service.start();
    service.stop();

    expect(clearSpy).toHaveBeenCalled();
    expect(service.intervalId).toBeNull();
    expect(log.info).toHaveBeenCalledWith('Heartbeat service stopped');
  });
});
