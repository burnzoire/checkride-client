const GaugeSync = require('./gaugeSync');

jest.mock('electron-log');

describe('GaugeSync', () => {
  const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

  it('loads gauges once per pilot and updates only when value improves', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    const apiClient = {
      fetchPilotGauges: jest.fn().mockResolvedValue({
        gauges: {
          highest_speed_kts: { value: 500 },
        },
      }),
      updatePilotGauge: jest.fn().mockResolvedValue({ value: 550, updated_at: '2026-03-08T00:00:00Z' }),
    };

    const sync = new GaugeSync(apiClient);

    sync.syncSnapshot({
      pilot_uid: 'ucid-1',
      pilot_name: 'Maverick',
      trigger_event_type: 'flight_sample_enrichment',
      state: { gauges: { highest_speed_kts: 550 } },
    });

    await flushPromises();
    await flushPromises();

    jest.advanceTimersByTime(6000);
    await flushPromises();

    expect(apiClient.fetchPilotGauges).toHaveBeenCalledTimes(1);
    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(1);
    expect(apiClient.updatePilotGauge).toHaveBeenCalledWith({
      playerUcid: 'ucid-1',
      playerName: 'Maverick',
      gaugeId: 'highest_speed_kts',
      value: 550,
      comparison: 'max',
    });

    sync.syncSnapshot({
      pilot_uid: 'ucid-1',
      pilot_name: 'Maverick',
      trigger_event_type: 'flight_sample_enrichment',
      state: { gauges: { highest_speed_kts: 540 } },
    });

    await flushPromises();

    expect(apiClient.fetchPilotGauges).toHaveBeenCalledTimes(1);
    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('does not issue duplicate updates for same pilot/gauge while update is in flight', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    let resolveUpdate;
    const updatePromise = new Promise((resolve) => {
      resolveUpdate = resolve;
    });

    const apiClient = {
      fetchPilotGauges: jest.fn().mockResolvedValue({ gauges: {} }),
      updatePilotGauge: jest.fn().mockReturnValue(updatePromise),
    };

    const sync = new GaugeSync(apiClient);

    sync.syncSnapshot({
      pilot_uid: 'ucid-2',
      pilot_name: 'Goose',
      trigger_event_type: 'flight_sample_enrichment',
      state: { gauges: { highest_speed_kts: 600 } },
    });

    await flushPromises();

    sync.syncSnapshot({
      pilot_uid: 'ucid-2',
      pilot_name: 'Goose',
      trigger_event_type: 'flight_sample_enrichment',
      state: { gauges: { highest_speed_kts: 610 } },
    });

    await flushPromises();

    jest.advanceTimersByTime(6000);
    await flushPromises();

    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(1);

    resolveUpdate({ value: 600, updated_at: '2026-03-08T00:00:00Z' });
    await flushPromises();

    jest.useRealTimers();
  });

  it('waits for flight-sample gauges to settle before writing PB', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    const apiClient = {
      fetchPilotGauges: jest.fn().mockResolvedValue({ gauges: {} }),
      updatePilotGauge: jest.fn().mockResolvedValue({ value: 1.15, updated_at: '2026-03-08T00:00:00Z' }),
    };

    const sync = new GaugeSync(apiClient);

    sync.syncSnapshot({
      pilot_uid: 'ucid-3',
      pilot_name: 'Iceman',
      trigger_event_type: 'flight_sample_enrichment',
      state: { gauges: { highest_speed_mach: 1.05 } },
    });

    await flushPromises();
    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(0);

    jest.advanceTimersByTime(3000);
    sync.syncSnapshot({
      pilot_uid: 'ucid-3',
      pilot_name: 'Iceman',
      trigger_event_type: 'flight_sample_enrichment',
      state: { gauges: { highest_speed_mach: 1.15 } },
    });

    await flushPromises();
    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(0);

    jest.advanceTimersByTime(6000);
    await flushPromises();

    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(1);
    expect(apiClient.updatePilotGauge).toHaveBeenCalledWith({
      playerUcid: 'ucid-3',
      playerName: 'Iceman',
      gaugeId: 'highest_speed_mach',
      value: 1.15,
      comparison: 'max',
    });

    jest.useRealTimers();
  });

  it('flushes settled gauges immediately on terminal event', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    const apiClient = {
      fetchPilotGauges: jest.fn().mockResolvedValue({ gauges: {} }),
      updatePilotGauge: jest.fn().mockResolvedValue({ value: 28000, updated_at: '2026-03-08T00:00:00Z' }),
    };

    const sync = new GaugeSync(apiClient);

    sync.syncSnapshot({
      pilot_uid: 'ucid-4',
      pilot_name: 'Viper',
      trigger_event_type: 'flight_sample_enrichment',
      state: { gauges: { highest_altitude_ft: 28000 } },
    });

    await flushPromises();
    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(0);

    sync.syncSnapshot({
      pilot_uid: 'ucid-4',
      pilot_name: 'Viper',
      trigger_event_type: 'landing',
      state: { gauges: { highest_altitude_ft: 28000 } },
    });

    await flushPromises();
    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('settles event-driven PB gauges before writing', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    const apiClient = {
      fetchPilotGauges: jest.fn().mockResolvedValue({ gauges: {} }),
      updatePilotGauge: jest.fn().mockResolvedValue({ value: 42.5, updated_at: '2026-03-08T00:00:00Z' }),
    };

    const sync = new GaugeSync(apiClient);

    sync.syncSnapshot({
      pilot_uid: 'ucid-5',
      pilot_name: 'Slider',
      trigger_event_type: 'hit_enrichment',
      state: { gauges: { longest_missile_hit_nm: 42.5 } },
    });

    await flushPromises();
    await flushPromises();

    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(0);

    jest.advanceTimersByTime(6000);
    await flushPromises();

    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(1);
    expect(apiClient.updatePilotGauge).toHaveBeenCalledWith({
      playerUcid: 'ucid-5',
      playerName: 'Slider',
      gaugeId: 'longest_missile_hit_nm',
      value: 42.5,
      comparison: 'max',
    });

    jest.useRealTimers();
  });
});
