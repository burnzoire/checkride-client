(function (factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    window.SortieCharts = factory();
  }
}(function () {
  const THEME = {
    grid: '#2e3340',
    tick: '#7a8394',
    speed: '#7eb8f7',
    altitude: '#7abf6a',
    fuel: '#e0a76b',
    scrubLine: 'rgba(126, 184, 247, 0.55)',
    gap: 'rgba(224, 107, 107, 0.10)',
  };

  const GAP_THRESHOLD_SEC = 5;

  let charts = [];
  let scrubTimeSec = null;
  let t0Ms = 0;
  let gaps = []; // [{ start: tSec, end: tSec }, ...]

  const gapBandPlugin = {
    id: 'gapBand',
    beforeDatasetsDraw(chart) {
      if (gaps.length === 0) return;
      const xScale = chart.scales.x;
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.fillStyle = THEME.gap;
      for (const g of gaps) {
        const x1 = xScale.getPixelForValue(g.start);
        const x2 = xScale.getPixelForValue(g.end);
        if (x2 < chartArea.left || x1 > chartArea.right) continue;
        const left = Math.max(x1, chartArea.left);
        const right = Math.min(x2, chartArea.right);
        ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
      }
      ctx.restore();
    },
  };

  const scrubLinePlugin = {
    id: 'scrubLine',
    afterDraw(chart) {
      if (scrubTimeSec === null) return;
      const xScale = chart.scales.x;
      const { ctx, chartArea } = chart;
      const x = xScale.getPixelForValue(scrubTimeSec);
      if (x < chartArea.left || x > chartArea.right) return;
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = THEME.scrubLine;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    },
  };

  function formatTimeSec(sec) {
    if (sec < 60) return Math.round(sec) + 's';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function makeConfig(label, color, yLabel, showXAxis) {
    return {
      type: 'line',
      plugins: [gapBandPlugin, scrubLinePlugin],
      data: {
        datasets: [{
          label,
          borderColor: color,
          backgroundColor: color.replace(')', ', 0.06)').replace('rgb', 'rgba'),
          fill: true,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          data: [],
        }],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'linear',
            display: showXAxis,
            ticks: {
              color: THEME.tick,
              maxTicksLimit: 8,
              callback: v => formatTimeSec(v),
            },
            grid: { color: THEME.grid },
            afterFit(scale) { scale.paddingRight = 16; },
          },
          y: {
            display: true,
            title: { display: true, text: yLabel, color: THEME.tick, font: { size: 10 } },
            ticks: { color: THEME.tick, maxTicksLimit: 5 },
            grid: { color: THEME.grid },
            afterFit(scale) { scale.width = 70; },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
      },
    };
  }

  function init() {
    if (!window.Chart) return false;

    const ids = [
      { id: 'chart-speed',    label: 'Speed (kts)', color: THEME.speed,    yLabel: 'Speed (kts)', showX: false },
      { id: 'chart-altitude', label: 'Altitude (ft)', color: THEME.altitude, yLabel: 'Alt (ft)',  showX: false },
      { id: 'chart-fuel',     label: 'Fuel (%)',    color: THEME.fuel,     yLabel: 'Fuel (%)',    showX: true  },
    ];

    charts = ids.map(({ id, label, color, yLabel, showX }) => {
      const canvas = document.getElementById(id);
      if (!canvas) return null;
      return new window.Chart(canvas, makeConfig(label, color, yLabel, showX));
    }).filter(Boolean);

    return charts.length === 3;
  }

  function load(events) {
    if (charts.length === 0 && !init()) return;

    t0Ms = events.length > 0 ? new Date(events[0].t).getTime() : Date.now();

    const speedData = [];
    const altData   = [];
    const fuelData  = [];
    const sampleTimes = [];

    for (const ev of events) {
      if (ev.type !== 'flight_sample_enrichment') continue;
      const tSec = (new Date(ev.t).getTime() - t0Ms) / 1000;
      sampleTimes.push(tSec);
      if (!ev.state?.telemetry) continue;
      const tel = ev.state.telemetry;
      if (tel.speedKts != null)           speedData.push({ x: tSec, y: tel.speedKts });
      if (tel.altBaroFt != null)          altData.push({ x: tSec, y: tel.altBaroFt });
      if (tel.currentFuelState != null)   fuelData.push({ x: tSec, y: tel.currentFuelState * 100 });
    }

    gaps = [];
    for (let i = 1; i < sampleTimes.length; i++) {
      const delta = sampleTimes[i] - sampleTimes[i - 1];
      if (delta > GAP_THRESHOLD_SEC) {
        gaps.push({ start: sampleTimes[i - 1], end: sampleTimes[i] });
      }
    }

    const xMin = sampleTimes.length > 0 ? sampleTimes[0] : 0;
    const xMax = sampleTimes.length > 0 ? sampleTimes[sampleTimes.length - 1] : 100;

    charts[0].data.datasets[0].data = speedData;
    charts[1].data.datasets[0].data = altData;
    charts[2].data.datasets[0].data = fuelData;
    charts.forEach(c => {
      c.options.scales.x.min = xMin;
      c.options.scales.x.max = xMax;
      c.update('none');
    });
  }

  function setScrub(tSec) {
    scrubTimeSec = tSec;
    charts.forEach(c => c.update('none'));
  }

  function getT0Ms() { return t0Ms; }

  function getGapCount() { return gaps.length; }

  function destroy() {
    charts.forEach(c => c.destroy());
    charts = [];
    scrubTimeSec = null;
    t0Ms = 0;
    gaps = [];
  }

  return { init, load, setScrub, getT0Ms, getGapCount, destroy };
}));
