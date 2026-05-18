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
  };

  let charts = [];
  let scrubTimeSec = null;
  let t0Ms = 0;

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
      plugins: [scrubLinePlugin],
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
          },
          y: {
            display: true,
            title: { display: true, text: yLabel, color: THEME.tick, font: { size: 10 } },
            ticks: { color: THEME.tick, maxTicksLimit: 5 },
            grid: { color: THEME.grid },
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

    for (const ev of events) {
      if (ev.type !== 'flight_sample_enrichment' || !ev.state?.telemetry) continue;
      const tel = ev.state.telemetry;
      const tSec = (new Date(ev.t).getTime() - t0Ms) / 1000;
      if (tel.speedKts != null)           speedData.push({ x: tSec, y: tel.speedKts });
      if (tel.altBaroFt != null)          altData.push({ x: tSec, y: tel.altBaroFt });
      if (tel.currentFuelState != null)   fuelData.push({ x: tSec, y: tel.currentFuelState * 100 });
    }

    charts[0].data.datasets[0].data = speedData;
    charts[1].data.datasets[0].data = altData;
    charts[2].data.datasets[0].data = fuelData;
    charts.forEach(c => c.update('none'));
  }

  function setScrub(tSec) {
    scrubTimeSec = tSec;
    charts.forEach(c => c.update('none'));
  }

  function getT0Ms() { return t0Ms; }

  function destroy() {
    charts.forEach(c => c.destroy());
    charts = [];
    scrubTimeSec = null;
    t0Ms = 0;
  }

  return { init, load, setScrub, getT0Ms, destroy };
}));
