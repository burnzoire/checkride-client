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
  {
    label: 'Ping server',
    click() { api.ping() }
  },
  ...createDemoModeMenu(options.demoController, { onChange: options.onChange }),
  ...createTestEvents(udpServer),
  { type: 'separator' },
  {
    label: 'Quit Checkride',
    role: 'quit',
    accelerator: 'CommandOrControl+Q',
  },
];

module.exports = contextMenuTemplate;
