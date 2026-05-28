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
  ...(options.updateReady && options.installUpdate ? [{
    label: 'Install Update...',
    click: options.installUpdate,
  }] : options.checkForUpdates ? [{
    label: 'Check for Updates',
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
