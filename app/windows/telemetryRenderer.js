(function () {
  const POLL_INTERVAL_MS = 2000;
  const STALE_THRESHOLD_MS = 6000;
  const { renderPilotState, escapeHtml } = TelemetryRenderFns;

  let selectedUcid = null;
  let lastUpdateAt = null;
  let pilots = [];

  const pilotListEl = document.getElementById('pilot-list-items');
  const statePanelEl = document.getElementById('state-panel');
  const noSelectionEl = document.getElementById('no-selection');
  const statusDotEl = document.getElementById('status-dot');
  const pilotCountEl = document.getElementById('pilot-count');

  function renderPilotList(pilotList, selected) {
    if (pilotList.length === 0) {
      pilotListEl.innerHTML = '<div id="empty-pilots">No active pilots</div>';
      return;
    }

    pilotListEl.innerHTML = pilotList.map(p => {
      const isSelected = p.ucid === selected;
      const aircraftStatus = p.state?.telemetry?.aircraftStatus;
      const inAir = p.state?.telemetry?.inAir;
      const statusLabel = aircraftStatus === 'dead' ? 'Dead' : (inAir ? 'Airborne' : 'On Ground');
      const statusClass = aircraftStatus === 'dead' ? 'dead' : (inAir ? 'in-air' : '');
      return `<div class="pilot-item ${isSelected ? 'selected' : ''}" data-ucid="${p.ucid}">
        <div class="pilot-name">${escapeHtml(p.name)}</div>
        <div class="pilot-status ${statusClass}">${statusLabel}</div>
      </div>`;
    }).join('');

    pilotListEl.querySelectorAll('.pilot-item').forEach(el => {
      el.addEventListener('click', () => {
        selectedUcid = el.dataset.ucid;
        refresh();
      });
    });
  }

  function refresh() {
    const selected = pilots.find(p => p.ucid === selectedUcid);

    pilotCountEl.textContent = pilots.length === 1 ? '1 pilot' : `${pilots.length} pilots`;

    renderPilotList(pilots, selectedUcid);

    if (selected) {
      noSelectionEl.style.display = 'none';
      statePanelEl.innerHTML = renderPilotState(selected);
    } else {
      statePanelEl.innerHTML = '';
      statePanelEl.appendChild(noSelectionEl);
      noSelectionEl.style.display = '';
    }
  }

  async function poll() {
    try {
      const snapshot = await window.telemetry.getSnapshot();
      pilots = snapshot.pilots || [];
      lastUpdateAt = Date.now();

      statusDotEl.classList.remove('stale');

      if (selectedUcid && !pilots.find(p => p.ucid === selectedUcid)) {
        selectedUcid = null;
      }
      if (!selectedUcid && pilots.length > 0) {
        selectedUcid = pilots[0].ucid;
      }

      refresh();
    } catch (err) {
      console.error('Telemetry poll failed:', err);
    }
  }

  function checkStale() {
    if (lastUpdateAt && (Date.now() - lastUpdateAt) > STALE_THRESHOLD_MS) {
      statusDotEl.classList.add('stale');
    }
  }

  poll();
  setInterval(poll, POLL_INTERVAL_MS);
  setInterval(checkStale, 1000);
})();
