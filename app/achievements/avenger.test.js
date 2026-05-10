const avenger = require('./avenger');
const PilotState = require('../services/pilotState');
const AchievementEngine = require('../services/achievementEngine');

// ─── helpers ────────────────────────────────────────────────────────────────

function killEvent(overrides = {}) {
  return {
    type: 'kill_enrichment',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    victimUnitCategory: 'air',
    victimObjectId: 42,
    isEnemy: true,
    missionTime: 200,
    ...overrides,
  };
}

function friendlyKilledEvent(overrides = {}) {
  return {
    type: 'friendly_killed_enrichment',
    killerObjectId: 42,
    killerTypeName: 'MiG-29',
    victimPlayerName: 'Goose',
    victimPlayerUcid: 'goose-ucid',
    missionTime: 100,
    ...overrides,
  };
}

function stateWithKills(kills) {
  const state = new PilotState();
  state.kills = kills;
  return state;
}

// ─── metadata ────────────────────────────────────────────────────────────────

describe('Avenger — metadata', () => {
  it('has id avenger', () => {
    expect(avenger.id).toBe('avenger');
  });

  it('has triggerType kill_enrichment', () => {
    expect(avenger.triggerType).toBe('kill_enrichment');
  });
});

// ─── evaluate logic ──────────────────────────────────────────────────────────

describe('Avenger — evaluate', () => {
  it('returns true when the kill has avengedFriendly set', () => {
    const state = stateWithKills([{ avengedFriendly: true }]);
    expect(avenger.evaluate(killEvent(), state)).toBe(true);
  });

  it('returns false when no kills have avengedFriendly', () => {
    const state = stateWithKills([{ avengedFriendly: false }, { avengedFriendly: false }]);
    expect(avenger.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false with empty kills array', () => {
    const state = stateWithKills([]);
    expect(avenger.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns true if any kill in a multi-kill sortie is an avenge kill', () => {
    const state = stateWithKills([
      { avengedFriendly: false },
      { avengedFriendly: true },
    ]);
    expect(avenger.evaluate(killEvent(), state)).toBe(true);
  });
});

// ─── engine integration ──────────────────────────────────────────────────────

describe('Avenger — engine integration', () => {
  it('unlocks when a friendly_killed_enrichment precedes a kill of the same object', () => {
    const engine = new AchievementEngine([avenger]);

    engine.evaluate(friendlyKilledEvent({ killerObjectId: 99 }));
    const unlocked = engine.evaluate(killEvent({ victimObjectId: 99 }));

    expect(unlocked.map(a => a.id)).toContain('avenger');
  });

  it('does not unlock when victim object ID does not match the killer', () => {
    const engine = new AchievementEngine([avenger]);

    engine.evaluate(friendlyKilledEvent({ killerObjectId: 99 }));
    const unlocked = engine.evaluate(killEvent({ victimObjectId: 77 }));

    expect(unlocked.map(a => a.id)).not.toContain('avenger');
  });

  it('does not unlock without a preceding friendly_killed_enrichment', () => {
    const engine = new AchievementEngine([avenger]);

    const unlocked = engine.evaluate(killEvent({ victimObjectId: 42 }));
    expect(unlocked.map(a => a.id)).not.toContain('avenger');
  });

  it('friendly_killed_enrichment alone returns empty array', () => {
    const engine = new AchievementEngine([avenger]);
    const unlocked = engine.evaluate(friendlyKilledEvent());
    expect(unlocked).toEqual([]);
  });

  it('unlocks when an AI friendly aircraft is the victim (no victimPlayerName)', () => {
    const engine = new AchievementEngine([avenger]);

    engine.evaluate({ type: 'friendly_killed_enrichment', killerObjectId: 55 });
    const unlocked = engine.evaluate(killEvent({ victimObjectId: 55 }));

    expect(unlocked.map(a => a.id)).toContain('avenger');
  });

  it('does not unlock when the kill happened before the friendly died in mission time', () => {
    const engine = new AchievementEngine([avenger]);

    engine.evaluate(friendlyKilledEvent({ killerObjectId: 99, missionTime: 500 }));
    const unlocked = engine.evaluate(killEvent({ victimObjectId: 99, missionTime: 300 }));

    expect(unlocked.map(a => a.id)).not.toContain('avenger');
  });
});
