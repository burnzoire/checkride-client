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

describe('e2e — textbook_trap', () => {
  it('unlocks on a perfect _OK_ 3-wire trap', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [grading({ lsoGrade: '_OK_', wire: 3 })]);
    expect(savedAchievementIds(apiClient)).toContain('textbook_trap');
  });

  it('does NOT unlock on _OK_ with a non-3 wire', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [grading({ lsoGrade: '_OK_', wire: 2 })]);
    expect(savedAchievementIds(apiClient)).not.toContain('textbook_trap');
  });

  it('does NOT unlock on 3-wire without an _OK_ grade', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [grading({ lsoGrade: 'OK', wire: 3 })]);
    expect(savedAchievementIds(apiClient)).not.toContain('textbook_trap');
  });

  it('fires exactly once per session', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [
      grading({ lsoGrade: '_OK_', wire: 3 }),
      grading({ lsoGrade: '_OK_', wire: 3 }),
      grading({ lsoGrade: '_OK_', wire: 3 }),
    ]);
    const saves = apiClient.saveAchievement.mock.calls.filter(
      ([arg]) => arg.achievementId === 'textbook_trap',
    );
    expect(saves).toHaveLength(1);
  });
});