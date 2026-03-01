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

describe('e2e — joker_state', () => {
  it('unlocks when trapping with fuelState < 0.1', async () => {
    const { udpServer, apiClient } = makePipeline();
    await udpServer.onEvent(grading({ fuelState: 0.05 }));
    expect(savedAchievementIds(apiClient)).toContain('joker_state');
  });

  it('does NOT unlock when fuelState is exactly 0.1', async () => {
    const { udpServer, apiClient } = makePipeline();
    await udpServer.onEvent(grading({ fuelState: 0.1 }));
    expect(savedAchievementIds(apiClient)).not.toContain('joker_state');
  });

  it('does NOT unlock when fuelState is above 0.1', async () => {
    const { udpServer, apiClient } = makePipeline();
    await udpServer.onEvent(grading({ fuelState: 0.5 }));
    expect(savedAchievementIds(apiClient)).not.toContain('joker_state');
  });

  it('does NOT unlock when fuelState is absent (null)', async () => {
    const { udpServer, apiClient } = makePipeline();
    await udpServer.onEvent(grading({ fuelState: null }));
    expect(savedAchievementIds(apiClient)).not.toContain('joker_state');
  });

  it('does NOT unlock on a bolter even with critically low fuel', async () => {
    const { udpServer, apiClient } = makePipeline();
    await udpServer.onEvent(bolter({ fuelState: 0.01 }));
    expect(savedAchievementIds(apiClient)).not.toContain('joker_state');
  });

  it('unlocks at the edge: fuelState just below 0.1', async () => {
    const { udpServer, apiClient } = makePipeline();
    await udpServer.onEvent(grading({ fuelState: 0.099 }));
    expect(savedAchievementIds(apiClient)).toContain('joker_state');
  });

  it('fires exactly once per session', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, Array.from({ length: 5 }, () => grading({ fuelState: 0.02 })));
    const saves = apiClient.saveAchievement.mock.calls.filter(
      ([arg]) => arg.achievementId === 'joker_state',
    );
    expect(saves).toHaveLength(1);
  });
});
