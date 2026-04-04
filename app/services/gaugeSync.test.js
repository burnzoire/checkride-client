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

  it('re-queues and eventually writes the peak value when an inflight collision occurs at flush time', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    let resolveFirstUpdate;
    const firstUpdatePromise = new Promise((resolve) => {
      resolveFirstUpdate = resolve;
    });

    const apiClient = {
      fetchPilotGauges: jest.fn().mockResolvedValue({ gauges: {} }),
      updatePilotGauge: jest.fn()
        .mockReturnValueOnce(firstUpdatePromise)
        .mockResolvedValue({ value: 2.1, updated_at: '2026-03-08T00:00:00Z' }),
    };

    const sync = new GaugeSync(apiClient);

    // First sample arrives, settle timer starts
    sync.syncSnapshot({
      pilot_uid: 'ucid-6',
      pilot_name: 'Rooster',
      trigger_event_type: 'flight_sample_enrichment',
      state: { gauges: { highest_speed_mach: 1.8 } },
    });

    await flushPromises();

    // Advance timer partially so first settle fires, sending the 1.8 API call (still in-flight)
    jest.advanceTimersByTime(6000);
    await flushPromises();

    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(1);
    expect(apiClient.updatePilotGauge).toHaveBeenCalledWith(
      expect.objectContaining({ value: 1.8 }),
    );

    // A higher sample (2.1) arrives while the first API call is still in-flight
    sync.syncSnapshot({
      pilot_uid: 'ucid-6',
      pilot_name: 'Rooster',
      trigger_event_type: 'flight_sample_enrichment',
      state: { gauges: { highest_speed_mach: 2.1 } },
    });

    await flushPromises();

    // The settle timer for 2.1 fires — but the first call is still in-flight
    jest.advanceTimersByTime(6000);
    await flushPromises();

    // 2.1 should have been re-queued, not dropped; still only 1 call so far
    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(1);

    // Now resolve the first in-flight call
    resolveFirstUpdate({ value: 1.8, updated_at: '2026-03-08T00:00:00Z' });
    await flushPromises();

    // After the in-flight call resolves, the re-queued 2.1 settle timer fires
    jest.advanceTimersByTime(6000);
    await flushPromises();

    // 2.1 must eventually be written
    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(2);
    expect(apiClient.updatePilotGauge).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 2.1 }),
    );

    jest.useRealTimers();
  });

  it('does not suppress a new PB write when the server returns a higher existing value', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    const apiClient = {
      fetchPilotGauges: jest.fn().mockResolvedValue({ gauges: {} }),
      updatePilotGauge: jest.fn()
        // First call: server responds with a higher pre-existing value (2.0)
        .mockResolvedValueOnce({ value: 2.0, updated_at: '2026-03-08T00:00:00Z' })
        // Second call: resolves normally
        .mockResolvedValueOnce({ value: 2.1, updated_at: '2026-03-08T00:00:00Z' }),
    };

    const sync = new GaugeSync(apiClient);

    // Client sends 1.8, server responds with 2.0
    sync.syncSnapshot({
      pilot_uid: 'ucid-7',
      pilot_name: 'Phoenix',
      trigger_event_type: 'flight_sample_enrichment',
      state: { gauges: { highest_speed_mach: 1.8 } },
    });

    await flushPromises();
    jest.advanceTimersByTime(6000);
    await flushPromises();

    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(1);

    // Server response resolves with a higher value (2.0) — cache must not suppress 2.1
    await flushPromises();

    // Pilot then reaches 2.1
    sync.syncSnapshot({
      pilot_uid: 'ucid-7',
      pilot_name: 'Phoenix',
      trigger_event_type: 'flight_sample_enrichment',
      state: { gauges: { highest_speed_mach: 2.1 } },
    });

    await flushPromises();
    jest.advanceTimersByTime(6000);
    await flushPromises();

    // 2.1 must NOT be suppressed — it should be written
    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(2);
    expect(apiClient.updatePilotGauge).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 2.1 }),
    );

    jest.useRealTimers();
  });

  it('still writes gauge updates when the initial pilot gauge load fails', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    const apiClient = {
      fetchPilotGauges: jest.fn().mockRejectedValue(new Error('API unavailable')),
      updatePilotGauge: jest.fn().mockResolvedValue({ value: 80000, updated_at: '2026-03-08T00:00:00Z' }),
    };

    const sync = new GaugeSync(apiClient);

    sync.syncSnapshot({
      pilot_uid: 'ucid-8',
      pilot_name: 'Darkstar',
      trigger_event_type: 'flight_sample_enrichment',
      state: { gauges: { highest_altitude_ft: 80000 } },
    });

    await flushPromises();
    await flushPromises();

    jest.advanceTimersByTime(6000);
    await flushPromises();

    expect(apiClient.updatePilotGauge).toHaveBeenCalledTimes(1);
    expect(apiClient.updatePilotGauge).toHaveBeenCalledWith({
      playerUcid: 'ucid-8',
      playerName: 'Darkstar',
      gaugeId: 'highest_altitude_ft',
      value: 80000,
      comparison: 'max',
    });

    jest.useRealTimers();
  });
});
