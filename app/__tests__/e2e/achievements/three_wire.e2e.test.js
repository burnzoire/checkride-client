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

describe('e2e — three_wire', () => {
  it('unlocks on wire 3 on the first pass', async () => {
    const { udpServer, apiClient } = makePipeline();
    await udpServer.onEvent(grading({ wire: 3 }));
    expect(savedAchievementIds(apiClient)).toContain('three_wire');
  });

  it('does NOT unlock on wire 1', async () => {
    const { udpServer, apiClient } = makePipeline();
    await udpServer.onEvent(grading({ wire: 1 }));
    expect(savedAchievementIds(apiClient)).not.toContain('three_wire');
  });

  it('does NOT unlock on wire 2', async () => {
    const { udpServer, apiClient } = makePipeline();
    await udpServer.onEvent(grading({ wire: 2 }));
    expect(savedAchievementIds(apiClient)).not.toContain('three_wire');
  });

  it('does NOT unlock on wire 4', async () => {
    const { udpServer, apiClient } = makePipeline();
    await udpServer.onEvent(grading({ wire: 4 }));
    expect(savedAchievementIds(apiClient)).not.toContain('three_wire');
  });

  it('unlocks on first wire-3 even after prior non-3 traps', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [
      grading({ wire: 2 }),
      grading({ wire: 4 }),
      grading({ wire: 3 }),
    ]);
    expect(savedAchievementIds(apiClient)).toContain('three_wire');
  });

  it('does NOT unlock on a bolter (wire is null)', async () => {
    const { udpServer, apiClient } = makePipeline();
    await udpServer.onEvent(bolter());
    expect(savedAchievementIds(apiClient)).not.toContain('three_wire');
  });
});
