const createTestEvents = require('./testEvents');

const contextMenuTemplate = (udpServer, api, openSettings) => [
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
  ...createTestEvents(udpServer),
  { type: 'separator' },
  {
    label: 'Quit Checkride',
    role: 'quit',
    accelerator: 'CommandOrControl+Q',
  },
];

module.exports = contextMenuTemplate;
