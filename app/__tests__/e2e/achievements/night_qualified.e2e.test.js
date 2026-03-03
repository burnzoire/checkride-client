jest.mock('electron-log', () => ({ info: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../../factories/eventFactory', () => ({
  EventFactory: {
    create: jest.fn().mockResolvedValue({
      prepare: () => ({ event: { event_type: 'grading', event_data: {} } }),
    }),
  },
  InvalidEventTypeError: class InvalidEventTypeError extends Error {},
}));

const { makePipeline, sendAll, grading, savedAchievementIds } = require('./helpers');

describe('e2e — night_qualified', () => {
  it('unlocks after 2 night traps', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, Array.from({ length: 2 }, () => grading({ night: true })));
    expect(savedAchievementIds(apiClient)).toContain('night_qualified');
  });

  it('does NOT unlock after 1 daytime traps', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, Array.from({ length: 1 }, () => grading({ night: false })));
    expect(savedAchievementIds(apiClient)).not.toContain('night_qualified');
  });

  it('daytime traps do not count toward the night tally', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [
      ...Array.from({ length: 1 }, () => grading({ night: true })),
      ...Array.from({ length: 1 }, () => grading({ night: false })),
    ]);
    expect(savedAchievementIds(apiClient)).not.toContain('night_qualified');
  });

  it('unlocks when night traps are mixed in with daytime ones', async () => {
    const { udpServer, apiClient } = makePipeline();
    const mixed = [
      grading({ night: false }),
      grading({ night: true }),
      grading({ night: false }),
      grading({ night: false }),
      grading({ night: false }),
      grading({ night: false }),
      grading({ night: true }),
    ];
    await sendAll(udpServer, mixed);
    expect(savedAchievementIds(apiClient)).toContain('night_qualified');
  });

  it('fires exactly once per session', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, Array.from({ length: 4 }, () => grading({ night: true })));
    const saves = apiClient.saveAchievement.mock.calls.filter(
      ([arg]) => arg.achievementId === 'night_qualified',
    );
    expect(saves).toHaveLength(1);
  });
});
