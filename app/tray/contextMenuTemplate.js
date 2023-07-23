import { createTestEvents } from './testEvents';

export const contextMenuTemplate = (udpServer, api) => [
  {
    label: 'About Quoll',
    role: 'about',
  },
  {
    label: 'Ping server',
    click() { api.ping() }
  },
  ...createTestEvents(udpServer),
  { type: 'separator' },
  {
    label: 'Quit Quoll',
    role: 'quit',
    accelerator: 'CommandOrControl+Q',
  },
];
