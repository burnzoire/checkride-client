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

  function renderOrdnance(telemetry, state) {
    const payload = Array.isArray(telemetry.payload) ? telemetry.payload : [];
    const weapons = Array.isArray(state.weapons) ? state.weapons : [];

    let html = '<div class="state-section"><div class="section-title">Ordnance</div>';

    // In-flight weapons
    if (weapons.length > 0) {
      const rows = weapons.map(w => {
        const name = escapeHtml(w.weaponDisplayName || w.weaponName || w.weaponClass || w.weaponKey || '?');
        const statusLabel = w.inFlight ? 'IN FLIGHT' : (w.hitOrMiss ?? w.status ?? '—');
        const statusColor = w.inFlight ? '#c8a03a' : w.hitOrMiss === 'hit' ? '#3a8f5c' : w.hitOrMiss === 'miss' ? '#e07b6b' : '#7a8394';
        const dist = w.distanceNm != null ? fmt(w.distanceNm) + ' nm' : '—';
        return `<tr>
          <td style="font-size:11px">${name}</td>
          <td style="font-size:11px;color:#7a8394">${escapeHtml(w.weaponClass || '—')}</td>
          <td><span style="color:${statusColor};font-size:10px;font-weight:600">${statusLabel}</span></td>
          <td style="font-size:11px;color:#7a8394;text-align:right">${dist}</td>
        </tr>`;
      }).join('');
      html += `<div style="font-size:11px;color:#4d5464;margin-bottom:4px">Fired (${weapons.length})</div>
        <table class="kills-table" style="margin-bottom:10px">
          <thead><tr><th>Weapon</th><th>Class</th><th>Status</th><th style="text-align:right">Dist.</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    // Current payload — raw GetAmmo rows
    if (payload.length > 0) {
      const rows = payload.map(item => {
        const name = escapeHtml(item.displayName || item.typeName || 'Unknown');
        const cat = AMMO_CATEGORY[item.category] ?? String(item.category);
        return `<tr>
          <td style="font-size:11px">${name}</td>
          <td style="font-size:11px;color:#7a8394">${cat}</td>
          <td style="font-size:11px;text-align:right">${item.count}</td>
        </tr>`;
      }).join('');
      html += `<div style="font-size:11px;color:#4d5464;margin-bottom:4px">Current payload</div>
        <table class="kills-table">
          <thead><tr><th>Weapon</th><th>Type</th><th style="text-align:right">Qty</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    if (weapons.length === 0 && payload.length === 0) {
      html += '<div style="font-size:12px;color:#4d5464;font-style:italic">No ordnance data</div>';
    }

    html += '</div>';
    return html;
  }

  function renderMissiles(s) {
    const inbound = (s.inboundMissiles || []).filter(m => m.inFlight);
    const recentInbound = (s.inboundMissiles || []).filter(m => !m.inFlight);

    if (inbound.length === 0 && recentInbound.length === 0) return '';

    const rows = [
      ...inbound.map(m => `<tr>
        <td><span class="badge badge-other" style="background:#3a1a1a;color:#e07b6b">INBOUND</span></td>
        <td style="font-size:11px">${escapeHtml(m.weaponName || '?')}</td>
        <td style="font-size:11px;color:#7a8394">${escapeHtml(m.weaponGuidance || '—')}</td>
      </tr>`),
      ...recentInbound.map(m => {
        const label = m.status === 'hit' ? 'HIT' : 'EVADED';
        const color = m.status === 'hit' ? '#e07b6b' : '#3a8f5c';
        return `<tr>
          <td><span class="badge" style="background:#1e2230;color:${color}">${label}</span></td>
          <td style="font-size:11px">${escapeHtml(m.weaponName || '?')}</td>
          <td style="font-size:11px;color:#7a8394">${escapeHtml(m.weaponGuidance || '—')}</td>
        </tr>`;
      }),
    ].join('');

    return `<div class="state-section"><div class="section-title">Inbound Threats</div>
      <table class="kills-table">
        <thead><tr><th></th><th>Weapon</th><th>Guidance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  function renderCombat(s) {
    const killsHtml = s.kills && s.kills.length > 0
      ? `<table class="kills-table">
           <thead><tr><th></th><th>Target</th><th>Weapon</th><th>At kill</th><th>Dist.</th></tr></thead>
           <tbody>${s.kills.map(k => {
             const targetName = escapeHtml(k.victimTypeName || k.victimAirType || '—');
             const subLabel = k.victimAirType === 'HELICOPTER' ? ' <span style="font-size:10px;color:#7a8394">HELO</span>' : '';
             const weaponParts = [k.weaponClass, k.weaponGuidance].filter(v => v != null && v !== '');
             const weaponDesc = escapeHtml(weaponParts.join(' / ') || '—');
             const flags = [];
             if (k.night) flags.push('<span style="color:#7a8394;font-size:10px">NIGHT</span>');
             if (k.avengedFriendly) flags.push('<span style="color:#c8a03a;font-size:10px">AVENGER</span>');
             const altSpeed = k.pilotAltitudeFt != null
               ? `${fmt(k.pilotAltitudeFt, 0)} ft${k.pilotSpeedMach != null ? ' · M' + fmt(k.pilotSpeedMach, 2) : ''}`
               : '—';
             return `<tr>
               <td style="white-space:nowrap">${categoryBadge(k.victimUnitCategory)}${flags.map(f => ' ' + f).join('')}</td>
               <td style="font-size:11px">${targetName}${subLabel}</td>
               <td style="font-size:11px;color:#7a8394">${weaponDesc}</td>
               <td style="font-size:11px;color:#7a8394;white-space:nowrap">${altSpeed}</td>
               <td style="font-size:11px;white-space:nowrap">${k.carrierDistanceNm != null ? fmt(k.carrierDistanceNm) + ' nm' : '—'}</td>
             </tr>`;
           }).join('')}
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

  // The client-side WeaponTracker's view: the shots a kill is key-matched against.
  // Distinct from "Ordnance" (the mission/pilotState weapon list) — this is exactly
  // what drives the client-authoritative kill weapon attribution.
  function renderWeaponTracker(pilot) {
    const shots = Array.isArray(pilot && pilot.trackedShots) ? pilot.trackedShots : [];
    let html = '<div class="state-section"><div class="section-title">Shot Tracker (attribution)</div>';

    if (shots.length === 0) {
      html += '<div style="font-size:12px;color:#4d5464;font-style:italic">No tracked shots</div></div>';
      return html;
    }

    const rows = shots.map(s => {
      const name = escapeHtml(s.weaponName || '?');
      const statusLabel = s.inFlight ? 'IN FLIGHT' : 'HIT';
      const statusColor = s.inFlight ? '#c8a03a' : '#3a8f5c';
      return `<tr>
        <td style="font-size:11px">${name}</td>
        <td><span style="color:${statusColor};font-size:10px;font-weight:600">${statusLabel}</span></td>
        <td style="font-size:11px;color:#7a8394;text-align:right">${fmt(s.targetObjectId, 0)}</td>
        <td style="font-size:11px;color:#7a8394;text-align:right">${fmt(s.weaponObjectId, 0)}</td>
      </tr>`;
    }).join('');

    html += `<table class="kills-table">
        <thead><tr><th>Weapon</th><th>State</th><th style="text-align:right">Target id</th><th style="text-align:right">Weapon id</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    return html;
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
      ${renderOrdnance(telemetry, state)}
      ${renderWeaponTracker(pilot)}
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
    renderOrdnance,
    renderMissiles,
    renderCombat,
    renderSession,
    renderRefuel,
    renderNavigation,
    renderGauges,
    renderWeaponTracker,
    renderPilotState,
  };
}));
