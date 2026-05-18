(function () {
  const POLL_INTERVAL_MS = 2000;
  const STALE_THRESHOLD_MS = 6000;
  const { renderTelemetry, renderCombat, renderSession, escapeHtml } = TelemetryRenderFns;
  const charts = SortieCharts;

  // ── State ──────────────────────────────────────────────────────────────────

  let mode = 'live';           // 'live' | 'replay'
  let selectedUcid = null;
  let pilots = [];             // live: current snapshot array
  let pilotHistory = new Map(); // live: ucid → SortieEvent[]
  let replayEvents = [];       // replay: parsed JSONL events
  let replayMeta = null;       // replay: { ucid, name }
  let scrubFraction = 1.0;     // 0..1
  let liveAutoFollow = true;   // live: scrubber tracks latest unless user drags back
  let lastUpdateAt = null;

  // ── DOM refs ───────────────────────────────────────────────────────────────

  const pilotListEl     = document.getElementById('pilot-list-items');
  const pilotListLabel  = document.getElementById('pilot-list-label');
  const detailPanelEl   = document.getElementById('detail-panel');
  const noSelectionEl   = document.getElementById('no-selection');
  const statusDotEl     = document.getElementById('status-dot');
  const pilotCountEl    = document.getElementById('pilot-count');
  const scrubberEl      = document.getElementById('scrubber');
  const scrubberLabel   = document.getElementById('scrubber-label');
  const scrubTimeStart  = document.getElementById('scrubber-time-start');
  const scrubTimeEnd    = document.getElementById('scrubber-time-end');
  const btnLoadFile     = document.getElementById('btn-load-file');
  const btnBackLive     = document.getElementById('btn-back-live');
  const fileInput       = document.getElementById('file-input');

  // ── Time helpers ───────────────────────────────────────────────────────────

  function formatDuration(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '—';
    if (sec < 60) return Math.round(sec) + 's';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatAbsTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // ── Events array helpers ───────────────────────────────────────────────────

  function flightEvents(events) {
    return events.filter(e => e.type === 'flight_sample_enrichment');
  }

  function eventAtFraction(events, fraction) {
    const fe = flightEvents(events);
    if (fe.length === 0) return null;
    const idx = Math.round(fraction * (fe.length - 1));
    return fe[Math.max(0, Math.min(idx, fe.length - 1))];
  }

  function durationSec(events) {
    const fe = flightEvents(events);
    if (fe.length < 2) return 0;
    return (new Date(fe[fe.length - 1].t).getTime() - new Date(fe[0].t).getTime()) / 1000;
  }

  // ── Pilot list ─────────────────────────────────────────────────────────────

  function renderPilotList(pilotList) {
    if (pilotList.length === 0) {
      pilotListEl.innerHTML = '<div id="empty-pilots">No active pilots</div>';
      return;
    }

    pilotListEl.innerHTML = pilotList.map(p => {
      const isSelected = p.ucid === selectedUcid;
      const aircraftStatus = p.state?.telemetry?.aircraftStatus;
      const inAir = p.state?.telemetry?.inAir;
      const statusLabel = aircraftStatus === 'dead' ? 'Dead' : (inAir ? 'Airborne' : 'On Ground');
      const statusClass = aircraftStatus === 'dead' ? 'dead' : (inAir ? 'in-air' : '');
      return `<div class="pilot-item${isSelected ? ' selected' : ''}" data-ucid="${escapeHtml(p.ucid)}">
        <div class="pilot-name">${escapeHtml(p.name)}</div>
        <div class="pilot-status ${statusClass}">${statusLabel}</div>
      </div>`;
    }).join('');

    pilotListEl.querySelectorAll('.pilot-item').forEach(el => {
      el.addEventListener('click', () => {
        selectedUcid = el.dataset.ucid;
        onPilotSelected();
      });
    });
  }

  // ── Chart + scrubber update ────────────────────────────────────────────────

  function activeEvents() {
    if (mode === 'replay') return replayEvents;
    return pilotHistory.get(selectedUcid) || [];
  }

  function updateCharts() {
    const events = activeEvents();
    charts.load(events);
    updateScrubberRange(events);
    applyScrubPosition(events);
  }

  function updateScrubberRange(events) {
    const dur = durationSec(events);
    scrubTimeStart.textContent = '0s';
    scrubTimeEnd.textContent = formatDuration(dur);
  }

  function applyScrubPosition(events) {
    const fe = flightEvents(events);
    if (fe.length === 0) {
      scrubberLabel.textContent = '—';
      showDetailPlaceholder();
      return;
    }

    const idx = Math.round(scrubFraction * (fe.length - 1));
    const ev = fe[Math.max(0, Math.min(idx, fe.length - 1))];
    const t0Ms = new Date(fe[0].t).getTime();
    const tSec = (new Date(ev.t).getTime() - t0Ms) / 1000;

    charts.setScrub(tSec);

    const pilot = mode === 'replay'
      ? { ucid: replayMeta?.ucid, name: replayMeta?.name }
      : pilots.find(p => p.ucid === selectedUcid) || { ucid: selectedUcid, name: selectedUcid };

    scrubberLabel.textContent = formatAbsTime(ev.t) + '  +' + formatDuration(tSec);
    renderDetail(ev, pilot);
    SortieGauges.render(ev?.state?.gauges ?? null);
  }

  function renderDetail(ev, pilot) {
    if (!ev?.state) {
      showDetailPlaceholder();
      return;
    }
    const { telemetry, state } = ev.state;
    let html = '';
    if (pilot) {
      html += `<div style="padding-bottom:8px;border-bottom:1px solid #2e3340;margin-bottom:12px">
        <div style="font-size:14px;font-weight:600;color:#dde3ee">${escapeHtml(pilot.name || pilot.ucid || '—')}</div>
        <div style="font-size:11px;color:#4d5464;margin-top:2px">${escapeHtml(pilot.ucid || '—')}</div>
      </div>`;
    }
    if (telemetry) html += renderTelemetry(telemetry);
    if (state)     html += renderCombat(state);
    if (state)     html += renderSession(state);
    detailPanelEl.innerHTML = html;
  }

  function showDetailPlaceholder() {
    SortieGauges.render(null);
    detailPanelEl.innerHTML = '';
    detailPanelEl.appendChild(noSelectionEl);
    noSelectionEl.style.display = '';
    noSelectionEl.textContent = selectedUcid ? 'No flight data yet' : 'Select a pilot to view telemetry';
  }

  // ── Pilot selection ────────────────────────────────────────────────────────

  function onPilotSelected() {
    if (mode === 'live') {
      liveAutoFollow = true;
      scrubFraction = 1.0;
      scrubberEl.value = 1000;
    }
    updateCharts();
  }

  // ── Live mode ──────────────────────────────────────────────────────────────

  function appendLiveSample(pilot) {
    if (!pilot.ucid || !pilot.state?.telemetry) return;
    const history = pilotHistory.get(pilot.ucid);
    if (!history) return;

    const last = history[history.length - 1];
    const tel = pilot.state.telemetry;
    if (last) {
      const prev = last.state?.telemetry;
      if (prev && prev.speedKts === tel.speedKts && prev.altBaroFt === tel.altBaroFt) return;
    }

    history.push({
      t: new Date().toISOString(),
      type: 'flight_sample_enrichment',
      state: pilot.state,
    });
  }

  async function pollLive() {
    try {
      const snapshot = await window.telemetry.getSnapshot();
      pilots = snapshot.pilots || [];
      lastUpdateAt = Date.now();
      statusDotEl.classList.remove('stale');

      for (const pilot of pilots) {
        if (!pilotHistory.has(pilot.ucid)) pilotHistory.set(pilot.ucid, []);
        appendLiveSample(pilot);
      }

      if (selectedUcid && !pilots.find(p => p.ucid === selectedUcid)) selectedUcid = null;
      if (!selectedUcid && pilots.length > 0) selectedUcid = pilots[0].ucid;

      pilotCountEl.textContent = pilots.length === 1 ? '1 pilot' : `${pilots.length} pilots`;
      renderPilotList(pilots);

      if (selectedUcid) {
        if (liveAutoFollow) {
          scrubFraction = 1.0;
          scrubberEl.value = 1000;
        }
        updateCharts();
      }
    } catch (err) {
      console.error('Telemetry poll failed:', err);
    }
  }

  function checkStale() {
    if (lastUpdateAt && (Date.now() - lastUpdateAt) > STALE_THRESHOLD_MS) {
      statusDotEl.classList.add('stale');
    }
  }

  // ── Replay mode ────────────────────────────────────────────────────────────

  function parseJsonl(text) {
    return text.split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  }

  function loadReplay(text) {
    const lines = parseJsonl(text);
    const header = lines.find(l => l.sortie_start);
    replayMeta = header ? { ucid: header.ucid, name: header.name } : { ucid: '?', name: 'Unknown Pilot' };
    replayEvents = lines.filter(l => l.t && l.type);

    mode = 'replay';
    scrubFraction = 0;
    scrubberEl.value = 0;
    liveAutoFollow = false;

    statusDotEl.classList.remove('stale');
    statusDotEl.classList.add('replay');
    btnLoadFile.style.display = 'none';
    btnBackLive.style.display = '';
    pilotListLabel.textContent = 'Replay';

    const replayPilot = [{ ucid: replayMeta.ucid, name: replayMeta.name, state: null }];
    selectedUcid = replayMeta.ucid;
    pilotCountEl.textContent = '1 sortie';
    renderPilotList(replayPilot);
    updateCharts();
  }

  function returnToLive() {
    mode = 'live';
    replayEvents = [];
    replayMeta = null;
    selectedUcid = pilots.length > 0 ? pilots[0].ucid : null;
    scrubFraction = 1.0;
    scrubberEl.value = 1000;
    liveAutoFollow = true;

    statusDotEl.classList.remove('replay', 'stale');
    btnLoadFile.style.display = '';
    btnBackLive.style.display = 'none';
    pilotListLabel.textContent = 'Active Pilots';

    pilotCountEl.textContent = pilots.length === 1 ? '1 pilot' : `${pilots.length} pilots`;
    renderPilotList(pilots);
    if (selectedUcid) updateCharts();
  }

  // ── Scrubber events ────────────────────────────────────────────────────────

  scrubberEl.addEventListener('input', () => {
    scrubFraction = scrubberEl.value / 1000;
    if (mode === 'live') liveAutoFollow = scrubFraction >= 0.999;
    applyScrubPosition(activeEvents());
  });

  // In live mode, clicking the scrubber end re-enables auto-follow
  scrubberEl.addEventListener('change', () => {
    if (mode === 'live' && scrubFraction >= 0.999) liveAutoFollow = true;
  });

  // ── File loading ───────────────────────────────────────────────────────────

  async function openFile() {
    // Electron: use native dialog via IPC
    if (window.telemetry?.openSortieFile) {
      const text = await window.telemetry.openSortieFile();
      if (text) loadReplay(text);
      return;
    }
    // Browser: use file input
    fileInput.click();
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => loadReplay(e.target.result);
    reader.readAsText(file);
    fileInput.value = '';
  });

  btnLoadFile.addEventListener('click', openFile);
  btnBackLive.addEventListener('click', returnToLive);

  // ── Boot ───────────────────────────────────────────────────────────────────

  charts.init();
  pollLive();
  setInterval(pollLive, POLL_INTERVAL_MS);
  setInterval(checkStale, 1000);
})();
