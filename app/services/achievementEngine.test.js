jest.mock('electron-log', () => ({ info: jest.fn(), error: jest.fn() }));

const AchievementEngine = require('./achievementEngine');
const Achievement = require('../achievements/achievement');

// ─── helpers ────────────────────────────────────────────────────────────────

function grading(overrides = {}) {
  return {
    type: 'grading',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    lsoGrade: 'OK',
    wire: 3,
    night: false,
    fuelState: null,
    ...overrides,
  };
}

function bolterEvent(overrides = {}) {
  return grading({ lsoGrade: 'B', wire: null, ...overrides });
}

function waveOffEvent(overrides = {}) {
  return grading({ lsoGrade: 'WO', wire: null, ...overrides });
}

// Minimal stub achievement for testing engine mechanics
class StubAchievement extends Achievement {
  constructor(id, evaluateFn) {
    super({ id, name: id, description: id });
    this._evaluateFn = evaluateFn;
  }
  evaluate(event, state) {
    return this._evaluateFn(event, state);
  }
}

// ─── engine mechanics ────────────────────────────────────────────────────────

describe('AchievementEngine — core mechanics', () => {
  it('returns empty array for unknown event types', () => {
    const engine = new AchievementEngine([]);
    expect(engine.evaluate({ type: 'kill', playerUcid: 'p1' })).toEqual([]);
    expect(engine.evaluate({ type: 'landing', playerUcid: 'p1' })).toEqual([]);
  });

  it('processes takeoff_enrichment without triggering grading achievements', () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    const result = engine.evaluate({
      type: 'takeoff_enrichment',
      playerUcid: 'p1',
      launchedFromCarrier: true,
      carrierName: 'CVN-71',
    });
    expect(result).toHaveLength(0); // no achievement registered for takeoff_enrichment
  });

  it('processes kill_enrichment without triggering grading achievements', () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    const result = engine.evaluate({
      type: 'kill_enrichment',
      playerUcid: 'p1',
      victimUnitCategory: 'air',
      carrierDistanceNm: 10,
    });
    expect(result).toHaveLength(0); // grading achievement not triggered by kill_enrichment
  });

  it('passes kill_enrichment event to achievements registered with triggerType kill_enrichment', () => {
    const killAchievement = new StubAchievement('kill_achv', () => true);
    killAchievement.triggerType = 'kill_enrichment';
    const engine = new AchievementEngine([killAchievement]);
    const result = engine.evaluate({
      type: 'kill_enrichment',
      playerUcid: 'p1',
      victimUnitCategory: 'air',
      carrierDistanceNm: 10,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('kill_achv');
  });

  it('returns empty array when playerUcid is missing', () => {
    const engine = new AchievementEngine([]);
    expect(engine.evaluate({ type: 'grading' })).toEqual([]);
  });

  it('returns unlocked achievement on first qualifying event', () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    const result = engine.evaluate(grading());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('always');
  });

  it('does NOT fire the same achievement twice for the same pilot', () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    engine.evaluate(grading());
    const second = engine.evaluate(grading());
    expect(second).toHaveLength(0);
  });

  it('fires achievement independently for different pilots', () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    engine.evaluate(grading({ playerUcid: 'pilot-1' }));
    const result = engine.evaluate(grading({ playerUcid: 'pilot-2' }));
    expect(result[0].id).toBe('always');
  });

  it('swallows errors thrown by a buggy achievement', () => {
    const broken = new StubAchievement('broken', () => { throw new Error('oops'); });
    const engine = new AchievementEngine([broken]);
    expect(() => engine.evaluate(grading())).not.toThrow();
    expect(engine.evaluate(grading())).toEqual([]);
  });

  it('resetPilot clears state so the achievement can fire again', () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    engine.evaluate(grading({ playerUcid: 'pilot-1' }));
    engine.resetPilot('pilot-1');
    const result = engine.evaluate(grading({ playerUcid: 'pilot-1' }));
    expect(result[0].id).toBe('always');
  });
});

// ─── carrier_qualified ───────────────────────────────────────────────────────

