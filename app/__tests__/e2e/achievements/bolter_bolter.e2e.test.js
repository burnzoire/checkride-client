jest.mock('electron-log', () => ({ info: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../../factories/eventFactory', () => ({
  EventFactory: {
    create: jest.fn().mockResolvedValue({
      prepare: () => ({ event: { event_type: 'grading', event_data: {} } }),
    }),
  },
  InvalidEventTypeError: class InvalidEventTypeError extends Error {},
}));

const { makePipeline, sendAll, grading, bolter, waveOff, savedAchievementIds } = require('./helpers');

describe('e2e — bolter_bolter', () => {
  it('unlocks on two consecutive bolters', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [bolter(), bolter()]);
    expect(savedAchievementIds(apiClient)).toContain('bolter_bolter');
  });

  it('does NOT unlock on a single bolter', async () => {
    const { udpServer, apiClient } = makePipeline();
    await udpServer.onEvent(bolter());
    expect(savedAchievementIds(apiClient)).not.toContain('bolter_bolter');
  });

  it('does NOT unlock when a trap resets the streak', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [bolter(), grading(), bolter()]);
    expect(savedAchievementIds(apiClient)).not.toContain('bolter_bolter');
  });

  it('does NOT unlock when a wave-off resets the streak', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [bolter(), waveOff(), bolter()]);
    expect(savedAchievementIds(apiClient)).not.toContain('bolter_bolter');
  });

  it('unlocks on three consecutive bolters (fires on second)', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [bolter(), bolter(), bolter()]);
    expect(savedAchievementIds(apiClient)).toContain('bolter_bolter');
  });

  it('fires exactly once per session regardless of bolter count', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, Array.from({ length: 6 }, () => bolter()));
    const saves = apiClient.saveAchievement.mock.calls.filter(
      ([arg]) => arg.achievementId === 'bolter_bolter',
    );
    expect(saves).toHaveLength(1);
  });
});
