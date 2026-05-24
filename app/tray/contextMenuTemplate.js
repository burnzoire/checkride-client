const createTestEvents = require('./testEvents');
const { createDemoModeMenu } = require('./demoModeMenu');

const contextMenuTemplate = (udpServer, api, openSettings, options = {}) => [
  {
    label: 'Settings',
    click: openSettings,
  },
  {
    label: 'Pilot Telemetry',
    click: options.openTelemetry ?? (() => {}),
  },
  { type: 'separator' },
  {
    label: 'About Checkride',
    role: 'about',
  },
  ...(options.checkForUpdates ? [{
    label: options.updateReady ? 'Install Update...' : 'Check for Updates',
    click: options.checkForUpdates,
  }] : []),
  ...createDemoModeMenu(options.demoController, { onChange: options.onChange, enabled: options.isHealthy !== false }),
  ...createTestEvents(udpServer, { enabled: options.isHealthy !== false, dcsChatClient: options.dcsChatClient }),
  { type: 'separator' },
  {
    label: 'Quit Checkride',
    role: 'quit',
    accelerator: 'CommandOrControl+Q',
  },
];

module.exports = contextMenuTemplate;
