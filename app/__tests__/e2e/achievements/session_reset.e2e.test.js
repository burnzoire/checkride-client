jest.mock('electron-log', () => ({ info: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../../factories/eventFactory', () => ({
  EventFactory: {
    create: jest.fn().mockResolvedValue({
      prepare: () => ({ event: { event_type: 'grading', event_data: {} } }),
    }),
  },
  InvalidEventTypeError: class InvalidEventTypeError extends Error {},
}));

const { makePipeline, sendAll, grading, bolter, connect, savedAchievementIds } = require('./helpers');

describe('e2e — session reset on connect', () => {
  it('clears trap count so carrier_qualified does not fire on first trap of session 2', async () => {
    const { udpServer, apiClient } = makePipeline();

    // Session 1: 5 traps (one short of carrier_qualified)
    await sendAll(udpServer, Array.from({ length: 5 }, () => grading({ wire: 2 })));
    expect(savedAchievementIds(apiClient)).not.toContain('carrier_qualified');

    // Reconnect — state must reset
    await udpServer.onEvent(connect());

    // Session 2: only 1 trap — should NOT trigger carrier_qualified
    await sendAll(udpServer, [grading({ wire: 2 })]);
    expect(savedAchievementIds(apiClient)).not.toContain('carrier_qualified');
  });

  it('carrier_qualified can be earned in session 2 after completing 6 new traps', async () => {
    const { udpServer, apiClient } = makePipeline();

    // Session 1: 5 traps
    await sendAll(udpServer, Array.from({ length: 5 }, () => grading({ wire: 2 })));
    await udpServer.onEvent(connect());

    // Session 2: 6 fresh traps
    await sendAll(udpServer, Array.from({ length: 6 }, () => grading({ wire: 2 })));
    expect(savedAchievementIds(apiClient)).toContain('carrier_qualified');
  });

  it('clears bolter streak so bolter_bolter does not fire on first bolter of session 2', async () => {
    const { udpServer, apiClient } = makePipeline();

    // Session 1: 1 bolter (one short of bolter_bolter)
    await sendAll(udpServer, [bolter()]);
    expect(savedAchievementIds(apiClient)).not.toContain('bolter_bolter');

    await udpServer.onEvent(connect());

    // Session 2: 1 bolter — streak should have reset, no bolter_bolter
    await sendAll(udpServer, [bolter()]);
    expect(savedAchievementIds(apiClient)).not.toContain('bolter_bolter');
  });

  it('bolter_bolter fires normally within session 2 after reset', async () => {
    const { udpServer, apiClient } = makePipeline();

    await sendAll(udpServer, [bolter()]);
    await udpServer.onEvent(connect());

    // Two consecutive bolters in session 2 — should fire
    await sendAll(udpServer, [bolter(), bolter()]);
    expect(savedAchievementIds(apiClient)).toContain('bolter_bolter');
  });

  it('already-earned achievements loaded from API are not re-awarded after reconnect', async () => {
    const { udpServer, apiClient, achievementEngine } = makePipeline();

    // Simulate API returning carrier_qualified as already earned
    apiClient.fetchPilotAchievements.mockResolvedValue({
      achievement_ids: ['carrier_qualified'],
    });

    await udpServer.onEvent(connect());

    // 6 traps in this session — carrier_qualified should NOT fire again
    await sendAll(udpServer, Array.from({ length: 6 }, () => grading({ wire: 2 })));
    expect(savedAchievementIds(apiClient)).not.toContain('carrier_qualified');
  });

  it('resets state independently per pilot', async () => {
    const { udpServer, apiClient } = makePipeline();

    // Both pilots accumulate 5 traps
    await sendAll(udpServer, Array.from({ length: 5 }, () => grading({ playerUcid: 'pilot-1', wire: 2 })));
    await sendAll(udpServer, Array.from({ length: 5 }, () => grading({ playerUcid: 'pilot-2', wire: 2 })));

    // Only pilot-1 reconnects
    await udpServer.onEvent(connect('pilot-1'));

    // pilot-1 gets 1 trap — no carrier_qualified (reset)
    await sendAll(udpServer, [grading({ playerUcid: 'pilot-1', wire: 2 })]);
    // pilot-2 gets 1 trap — fires carrier_qualified (state preserved)
    await sendAll(udpServer, [grading({ playerUcid: 'pilot-2', wire: 2 })]);

    expect(savedAchievementIds(apiClient, 'pilot-1')).not.toContain('carrier_qualified');
    expect(savedAchievementIds(apiClient, 'pilot-2')).toContain('carrier_qualified');
  });
});
