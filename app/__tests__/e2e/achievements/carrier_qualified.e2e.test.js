jest.mock('electron-log', () => ({ info: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../../factories/eventFactory', () => ({
  EventFactory: {
    create: jest.fn().mockResolvedValue({
      prepare: () => ({ event: { event_type: 'grading', event_data: {} } }),
    }),
  },
  InvalidEventTypeError: class InvalidEventTypeError extends Error {},
}));

const { makePipeline, sendAll, grading, bolter, savedAchievementIds } = require('./helpers');

describe('e2e — carrier_qualified', () => {
  it('unlocks after 6 traps in one session', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, Array.from({ length: 6 }, () => grading({ wire: 2 })));
    expect(savedAchievementIds(apiClient)).toContain('carrier_qualified');
  });

  it('does NOT unlock on the 5th trap', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, Array.from({ length: 5 }, () => grading({ wire: 2 })));
    expect(savedAchievementIds(apiClient)).not.toContain('carrier_qualified');
  });

  it('bolters do not count toward the trap tally', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [
      ...Array.from({ length: 5 }, () => grading({ wire: 2 })),
      ...Array.from({ length: 10 }, () => bolter()),
    ]);
    expect(savedAchievementIds(apiClient)).not.toContain('carrier_qualified');
  });

  it('fires exactly once per session even if more traps follow', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, Array.from({ length: 10 }, () => grading({ wire: 2 })));
    const saves = apiClient.saveAchievement.mock.calls.filter(
      ([arg]) => arg.achievementId === 'carrier_qualified',
    );
    expect(saves).toHaveLength(1);
  });

  it('tracks traps independently per pilot', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, Array.from({ length: 6 }, () => grading({ playerUcid: 'pilot-1', wire: 2 })));
    await sendAll(udpServer, Array.from({ length: 3 }, () => grading({ playerUcid: 'pilot-2', wire: 2 })));
    expect(savedAchievementIds(apiClient, 'pilot-1')).toContain('carrier_qualified');
    expect(savedAchievementIds(apiClient, 'pilot-2')).not.toContain('carrier_qualified');
  });

  it('saveAchievement is called with correct shape', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, Array.from({ length: 6 }, () => grading({ wire: 4 })));
    const call = apiClient.saveAchievement.mock.calls.find(
      ([arg]) => arg.achievementId === 'carrier_qualified',
    );
    expect(call[0]).toEqual({
      playerUcid: 'pilot-1',
      achievementId: 'carrier_qualified',
      earnedAt: expect.any(String),
    });
  });
});
