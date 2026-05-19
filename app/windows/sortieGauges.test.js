/**
 * @jest-environment jsdom
 */

const SortieGauges = require('./sortieGauges');

function makeGaugeStrip() {
  const el = document.createElement('div');
  el.id = 'gauge-strip';
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('SortieGauges.render', () => {
  it('does nothing when gauge-strip element is absent', () => {
    expect(() => SortieGauges.render({}, {}, {})).not.toThrow();
  });

  it('renders arc gauges and stat rows into gauge-strip', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({}, {}, {});
    expect(el.innerHTML).toContain('arc-gauge');
    expect(el.innerHTML).toContain('stat-grid');
  });

  it('shows — for all gauges when gauges object is null', () => {
    const el = makeGaugeStrip();
    SortieGauges.render(null, null, null);
    expect(el.innerHTML).toContain('arc-gauge');
    expect(el.innerHTML).not.toContain('arc-gauge">500');
  });

  it('renders a speed value in the arc gauge', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({ highest_speed_kts: 500 }, {}, {});
    expect(el.innerHTML).toContain('500');
  });

  it('formats values >= 10000 as Nk', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({ highest_altitude_ft: 50000 }, {}, {});
    expect(el.innerHTML).toContain('50k');
  });

  it('renders Mach gauge with M prefix', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({ highest_speed_mach: 1.5 }, {}, {});
    expect(el.innerHTML).toContain('M1.50');
  });

  it('converts km to nm for sortie_distance_km', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({ sortie_distance_km: 185.2 }, {}, {});
    expect(el.innerHTML).toContain('100');
  });

  it('renders speed needle when telemetry has current speedKts', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({}, { speedKts: 400 }, {});
    expect(el.innerHTML).toContain('stroke="rgba(255,255,255,0.8)"');
  });

  it('renders needle from state for sortie_distance_km currentKey', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({}, {}, { sortieDistanceKm: 100 });
    expect(el.innerHTML).toContain('stroke="rgba(255,255,255,0.8)"');
  });

  it('renders stat rows with real values', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({
      most_air_kills_in_sortie: 3,
      longest_missile_hit_nm: 5.6,
      longest_gun_burst_seconds: 2.3,
      longest_refuel_contact_seconds: 45,
    }, {}, {});
    expect(el.innerHTML).toContain('3');
    expect(el.innerHTML).toContain('5.6');
    expect(el.innerHTML).toContain('2.3s');
    expect(el.innerHTML).toContain('45s');
  });

  it('renders — for null stat values', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({}, {}, {});
    const count = (el.innerHTML.match(/—/g) || []).length;
    expect(count).toBeGreaterThan(0);
  });

  it('renders payload section when telemetry has payload array', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({}, {
      payload: [
        { displayName: 'AIM-9X', category: 1, count: 2 },
        { typeName: 'M-61', category: 0, count: 1 },
        { category: 2, count: 4 },
      ],
    }, {});
    expect(el.innerHTML).toContain('AIM-9X');
    expect(el.innerHTML).toContain('Missile');
    expect(el.innerHTML).toContain('M-61');
    expect(el.innerHTML).toContain('Gun');
    expect(el.innerHTML).toContain('Rocket');
  });

  it('escapes HTML characters in payload display names', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({}, {
      payload: [{ displayName: '<b>xss&test</b>', category: 3, count: 1 }],
    }, {});
    // jsdom normalizes entities so check the text content, not innerHTML
    expect(el.querySelector('.payload-name').textContent).toBe('<b>xss&test</b>');
    // The raw innerHTML should not contain an unescaped < tag from the payload
    expect(el.innerHTML).not.toContain('<b>xss');
  });

  it('does not render payload section when payload is empty', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({}, { payload: [] }, {});
    expect(el.innerHTML).not.toContain('payload-section');
  });

  it('does not render payload section when payload is missing', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({}, {}, {});
    expect(el.innerHTML).not.toContain('payload-section');
  });

  it('renders arc gauge with value exceeding max (clamped to 1)', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({ highest_speed_kts: 9999 }, {}, {});
    expect(el.innerHTML).toContain('arc-gauge');
  });

  it('renders arc with unknown payload category', () => {
    const el = makeGaugeStrip();
    SortieGauges.render({}, {
      payload: [{ displayName: 'Unknown weapon', category: 99, count: 1 }],
    }, {});
    expect(el.innerHTML).toContain('Unknown weapon');
  });
});