describe('carrier_qualified achievement', () => {
  const ALL = require('../achievements');
  const carrierQualified = ALL.find(a => a.id === 'carrier_qualified');

  it('unlocks on the 6th trap', () => {
    const engine = new AchievementEngine([carrierQualified]);
    for (let i = 1; i <= 5; i++) {
      const result = engine.evaluate(grading());
      expect(result).toHaveLength(0);
    }
    const result = engine.evaluate(grading());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('carrier_qualified');
  });

  it('does not unlock on bolters', () => {
    const engine = new AchievementEngine([carrierQualified]);
    for (let i = 0; i < 10; i++) {
      engine.evaluate(bolterEvent());
    }
    expect(engine.unlockedByPilot.get('pilot-1')).not.toContain('carrier_qualified');
  });
});

// ─── night_qualified ─────────────────────────────────────────────────────────

describe('night_qualified achievement', () => {
  const ALL = require('../achievements');
  const nightQualified = ALL.find(a => a.id === 'night_qualified');

  it('unlocks on the 2nd night trap', () => {
    const engine = new AchievementEngine([nightQualified]);
    for (let i = 1; i <= 1; i++) {
      expect(engine.evaluate(grading({ night: true }))).toHaveLength(0);
    }
    expect(engine.evaluate(grading({ night: true }))).toHaveLength(1);
  });

  it('does not count daytime traps toward night qualification', () => {
    const engine = new AchievementEngine([nightQualified]);
    for (let i = 0; i < 6; i++) {
      engine.evaluate(grading({ night: false }));
    }
    expect(engine.evaluate(grading({ night: false }))).toHaveLength(0);
  });
});

// ─── three_wire ──────────────────────────────────────────────────────────────

describe('three_wire achievement', () => {
  const ALL = require('../achievements');
  const threeWire = ALL.find(a => a.id === 'three_wire');

  it('unlocks when wire is 3', () => {
    const engine = new AchievementEngine([threeWire]);
    expect(engine.evaluate(grading({ wire: 3 }))[0].id).toBe('three_wire');
  });

  it('does not unlock for wire 2', () => {
    const engine = new AchievementEngine([threeWire]);
    expect(engine.evaluate(grading({ wire: 2 }))).toHaveLength(0);
  });

  it('does not unlock for wire 4', () => {
    const engine = new AchievementEngine([threeWire]);
    expect(engine.evaluate(grading({ wire: 4 }))).toHaveLength(0);
  });
});

// ─── comeback_kid ────────────────────────────────────────────────────────────

describe('comeback_kid achievement', () => {
  const ALL = require('../achievements');
  const comebackKid = ALL.find(a => a.id === 'comeback_kid');

  it('unlocks when a trap follows a bolter', () => {
    const engine = new AchievementEngine([comebackKid]);
    engine.evaluate(bolterEvent());
    expect(engine.evaluate(grading())[0].id).toBe('comeback_kid');
  });

  it('does not unlock on first trap with no prior bolter', () => {
    const engine = new AchievementEngine([comebackKid]);
    expect(engine.evaluate(grading())).toHaveLength(0);
  });

  it('does not unlock trap → trap (no bolter in between)', () => {
    const engine = new AchievementEngine([comebackKid]);
    engine.evaluate(grading());
    expect(engine.evaluate(grading())).toHaveLength(0);
  });

  it('does not unlock bolter → bolter', () => {
    const engine = new AchievementEngine([comebackKid]);
    engine.evaluate(bolterEvent());
    expect(engine.evaluate(bolterEvent())).toHaveLength(0);
  });

  it('does not unlock bolter → wave-off (no trap)', () => {
    const engine = new AchievementEngine([comebackKid]);
    engine.evaluate(bolterEvent());
    expect(engine.evaluate(waveOffEvent())).toHaveLength(0);
  });
});

// ─── bolter_bolter ───────────────────────────────────────────────────────────

