const contextMenuTemplate = (api, openSettings, options = {}) => [
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
  { type: 'separator' },
  {
    label: 'Quit Checkride',
    role: 'quit',
    accelerator: 'CommandOrControl+Q',
  },
];

module.exports = contextMenuTemplate;
