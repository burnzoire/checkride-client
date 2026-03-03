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

describe('e2e — multiple achievements in one session', () => {
  it('three_wire and carrier_qualified both unlock in the same session', async () => {
    const { udpServer, apiClient } = makePipeline();
    // All traps on wire 3 → three_wire fires on first pass, carrier_qualified on 6th
    await sendAll(udpServer, Array.from({ length: 6 }, () => grading({ wire: 3 })));
    const ids = savedAchievementIds(apiClient);
    expect(ids).toContain('three_wire');
    expect(ids).toContain('carrier_qualified');
  });

  it('comeback_kid and bolter_bolter can coexist across different bolter sequences', async () => {
    const { udpServer, apiClient } = makePipeline();
    // bolter_bolter fires on 2nd bolter; comeback_kid fires on the subsequent trap
    await sendAll(udpServer, [bolter(), bolter(), grading()]);
    const ids = savedAchievementIds(apiClient);
    expect(ids).toContain('bolter_bolter');
    expect(ids).toContain('comeback_kid');
  });

  it('all achievable achievements unlock for a pilot in a single busy session', async () => {
    const { udpServer, apiClient } = makePipeline();
    await sendAll(udpServer, [
      // bolter_bolter: two consecutive bolters
      bolter(),
      bolter(),
      // comeback_kid: trap after the third bolter; three_wire + barely_recovered on same pass
      bolter(),
      grading({ wire: 3, fuelState: 0.04 }),
      // carrier_qualified: 5 more traps to reach 6 total
      grading({ wire: 2 }),
      grading({ wire: 2 }),
      grading({ wire: 2 }),
      grading({ wire: 2 }),
      grading({ wire: 2 }),
    ]);
    const ids = savedAchievementIds(apiClient);
    expect(ids).toContain('bolter_bolter');
    expect(ids).toContain('comeback_kid');
    expect(ids).toContain('three_wire');
    expect(ids).toContain('barely_recovered');
    expect(ids).toContain('carrier_qualified');
  });
});
