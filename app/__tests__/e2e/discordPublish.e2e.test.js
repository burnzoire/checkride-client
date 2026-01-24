const { attachEventPipeline } = require('../../appInit');
const { EventProcessor } = require('../../services/eventProcessor');

describe('Discord publishing e2e', () => {
  it('sends the formatted summary returned by the API', async () => {
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue({
        summary: 'Maverick landed at Miramar',
        publish: true
      })
    };

    const discordClientMock = {
      send: jest.fn().mockResolvedValue()
    };

    const udpServer = {};
    const eventProcessor = new EventProcessor();

    attachEventPipeline({ udpServer, apiClient: apiClientMock, discordClient: discordClientMock, eventProcessor });

    await udpServer.onEvent({
      type: 'landing',
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
      unitType: 'F-14A',
      airdromeName: 'Miramar'
    });

    expect(apiClientMock.saveEvent).toHaveBeenCalledTimes(1);
    expect(discordClientMock.send).toHaveBeenCalledWith('Maverick landed at Miramar', true);
  });
});
