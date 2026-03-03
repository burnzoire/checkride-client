'use strict';

/**
 * Shared helpers for achievement e2e tests.
 * Each test file must set up its own jest.mock calls before requiring this.
 */

const { attachEventPipeline } = require('../../../appInit');
const AchievementEngine = require('../../../services/achievementEngine');

function makeClients() {
  return {
    apiClient: {
      saveEvent: jest.fn().mockResolvedValue({ publish: false, summary: null }),
      saveAchievement: jest.fn().mockResolvedValue({}),
      fetchPilotAchievements: jest.fn().mockResolvedValue({ achievement_ids: [] }),
    },
    discordClient: { send: jest.fn().mockResolvedValue() },
    dcsChatClient: { send: jest.fn().mockResolvedValue(), sendConfig: jest.fn().mockResolvedValue() },
  };
}

function makePipeline() {
  const clients = makeClients();
  const achievementEngine = new AchievementEngine(); // real achievements
  const udpServer = {};
  attachEventPipeline({ udpServer, ...clients, achievementEngine });
  return { udpServer, ...clients, achievementEngine };
}

/** Send a sequence of events and wait for each to settle. */
async function sendAll(udpServer, events) {
  for (const event of events) {
    await udpServer.onEvent(event);
  }
}

function grading(overrides = {}) {
  return {
    type: 'grading',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    lsoGrade: 'OK',
    wire: 3,
    night: false,
    fuelState: null,
    ...overrides,
  };
}

function bolter(overrides = {}) {
  return grading({ lsoGrade: 'B', wire: null, ...overrides });
}

function waveOff(overrides = {}) {
  return grading({ lsoGrade: 'WO', wire: null, ...overrides });
}

function connect(ucid = 'pilot-1') {
  return { type: 'connect', playerUcid: ucid };
}

/** Pull the achievement IDs that were saved for a given pilot. */
function savedAchievementIds(apiClient, ucid = 'pilot-1') {
  return apiClient.saveAchievement.mock.calls
    .filter(([arg]) => arg.playerUcid === ucid)
    .map(([arg]) => arg.achievementId);
}

module.exports = { makePipeline, sendAll, grading, bolter, waveOff, connect, savedAchievementIds };