describe('bolter_bolter achievement', () => {
  const ALL = require('../achievements');
  const bolterBolter = ALL.find(a => a.id === 'bolter_bolter');

  it('unlocks on the second consecutive bolter', () => {
    const engine = new AchievementEngine([bolterBolter]);
    engine.evaluate(bolterEvent());
    expect(engine.evaluate(bolterEvent())[0].id).toBe('bolter_bolter');
  });

  it('does not unlock on a single bolter', () => {
    const engine = new AchievementEngine([bolterBolter]);
    expect(engine.evaluate(bolterEvent())).toHaveLength(0);
  });

  it('does not unlock when streak is broken by a trap', () => {
    const engine = new AchievementEngine([bolterBolter]);
    engine.evaluate(bolterEvent());
    engine.evaluate(grading());          // resets streak
    expect(engine.evaluate(bolterEvent())).toHaveLength(0);
  });

  it('does not unlock when streak is broken by a wave-off', () => {
    const engine = new AchievementEngine([bolterBolter]);
    engine.evaluate(bolterEvent());
    engine.evaluate(waveOffEvent());     // resets streak
    expect(engine.evaluate(bolterEvent())).toHaveLength(0);
  });
});

// ─── barely_recovered ────────────────────────────────────────────────────────

describe('barely_recovered achievement', () => {
  const ALL = require('../achievements');
  const barelyRecovered = ALL.find(a => a.id === 'barely_recovered');

  it('unlocks when fuelState < 0.05 on a trap', () => {
    const engine = new AchievementEngine([barelyRecovered]);
    expect(engine.evaluate(grading({ fuelState: 0.04 }))[0].id).toBe('barely_recovered');
  });

  it('does not unlock when fuelState >= 0.05', () => {
    const engine = new AchievementEngine([barelyRecovered]);
    expect(engine.evaluate(grading({ fuelState: 0.15 }))).toHaveLength(0);
  });

  it('does not unlock when fuelState is absent', () => {
    const engine = new AchievementEngine([barelyRecovered]);
    expect(engine.evaluate(grading({ fuelState: null }))).toHaveLength(0);
  });

  it('does not unlock on a bolter even with low fuel', () => {
    const engine = new AchievementEngine([barelyRecovered]);
    expect(engine.evaluate(bolterEvent({ fuelState: 0.02 }))).toHaveLength(0);
  });

  it('does not unlock at exactly 0.05 fuel (must be strictly less)', () => {
    const engine = new AchievementEngine([barelyRecovered]);
    expect(engine.evaluate(grading({ fuelState: 0.05 }))).toHaveLength(0);
  });
});

// ─── loadAchievementsFromApi ─────────────────────────────────────────────────

describe('AchievementEngine — loadAchievementsFromApi', () => {
  it('pre-populates the unlocked set so already-earned achievements do not fire again', async () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    const apiClient = {
      fetchPilotAchievements: jest.fn().mockResolvedValue({ achievement_ids: ['always'] }),
    };

    await engine.loadAchievementsFromApi('pilot-1', apiClient);

    expect(apiClient.fetchPilotAchievements).toHaveBeenCalledWith('pilot-1');
    // 'always' is already in the unlocked set — evaluate should not fire it again
    expect(engine.evaluate(grading({ playerUcid: 'pilot-1' }))).toHaveLength(0);
  });

  it('allows achievements not in the API list to still fire', async () => {
    const a = new StubAchievement('a', () => true);
    const b = new StubAchievement('b', () => true);
    const engine = new AchievementEngine([a, b]);
    const apiClient = {
      fetchPilotAchievements: jest.fn().mockResolvedValue({ achievement_ids: ['a'] }),
    };

    await engine.loadAchievementsFromApi('pilot-1', apiClient);

    const result = engine.evaluate(grading({ playerUcid: 'pilot-1' }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('handles an empty achievement_ids list without error', async () => {
    const engine = new AchievementEngine([]);
    const apiClient = {
      fetchPilotAchievements: jest.fn().mockResolvedValue({ achievement_ids: [] }),
    };

    await expect(engine.loadAchievementsFromApi('pilot-1', apiClient)).resolves.toBeUndefined();
  });

  it('handles a null/missing achievement_ids gracefully', async () => {
    const always = new StubAchievement('always', () => true);
    const engine = new AchievementEngine([always]);
    const apiClient = {
      fetchPilotAchievements: jest.fn().mockResolvedValue({}),
    };

    await engine.loadAchievementsFromApi('pilot-1', apiClient);

    // Should still be able to fire since no achievements were pre-loaded
    expect(engine.evaluate(grading({ playerUcid: 'pilot-1' }))).toHaveLength(1);
  });
});
