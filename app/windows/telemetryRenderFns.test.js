jest.mock('electron-log', () => ({ info: jest.fn(), error: jest.fn() }));

const { renderPilotState, renderWeaponTracker, renderCombat, fmt, fmtPct } = require('./telemetryRenderFns');
const AchievementEngine = require('../services/achievementEngine');
const PilotState = require('../services/pilotState');

// ─── helpers ────────────────────────────────────────────────────────────────

function buildPopulatedState() {
  const ps = new PilotState();
  // Flight telemetry
  ps.inAir = true;
  ps.aircraftStatus = 'airborne';
  ps.currentSpeedKts = 444;
  ps.currentSpeedMach = 0.73;
  ps.currentAltitudeFt = 801;
  ps.currentRadarAltitudeFt = 137;
  ps.currentFuelState = 0.55;
  ps.takeoffLocation = 'UGKO';
  // Performance highs
  ps.highestSpeedKts = 556;
  ps.highestSpeedMach = 0.89;
  ps.highestAltitudeFt = 899;
  // Navigation / distances
  ps.sortieDistanceKm = 111.1;
  ps.noeDistanceKm = 22.2;
  // Combat
  ps.sortieAamFiredCount = 13;
  ps.longestWeaponHit = 9.7;
  ps.longestMissileHit = 18.5;
  ps.longestGunBurstSeconds = 4.1;
  // Carrier ops — trapCount/nightTrapCount/consecutiveBolters/fuelAtTrap are getters derived from passes
  // 5 night traps + 2 day traps = 7 total; last trap carries the fuelAtTrap sentinel (0.12)
  for (let i = 0; i < 5; i++) ps.passes.push({ lsoGrade: 'OK', wire: 3, night: true, fuelState: 0.5 });
  ps.passes.push({ lsoGrade: 'OK', wire: 3, night: false, fuelState: 0.7 });
  ps.passes.push({ lsoGrade: 'OK', wire: 3, night: false, fuelState: 0.12 }); // fuelAtTrap sentinel
  for (let i = 0; i < 3; i++) ps.passes.push({ lsoGrade: 'B', wire: null, night: false, fuelState: null });
  ps.launchedFromCarrier = true;
  // Refuelling
  ps.lastRefuelFuelGain = 0.08;
  ps.lastRefuelContactDurationSeconds = 45.3;
  ps.longestRefuelContactSeconds = 60.5;
  return ps;
}

// ─── coverage test ───────────────────────────────────────────────────────────
// Builds a fully-populated PilotState, serializes it through AchievementEngine
// (the same path the live system uses), then renders it and asserts every field
// produces a visible value. If a new field is added to serializeState but not
// wired into a render function, its sentinel value will not appear and this
// test will fail.

describe('telemetryRenderFns — all serialized fields are visible', () => {
  let html;

  beforeAll(() => {
    const engine = new AchievementEngine([]);
    const serialized = engine.serializeState(buildPopulatedState());
    html = renderPilotState({ name: 'Maverick', ucid: 'p1', state: serialized });
  });

  describe('Flight Telemetry', () => {
    it('renders status', () => expect(html).toContain('Airborne'));
    it('renders takeoff location', () => expect(html).toContain('UGKO'));
    it('renders speed (kts)', () => expect(html).toContain(fmt(444, 0)));
    it('renders speed (Mach)', () => expect(html).toContain(fmt(0.73, 2)));
    it('renders baro altitude', () => expect(html).toContain(fmt(801, 0)));
    it('renders radar altitude', () => expect(html).toContain(fmt(137, 0)));
    it('renders fuel state', () => expect(html).toContain(fmtPct(0.55)));
  });

  describe('Combat', () => {
    it('renders AAMs fired', () => expect(html).toContain('>13<'));
    it('renders longest missile hit', () => expect(html).toContain(fmt(18.5)));
    it('renders longest weapon hit', () => expect(html).toContain(fmt(9.7)));
    it('renders longest gun burst', () => expect(html).toContain(fmt(4.1)));
  });

  describe('Carrier Ops', () => {
    it('renders trap count', () => expect(html).toContain('>7<'));
    it('renders night trap count', () => expect(html).toContain('>5<'));
    it('renders consecutive bolters', () => expect(html).toContain('>3<'));
    it('renders fuel at trap', () => expect(html).toContain(fmtPct(0.12)));
    it('renders launched from carrier', () => expect(html).toContain('Yes'));
  });

  describe('Refuelling', () => {
    it('renders last fuel gain', () => expect(html).toContain(fmtPct(0.08)));
    it('renders last contact duration', () => expect(html).toContain(fmt(45.3)));
  });

  describe('Navigation', () => {
    it('renders sortie distance', () => expect(html).toContain(fmt(111.1)));
    it('renders NOE distance', () => expect(html).toContain(fmt(22.2)));
  });

  describe('Session Bests (gauges)', () => {
    it('renders highest speed kts', () => expect(html).toContain(fmt(556, 0)));
    it('renders highest speed Mach', () => expect(html).toContain(fmt(0.89, 2)));
    it('renders highest altitude', () => expect(html).toContain(fmt(899, 0)));
    it('renders longest missile hit in gauges', () => expect(html).toContain(fmt(18.5)));
    it('renders longest weapon hit in gauges', () => expect(html).toContain(fmt(9.7)));
    it('renders longest gun burst in gauges', () => expect(html).toContain(fmt(4.1)));
    it('renders longest refuel contact', () => expect(html).toContain(fmt(60.5)));
    it('renders sortie distance in gauges', () => expect(html).toContain(fmt(111.1)));
    it('renders NOE distance in gauges', () => expect(html).toContain(fmt(22.2)));
  });
});

