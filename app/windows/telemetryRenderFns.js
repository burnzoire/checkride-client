(function (factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    window.TelemetryRenderFns = factory();
  }
}(function () {
  const AMMO_CATEGORY = { 0: 'Gun', 1: 'Missile', 2: 'Rocket', 3: 'Bomb' };

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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function categoryBadge(cat) {
    const label = cat ?? 'other';
    return `<span class="badge badge-${label}">${label}</span>`;
  }

  function kvRow(key, value, cls = '') {
    const valClass = cls ? ` class="${cls}"` : '';
    return `<div class="kv-key">${key}</div><div class="kv-value"${valClass}>${value}</div>`;
  }

  function aircraftStatusLabel(t) {
    const s = t.aircraftStatus;
    if (s === 'dead') return { label: 'Dead', cls: 'danger' };
    if (s === 'disconnected') return { label: 'Disconnected', cls: 'danger' };
    if (s === 'airborne') return { label: 'Airborne', cls: 'ok' };
    if (s === 'ground') return { label: 'Ground', cls: '' };
    return { label: 'Connected', cls: '' };
  }

  function renderTelemetry(t) {
    const { label: statusText, cls: statusCls } = aircraftStatusLabel(t);
    return `
      <div class="state-section">
        <div class="section-title">Flight Telemetry</div>
        <div class="kv-grid">
          ${kvRow('Status', statusText, statusCls)}
          ${kvRow('Takeoff location', fmt(t.takeoffLocation ?? (t.takeoffFromCarrier ? 'Carrier' : null)))}
          ${kvRow('Speed', t.speedKts !== null && t.speedKts !== undefined ? `${fmt(t.speedKts, 0)} kts / M${fmt(t.speedMach, 2)}` : '—')}
          ${kvRow('Altitude (baro)', t.altBaroFt !== null && t.altBaroFt !== undefined ? `${fmt(t.altBaroFt, 0)} ft` : '—')}
          ${kvRow('Altitude (radar)', t.altRadarFt !== null && t.altRadarFt !== undefined ? `${fmt(t.altRadarFt, 0)} ft` : '—')}
          ${kvRow('Fuel', fmtPct(t.currentFuelState))}
        </div>
      </div>`;
  }

  function renderPayload(t) {
    const payload = t.payload;
    if (!Array.isArray(payload) || payload.length === 0) return '';
    const rows = payload.map(item => {
      const name = escapeHtml(item.displayName || item.typeName || 'Unknown');
      const cat = AMMO_CATEGORY[item.category] ?? '';
      return `<tr><td>${name}</td><td style="color:#7a8394;font-size:11px">${cat}</td><td style="text-align:right">${item.count}</td></tr>`;
    }).join('');
    return `
      <div class="state-section">
        <div class="section-title">Payload</div>
        <table class="kills-table">
          <thead><tr><th>Weapon</th><th>Type</th><th style="text-align:right">Qty</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderMissiles(s) {
    const outbound = (s.missiles || []).filter(m => m.inFlight);
    const inbound = (s.inboundMissiles || []).filter(m => m.inFlight);
    const recentInbound = (s.inboundMissiles || []).filter(m => !m.inFlight);

    if (outbound.length === 0 && inbound.length === 0 && recentInbound.length === 0) return '';

    let html = `<div class="state-section"><div class="section-title">Missiles</div>`;

    if (inbound.length > 0) {
      const rows = inbound.map(m => `
        <tr>
          <td><span class="badge badge-other" style="background:#3a1a1a;color:#e07b6b">INBOUND</span></td>
          <td>${escapeHtml(m.weaponName || '?')}</td>
          <td style="color:#7a8394">${escapeHtml(m.weaponGuidance || '—')}</td>
        </tr>`).join('');
      html += `<table class="kills-table" style="margin-bottom:8px">
        <thead><tr><th></th><th>Weapon</th><th>Guidance</th></tr></thead>
        <tbody>${rows}</tbody></table>`;
    }

    if (recentInbound.length > 0) {
      const rows = recentInbound.map(m => {
        const statusLabel = m.status === 'hit' ? 'HIT' : 'EVADED';
        const statusColor = m.status === 'hit' ? '#e07b6b' : '#3a8f5c';
        return `<tr>
          <td><span class="badge" style="background:#1e2230;color:${statusColor}">${statusLabel}</span></td>
          <td>${escapeHtml(m.weaponName || '?')}</td>
          <td style="color:#7a8394">${escapeHtml(m.weaponGuidance || '—')}</td>
        </tr>`;
      }).join('');
      html += `<table class="kills-table" style="margin-bottom:8px">
        ${inbound.length === 0 ? `<thead><tr><th></th><th>Weapon</th><th>Guidance</th></tr></thead>` : ''}
        <tbody>${rows}</tbody></table>`;
    }

    if (outbound.length > 0) {
      const rows = outbound.map(m => `
        <tr>
          <td><span class="badge badge-air">OUT</span></td>
          <td>${escapeHtml(m.weaponDisplayName || m.weaponName || '?')}</td>
          <td style="color:#7a8394">${m.speedMach ? 'M' + fmt(m.speedMach, 2) : '—'}</td>
        </tr>`).join('');
      html += `<table class="kills-table">
        <thead><tr><th></th><th>Weapon</th><th>Speed</th></tr></thead>
        <tbody>${rows}</tbody></table>`;
    }

    html += `</div>`;
    return html;
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
          ${kvRow('AAMs fired', fmt(s.sortieAamFiredCount, 0))}
          ${kvRow('Longest missile hit', s.longestMissileHit ? fmt(s.longestMissileHit) + ' nm' : '—')}
          ${kvRow('Longest weapon hit', s.longestWeaponHit ? fmt(s.longestWeaponHit) + ' nm' : '—')}
          ${kvRow('Longest gun burst', s.longestGunBurstSeconds ? fmt(s.longestGunBurstSeconds) + 's' : '—')}
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
    return `
      <div class="state-section">
        <div class="section-title">Refuelling</div>
        <div class="kv-grid">
          ${kvRow('Last fuel gain', fmtPct(s.lastRefuelFuelGain))}
          ${kvRow('Last contact duration', s.lastRefuelContactDurationSeconds !== null && s.lastRefuelContactDurationSeconds !== undefined ? fmt(s.lastRefuelContactDurationSeconds) + 's' : '—')}
        </div>
      </div>`;
  }

  function renderNavigation(s) {
    return `
      <div class="state-section">
        <div class="section-title">Navigation</div>
        <div class="kv-grid">
          ${kvRow('Sortie distance', s.sortieDistanceKm ? fmt(s.sortieDistanceKm) + ' km' : '—')}
          ${kvRow('NOE distance', s.noeDistanceKm ? fmt(s.noeDistanceKm) + ' km' : '—')}
        </div>
      </div>`;
  }

  function renderGauges(g) {
    const topSpeedParts = [];
    if (g.highest_speed_mach) topSpeedParts.push('M' + fmt(g.highest_speed_mach, 2));
    if (g.highest_speed_kts) topSpeedParts.push(fmt(g.highest_speed_kts, 0) + ' kts');
    return `
      <div class="state-section">
        <div class="section-title">Session Bests</div>
        <div class="kv-grid">
          ${kvRow('Top speed', topSpeedParts.length ? topSpeedParts.join(' / ') : '—', g.highest_speed_mach >= 1.0 ? 'highlight' : '')}
          ${kvRow('Highest altitude', g.highest_altitude_ft ? fmt(g.highest_altitude_ft, 0) + ' ft' : '—')}
          ${kvRow('Longest missile hit', g.longest_missile_hit_nm ? fmt(g.longest_missile_hit_nm) + ' nm' : '—')}
          ${kvRow('Longest weapon hit', g.longest_weapon_hit_nm ? fmt(g.longest_weapon_hit_nm) + ' nm' : '—')}
          ${kvRow('Longest gun burst', g.longest_gun_burst_seconds ? fmt(g.longest_gun_burst_seconds) + 's' : '—')}
          ${kvRow('Longest refuel contact', g.longest_refuel_contact_seconds ? fmt(g.longest_refuel_contact_seconds) + 's' : '—')}
          ${kvRow('Sortie distance', g.sortie_distance_km ? fmt(g.sortie_distance_km) + ' km' : '—')}
          ${kvRow('NOE distance', g.noe_distance_km ? fmt(g.noe_distance_km) + ' km' : '—')}
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
      ${renderPayload(telemetry)}
      ${renderMissiles(state)}
      ${renderCombat(state)}
      ${renderSession(state)}
      ${renderRefuel(state)}
      ${renderNavigation(state)}
      ${renderGauges(gauges)}
    `;
  }

  return {
    fmt,
    fmtPct,
    escapeHtml,
    kvRow,
    renderTelemetry,
    renderPayload,
    renderMissiles,
    renderCombat,
    renderSession,
    renderRefuel,
    renderNavigation,
    renderGauges,
    renderPilotState,
  };
}));
