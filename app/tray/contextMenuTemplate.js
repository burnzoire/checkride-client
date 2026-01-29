const createTestEvents = require('./testEvents');
const { createDemoModeMenu } = require('./demoModeMenu');

const contextMenuTemplate = (udpServer, api, openSettings, options = {}) => [
  {
    label: 'Settings',
    click: openSettings,
  },
  { type: 'separator' },
  {
    label: 'About Checkride',
    role: 'about',
  },
  ...createDemoModeMenu(options.demoController, { onChange: options.onChange, enabled: options.isHealthy !== false }),
  ...createTestEvents(udpServer, { enabled: options.isHealthy !== false }),
  { type: 'separator' },
  {
    label: 'Quit Checkride',
    role: 'quit',
    accelerator: 'CommandOrControl+Q',
  },
];

module.exports = contextMenuTemplate;
