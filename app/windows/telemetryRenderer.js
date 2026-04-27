(function () {
  const POLL_INTERVAL_MS = 2000;
  const STALE_THRESHOLD_MS = 6000;

  let selectedUcid = null;
  let lastUpdateAt = null;
  let pilots = [];

  const pilotListEl = document.getElementById('pilot-list-items');
  const statePanelEl = document.getElementById('state-panel');
  const noSelectionEl = document.getElementById('no-selection');
  const statusDotEl = document.getElementById('status-dot');
  const pilotCountEl = document.getElementById('pilot-count');

  function fmt(value, decimals = 1) {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return '—';
      return decimals === 0 ? Math.round(value).toLocaleString() : value.toFixed(decimals);
    }
    return String(value);
  }

  function fmtPct(value) {
    if (value === null || value === undefined) return '—';
    if (!Number.isFinite(value)) return '—';
    return (value * 100).toFixed(1) + '%';
  }

  function categoryBadge(cat) {
    const label = cat ?? 'other';
    return `<span class="badge badge-${label}">${label}</span>`;
  }

  function kvRow(key, value, cls = '') {
    const valClass = cls ? ` class="${cls}"` : '';
    return `<div class="kv-key">${key}</div><div class="kv-value"${valClass}>${value}</div>`;
  }

  function renderTelemetry(t) {
    const inAirCls = t.inAir ? 'ok' : '';
    return `
      <div class="state-section">
        <div class="section-title">Flight Telemetry</div>
        <div class="kv-grid">
          ${kvRow('Status', t.inAir ? 'Airborne' : 'On Ground', t.inAir ? 'ok' : '')}
          ${kvRow('Location', fmt(t.takeoffLocation ?? (t.takeoffFromCarrier ? 'Carrier' : null)))}
          ${kvRow('Speed', t.speedKts !== null && t.speedKts !== undefined ? `${fmt(t.speedKts, 0)} kts / M${fmt(t.speedMach, 2)}` : '—')}
          ${kvRow('Altitude (baro)', t.altBaroFt !== null && t.altBaroFt !== undefined ? `${fmt(t.altBaroFt, 0)} ft` : '—')}
          ${kvRow('Altitude (radar)', t.altRadarFt !== null && t.altRadarFt !== undefined ? `${fmt(t.altRadarFt, 0)} ft` : '—')}
          ${kvRow('Fuel', fmtPct(t.currentFuelState))}
        </div>
      </div>`;
  }

  function renderCombat(s) {
    const killsHtml = s.kills && s.kills.length > 0
      ? `<table class="kills-table">
           <thead><tr><th>Category</th><th>Carrier Dist.</th></tr></thead>
           <tbody>${s.kills.map(k => `
             <tr>
               <td>${categoryBadge(k.victimUnitCategory)}</td>
               <td>${k.carrierDistanceNm !== null && k.carrierDistanceNm !== undefined ? fmt(k.carrierDistanceNm) + ' nm' : '—'}</td>
             </tr>`).join('')}
           </tbody>
         </table>`
      : '<div style="font-size:12px;color:#4d5464;font-style:italic">No kills this sortie</div>';

    return `
      <div class="state-section">
        <div class="section-title">Combat</div>
        <div class="kv-grid" style="margin-bottom:10px">
          ${kvRow('Air kills', fmt(s.killsAir, 0))}
          ${kvRow('Ground kills', fmt(s.killsGround, 0))}
          ${kvRow('Munitions in flight', fmt(s.munitionsInFlight, 0))}
          ${kvRow('Longest missile hit', s.longestMissileHit ? fmt(s.longestMissileHit) + ' nm' : '—')}
        </div>
        ${killsHtml}
      </div>`;
  }

  function renderSession(s) {
    return `
      <div class="state-section">
        <div class="section-title">Carrier Ops</div>
        <div class="kv-grid">
          ${kvRow('Traps', fmt(s.trapCount, 0))}
          ${kvRow('Night traps', fmt(s.nightTrapCount, 0))}
          ${kvRow('Consecutive bolters', fmt(s.consecutiveBolters, 0))}
          ${kvRow('Launched from carrier', s.launchedFromCarrier ? 'Yes' : 'No')}
          ${kvRow('Fuel at trap', fmtPct(s.fuelAtTrap))}
        </div>
      </div>`;
  }

  function renderRefuel(s) {
    const hasRefuel = s.lastRefuelDetectedAtMs !== null && s.lastRefuelDetectedAtMs !== undefined;
    return `
      <div class="state-section">
        <div class="section-title">Refuelling</div>
        <div class="kv-grid">
          ${kvRow('Last fuel gain', fmtPct(s.lastRefuelFuelGain))}
          ${kvRow('Last contact duration', s.lastRefuelContactDurationSeconds !== null && s.lastRefuelContactDurationSeconds !== undefined ? fmt(s.lastRefuelContactDurationSeconds) + 's' : '—')}
        </div>
      </div>`;
  }

  function renderGauges(g) {
    return `
      <div class="state-section">
        <div class="section-title">Session Bests</div>
        <div class="kv-grid">
          ${kvRow('Top speed', g.highest_speed_mach ? 'M' + fmt(g.highest_speed_mach, 2) : '—', g.highest_speed_mach >= 1.0 ? 'highlight' : '')}
          ${kvRow('Highest altitude', g.highest_altitude_ft ? fmt(g.highest_altitude_ft, 0) + ' ft' : '—')}
          ${kvRow('Longest missile hit', g.longest_missile_hit_nm ? fmt(g.longest_missile_hit_nm) + ' nm' : '—')}
          ${kvRow('Longest refuel contact', g.longest_refuel_contact_seconds ? fmt(g.longest_refuel_contact_seconds) + 's' : '—')}
          ${kvRow('Most air kills (sortie)', fmt(g.most_air_kills_in_sortie, 0))}
          ${kvRow('Most ground kills (sortie)', fmt(g.most_ground_kills_in_sortie, 0))}
        </div>
      </div>`;
  }

  function renderPilotState(pilot) {
    if (!pilot || !pilot.state) {
      return '<div id="no-selection">No state available</div>';
    }
    const { telemetry, state, gauges } = pilot.state;
    return `
      <div style="padding-bottom:8px;border-bottom:1px solid #2e3340;margin-bottom:16px">
        <div style="font-size:15px;font-weight:600;color:#dde3ee">${pilot.name}</div>
        <div style="font-size:11px;color:#4d5464;margin-top:2px">${pilot.ucid}</div>
      </div>
      ${renderTelemetry(telemetry)}
      ${renderCombat(state)}
      ${renderSession(state)}
      ${renderRefuel(state)}
      ${renderGauges(gauges)}
    `;
  }

  function renderPilotList(pilotList, selected) {
    if (pilotList.length === 0) {
      pilotListEl.innerHTML = '<div id="empty-pilots">No active pilots</div>';
      return;
    }

    pilotListEl.innerHTML = pilotList.map(p => {
      const isSelected = p.ucid === selected;
      const inAir = p.state?.telemetry?.inAir;
      const statusLabel = inAir ? 'Airborne' : 'On Ground';
      const statusClass = inAir ? 'in-air' : '';
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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
