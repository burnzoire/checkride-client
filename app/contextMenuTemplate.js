import { createTestEvents } from './testEvents'; // we'll create this new file 

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
