(function (factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    window.SortieGauges = factory();
  }
}(function () {

  // cx=50, cy=50, r=40 — semicircle from left (180°) to right (0°), sweeping upward.
  // fraction 0→1 maps to 0→180° of arc.
  function arcPath(fraction) {
    if (fraction <= 0) return null;
    const f = Math.min(fraction, 0.9999);
    const angle = f * Math.PI;
    const endX = (50 - 40 * Math.cos(angle)).toFixed(2);
    const endY = (50 - 40 * Math.sin(angle)).toFixed(2);
    const large = f > 0.5 ? 1 : 0;
    return `M 10 50 A 40 40 0 ${large} 1 ${endX} ${endY}`;
  }

  function fmtVal(value, decimals) {
    if (value == null || !Number.isFinite(value)) return '—';
    if (value >= 10000) return Math.round(value / 1000) + 'k';
    return value.toFixed(decimals);
  }

  const KM_TO_NM = 1 / 1.852;

  const ARC_GAUGES = [
    { key: 'highest_speed_kts',   label: 'Top Speed',  unit: 'kts', max: 1500, color: '#7eb8f7', decimals: 0 },
    { key: 'highest_speed_mach',  label: 'Mach',       unit: 'M',   max: 2.5,  color: '#7eb8f7', decimals: 2, prefix: 'M' },
    { key: 'highest_altitude_ft', label: 'Max Alt',    unit: 'ft',  max: 60000,color: '#7abf6a', decimals: 0 },
    { key: 'sortie_distance_km',  label: 'Sortie Dist',unit: 'nm',  max: 1000, color: '#c07be0', decimals: 0, convert: v => v * KM_TO_NM },
    { key: 'noe_distance_km',     label: 'NOE Dist',   unit: 'nm',  max: 100,  color: '#e0a76b', decimals: 1, convert: v => v * KM_TO_NM },
  ];

  const STAT_ROWS = [
    { key: 'most_air_kills_in_sortie',       label: 'Air kills',      fmt: v => v != null ? String(Math.round(v)) : '—' },
    { key: 'most_ground_kills_in_sortie',    label: 'Ground kills',   fmt: v => v != null ? String(Math.round(v)) : '—' },
    { key: 'longest_missile_hit_nm',         label: 'Missile hit',    fmt: v => v != null ? v.toFixed(1) + ' nm' : '—' },
    { key: 'longest_weapon_hit_nm',          label: 'Weapon hit',     fmt: v => v != null ? v.toFixed(1) + ' nm' : '—' },
    { key: 'longest_gun_burst_seconds',      label: 'Gun burst',      fmt: v => v != null ? v.toFixed(1) + 's' : '—' },
    { key: 'longest_refuel_contact_seconds', label: 'Refuel contact', fmt: v => v != null ? Math.round(v) + 's' : '—' },
  ];

  function renderArcGauge(cfg, gauges) {
    let value = gauges?.[cfg.key];
    if (value != null && cfg.convert) value = cfg.convert(value);
    const valid = value != null && Number.isFinite(value) && value > 0;
    const fraction = valid ? Math.min(value / cfg.max, 1) : 0;
    const path = arcPath(fraction);
    const color = valid ? cfg.color : '#4d5464';

    const display = valid
      ? (cfg.prefix ? cfg.prefix + value.toFixed(cfg.decimals) : fmtVal(value, cfg.decimals))
      : '—';

    return `<div class="arc-gauge">
      <svg viewBox="0 0 100 56" xmlns="http://www.w3.org/2000/svg">
        <path d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none" stroke="#2e3340" stroke-width="9" stroke-linecap="round"/>
        ${path ? `<path d="${path}"
              fill="none" stroke="${cfg.color}" stroke-width="9" stroke-linecap="round"/>` : ''}
        <text x="50" y="43" text-anchor="middle"
              fill="${color}"
              font-size="13" font-weight="600"
              font-family="'Segoe UI',system-ui,sans-serif"
              font-variant-numeric="tabular-nums">${display}</text>
        <text x="50" y="53" text-anchor="middle"
              fill="#4d5464" font-size="8"
              font-family="'Segoe UI',system-ui,sans-serif">${valid ? cfg.unit : ''}</text>
      </svg>
      <div class="arc-label">${cfg.label}</div>
    </div>`;
  }

  function render(gauges) {
    const el = document.getElementById('gauge-strip');
    if (!el) return;

    let html = '<div class="arc-grid">';
    for (const cfg of ARC_GAUGES) {
      html += renderArcGauge(cfg, gauges);
    }
    html += '</div>';

    html += '<div class="stat-grid">';
    for (const row of STAT_ROWS) {
      const raw = gauges?.[row.key];
      const val = raw != null && Number.isFinite(raw) ? raw : null;
      html += `<div class="stat-key">${row.label}</div>
               <div class="stat-val">${row.fmt(val)}</div>`;
    }
    html += '</div>';

    el.innerHTML = html;
  }

  return { render };
}));
