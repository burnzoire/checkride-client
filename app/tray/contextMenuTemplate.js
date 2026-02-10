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
    click: options.openAbout,
    role: options.openAbout ? undefined : 'about',
  },
  ...(options.showDevMenu
    ? createDemoModeMenu(options.demoController, { onChange: options.onChange, enabled: options.isHealthy !== false })
    : []),
  ...(options.showDevMenu
    ? createTestEvents(udpServer, { enabled: options.isHealthy !== false, dcsChatClient: options.dcsChatClient })
    : []),
  { type: 'separator' },
  {
    label: 'Quit Checkride',
    role: 'quit',
    accelerator: 'CommandOrControl+Q',
  },
];

module.exports = contextMenuTemplate;
