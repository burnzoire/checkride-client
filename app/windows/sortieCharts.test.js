/**
 * @jest-environment jsdom
 */

function freshModule() {
  jest.resetModules();
  return require('./sortieCharts');
}

function makeMockChart() {
  return {
    data: { datasets: [{ data: [] }] },
    options: { scales: { x: {} } },
    update: jest.fn(),
    destroy: jest.fn(),
  };
}

function addChartCanvases() {
  ['chart-speed', 'chart-altitude', 'chart-fuel'].forEach(id => {
    const canvas = document.createElement('canvas');
    canvas.id = id;
    document.body.appendChild(canvas);
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.Chart;
});

describe('SortieCharts initial state', () => {
  it('getT0Ms returns 0', () => {
    const sc = freshModule();
    expect(sc.getT0Ms()).toBe(0);
  });

  it('getGapCount returns 0', () => {
    const sc = freshModule();
    expect(sc.getGapCount()).toBe(0);
  });
});

describe('SortieCharts.init', () => {
  it('returns false when window.Chart is not available', () => {
    const sc = freshModule();
    expect(sc.init()).toBe(false);
  });

  it('returns false when chart canvases are absent from DOM', () => {
    const sc = freshModule();
    window.Chart = jest.fn(() => makeMockChart());
    expect(sc.init()).toBe(false);
  });

  it('returns true when Chart is available and all canvases exist', () => {
    const sc = freshModule();
    addChartCanvases();
    window.Chart = jest.fn(() => makeMockChart());
    expect(sc.init()).toBe(true);
    sc.destroy();
  });
});

describe('SortieCharts.destroy', () => {
  it('runs without error when no charts exist', () => {
    const sc = freshModule();
    expect(() => sc.destroy()).not.toThrow();
    expect(sc.getT0Ms()).toBe(0);
    expect(sc.getGapCount()).toBe(0);
  });

  it('calls destroy on each chart and resets state', () => {
    const sc = freshModule();
    addChartCanvases();
    const mockChart = makeMockChart();
    window.Chart = jest.fn(() => mockChart);
    sc.init();
    sc.destroy();
    expect(mockChart.destroy).toHaveBeenCalled();
    expect(sc.getT0Ms()).toBe(0);
  });
});

describe('SortieCharts.setScrub', () => {
  it('runs without error when no charts exist', () => {
    const sc = freshModule();
    expect(() => sc.setScrub(10)).not.toThrow();
  });

  it('calls update on all charts', () => {
    const sc = freshModule();
    addChartCanvases();
    const mockChart = makeMockChart();
    window.Chart = jest.fn(() => mockChart);
    sc.init();
    mockChart.update.mockClear();
    sc.setScrub(5);
    expect(mockChart.update).toHaveBeenCalledTimes(3);
    sc.destroy();
  });
});

describe('SortieCharts.load', () => {
  it('returns early when charts not initialized and Chart unavailable', () => {
    const sc = freshModule();
    expect(() => sc.load([])).not.toThrow();
    expect(sc.getT0Ms()).toBe(0);
  });

  it('sets t0Ms from first event timestamp', () => {
    const sc = freshModule();
    addChartCanvases();
    const mockChart = makeMockChart();
    window.Chart = jest.fn(() => mockChart);

    const t0 = new Date('2025-06-01T12:00:00Z');
    sc.load([
      { t: t0.toISOString(), type: 'flight_sample_enrichment', state: { telemetry: { speedKts: 300, altBaroFt: 10000, currentFuelState: 0.8 } } },
    ]);

    expect(sc.getT0Ms()).toBe(t0.getTime());
    sc.destroy();
  });

  it('skips non-flight_sample_enrichment events for chart data', () => {
    const sc = freshModule();
    addChartCanvases();
    const mockChart = makeMockChart();
    window.Chart = jest.fn(() => mockChart);

    const t0 = new Date('2025-06-01T12:00:00Z');
    sc.load([
      { t: t0.toISOString(), type: 'connect', state: {} },
      { t: t0.toISOString(), type: 'disconnect', state: {} },
    ]);

    // No samples means no gaps and the x-axis min/max are cleared
    expect(sc.getGapCount()).toBe(0);
    expect(mockChart.options.scales.x.min).toBeUndefined();
    sc.destroy();
  });

  it('calculates gaps when samples are more than 5s apart', () => {
    const sc = freshModule();
    addChartCanvases();
    const mockChart = makeMockChart();
    window.Chart = jest.fn(() => mockChart);

    const t0 = new Date('2025-06-01T12:00:00Z');
    const t1 = new Date('2025-06-01T12:00:10Z'); // 10s gap
    const t2 = new Date('2025-06-01T12:00:14Z'); // 4s gap (under threshold)

    sc.load([
      { t: t0.toISOString(), type: 'flight_sample_enrichment', state: { telemetry: { speedKts: 300 } } },
      { t: t1.toISOString(), type: 'flight_sample_enrichment', state: { telemetry: { speedKts: 310 } } },
      { t: t2.toISOString(), type: 'flight_sample_enrichment', state: { telemetry: { speedKts: 320 } } },
    ]);

    expect(sc.getGapCount()).toBe(1);
    sc.destroy();
  });

  it('records no gaps when samples are within threshold', () => {
    const sc = freshModule();
    addChartCanvases();
    const mockChart = makeMockChart();
    window.Chart = jest.fn(() => mockChart);

    const t0 = new Date('2025-06-01T12:00:00Z');
    const t1 = new Date('2025-06-01T12:00:03Z'); // 3s gap

    sc.load([
      { t: t0.toISOString(), type: 'flight_sample_enrichment', state: { telemetry: { speedKts: 300 } } },
      { t: t1.toISOString(), type: 'flight_sample_enrichment', state: { telemetry: { speedKts: 310 } } },
    ]);

    expect(sc.getGapCount()).toBe(0);
    sc.destroy();
  });

  it('handles events with no telemetry state', () => {
    const sc = freshModule();
    addChartCanvases();
    const mockChart = makeMockChart();
    window.Chart = jest.fn(() => mockChart);

    const t0 = new Date('2025-06-01T12:00:00Z');
    sc.load([
      { t: t0.toISOString(), type: 'flight_sample_enrichment', state: null },
    ]);

    expect(sc.getT0Ms()).toBe(t0.getTime());
    sc.destroy();
  });

  it('handles empty events array without error', () => {
    const sc = freshModule();
    addChartCanvases();
    const mockChart = makeMockChart();
    window.Chart = jest.fn(() => mockChart);

    expect(() => sc.load([])).not.toThrow();
    sc.destroy();
  });

  it('calls chart update with none mode after loading data', () => {
    const sc = freshModule();
    addChartCanvases();
    const mockChart = makeMockChart();
    window.Chart = jest.fn(() => mockChart);

    const t0 = new Date('2025-06-01T12:00:00Z');
    sc.load([
      { t: t0.toISOString(), type: 'flight_sample_enrichment', state: { telemetry: { speedKts: 300, altBaroFt: 5000, currentFuelState: 0.9 } } },
    ]);

    expect(mockChart.update).toHaveBeenCalledWith('none');
    sc.destroy();
  });

  it('deletes x min/max from chart options when no samples are present', () => {
    const sc = freshModule();
    addChartCanvases();
    const mockChart = makeMockChart();
    mockChart.options.scales.x.min = 0;
    mockChart.options.scales.x.max = 100;
    window.Chart = jest.fn(() => mockChart);

    sc.load([
      { t: new Date().toISOString(), type: 'other', state: {} },
    ]);

    expect(mockChart.options.scales.x.min).toBeUndefined();
    expect(mockChart.options.scales.x.max).toBeUndefined();
    sc.destroy();
  });
});
