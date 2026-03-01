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

describe('e2e — comeback_kid', () => {
  it('unlocks when a trap follows a bolter', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [bolter(), grading()]);
    expect(savedAchievementIds(apiClient)).toContain('comeback_kid');
  });

  it('does NOT unlock on a first trap with no prior bolter', async () => {
    const { udpServer, apiClient } = makePipeline();
    await udpServer.onEvent(grading());
    expect(savedAchievementIds(apiClient)).not.toContain('comeback_kid');
  });

  it('does NOT unlock on trap → trap (no bolter)', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [grading(), grading()]);
    expect(savedAchievementIds(apiClient)).not.toContain('comeback_kid');
  });

  it('does NOT unlock on bolter → bolter', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [bolter(), bolter()]);
    expect(savedAchievementIds(apiClient)).not.toContain('comeback_kid');
  });

  it('does NOT unlock on bolter → wave-off (not a trap)', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [bolter(), waveOff()]);
    expect(savedAchievementIds(apiClient)).not.toContain('comeback_kid');
  });

  it('unlocks even when the comeback trap is on a different wire', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [bolter(), grading({ wire: 4 })]);
    expect(savedAchievementIds(apiClient)).toContain('comeback_kid');
  });

  it('does NOT unlock if a wave-off separates the bolter from the trap', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [bolter(), waveOff(), grading()]);
    expect(savedAchievementIds(apiClient)).not.toContain('comeback_kid');
  });

  it('fires exactly once per session', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [bolter(), grading(), bolter(), grading()]);
    const saves = apiClient.saveAchievement.mock.calls.filter(
      ([arg]) => arg.achievementId === 'comeback_kid',
    );
    expect(saves).toHaveLength(1);
  });
});