// ─── Combat kills table ──────────────────────────────────────────────────────

describe('renderCombat', () => {
  it('drops collateral kills with no victim identity and shows the weapon + metadata', () => {
    const html = renderCombat({
      kills: [
        { victimUnitCategory: 'ground', victimTypeName: 'T-55', weaponName: 'AGM-114K', weaponDescRaw: { category: 1, guidance: 7 } },
        { victimUnitCategory: 'other' }, // collateral / scenery — filtered out
      ],
    });
    expect(html).toContain('T-55');
    expect(html).toContain('AGM-114K');
    expect(html).toContain('Missile · Laser');
    // Header row + the single real kill row; the collateral kill is filtered out.
    expect((html.match(/<tr>/g) || []).length).toBe(2);
  });

  it('shows the empty state when there are only collateral kills', () => {
    const html = renderCombat({ kills: [{ victimUnitCategory: 'other' }] });
    expect(html).toContain('No kills this sortie');
  });
});

// ─── Shot Tracker (attribution) ──────────────────────────────────────────────

describe('renderWeaponTracker', () => {
  it('shows the empty state when no weapons have been fired', () => {
    expect(renderWeaponTracker({ weapons: [] })).toContain('No weapons fired');
    expect(renderWeaponTracker({})).toContain('No weapons fired');
  });

  it('renders each fired weapon with its outcome, metadata and distance', () => {
    const html = renderWeaponTracker({
      weapons: [
        { weaponName: 'AGM-114K', outcome: 'killed', distanceNm: 3.4, descRaw: { category: 1, guidance: 7 } },
        { weaponName: 'AIM-9X', outcome: 'in_flight' },
        { weaponName: 'AIM-120C', outcome: 'miss' },
      ],
    });
    expect(html).toContain('AGM-114K');
    expect(html).toContain('KILLED');
    expect(html).toContain('3.4 nm');
    expect(html).toContain('IN FLIGHT');
    expect(html).toContain('MISS');
    expect(html).toContain('Missile · Laser'); // guidance 7 → Laser (corrected enum)
  });

  it('escapes weapon names', () => {
    const html = renderWeaponTracker({ weapons: [{ weaponName: '<script>', outcome: 'in_flight' }] });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('shows an active gun burst with its weapon type', () => {
    const html = renderWeaponTracker({ weapons: [], gunBurst: { weaponName: 'GAU-8', active: true } });
    expect(html).toContain('Gun burst');
    expect(html).toContain('GAU-8');
    expect(html).toContain('FIRING');
  });
});

// ─── fmt / fmtPct ────────────────────────────────────────────────────────────

describe('fmt', () => {
  it('formats null as em-dash', () => expect(fmt(null)).toBe('—'));
  it('formats undefined as em-dash', () => expect(fmt(undefined)).toBe('—'));
  it('formats Infinity as em-dash', () => expect(fmt(Infinity)).toBe('—'));
  it('formats boolean true as Yes', () => expect(fmt(true)).toBe('Yes'));
  it('formats boolean false as No', () => expect(fmt(false)).toBe('No'));
  it('formats number with default 1 decimal', () => expect(fmt(1.23456)).toBe('1.2'));
  it('formats number with 2 decimals', () => expect(fmt(1.23456, 2)).toBe('1.23'));
  it('formats string passthrough', () => expect(fmt('UGKO')).toBe('UGKO'));
});

describe('fmtPct', () => {
  it('formats null as em-dash', () => expect(fmtPct(null)).toBe('—'));
  it('formats 0.55 as 55.0%', () => expect(fmtPct(0.55)).toBe('55.0%'));
  it('formats 0 as 0.0%', () => expect(fmtPct(0)).toBe('0.0%'));
});
