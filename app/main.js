const { Menu, Tray, app, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const contextMenuTemplate = require('./tray/contextMenuTemplate');
const { initApp, attachEventPipeline } = require('./appInit');
const store = require('./config');
const { showSettingsWindow } = require('./windows/settingsWindow');

let tray = null;
const iconPath = path.join(__dirname, './assets/icon.png');

let udpServer;
let apiClient;
let discordClient;

const openSettingsWindow = () => {
  return showSettingsWindow();
};

function buildContextMenu() {
  return Menu.buildFromTemplate(contextMenuTemplate(udpServer, apiClient, openSettingsWindow));
}

function setApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const settingsMenu = {
    label: 'Settings',
    submenu: [
      {
        label: 'Open Settings',
        accelerator: 'CommandOrControl+,',
        click: openSettingsWindow,
      },
    ],
  };

  const template = [settingsMenu];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about', label: 'About Checkride' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Checkride' },
      ],
    });
  } else {
    template.push({
      label: 'File',
      submenu: [
        {
          label: 'Quit Checkride',
          accelerator: 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    });
  }

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  });

  if (isMac) {
    template.push({
      role: 'windowMenu',
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function bootstrap() {
  const appInitResult = await initApp();
  udpServer = appInitResult.udpServer;
  apiClient = appInitResult.apiClient;
  discordClient = appInitResult.discordClient;

  setApplicationMenu();

  const contextMenu = buildContextMenu();
  tray = new Tray(iconPath);

  if (app.dock) {
    app.dock.hide();
  }

  tray.setToolTip('Checkride');
  tray.setContextMenu(contextMenu);

  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });
}

ipcMain.handle('settings:load', () => {
  return {
    server_host: store.get('server_host'),
    server_port: store.get('server_port'),
    use_ssl: store.get('use_ssl'),
    udp_port: store.get('udp_port'),
    discord_webhook_path: store.get('discord_webhook_path'),
    api_token: store.get('api_token'),
  };
});

ipcMain.handle('settings:save', async (_event, payload) => {
  const nextConfig = {
    server_host: payload.server_host?.trim() || '',
    server_port: payload.server_port?.trim() || '',
    use_ssl: Boolean(payload.use_ssl),
    udp_port: Number(payload.udp_port),
    discord_webhook_path: payload.discord_webhook_path?.trim() || '',
    api_token: payload.api_token?.trim() || '',
  };

  if (!Number.isFinite(nextConfig.udp_port) || nextConfig.udp_port <= 0 || nextConfig.udp_port > 65535) {
    throw new Error('Invalid UDP port value');
  }

  store.set('server_host', nextConfig.server_host);
  store.set('server_port', nextConfig.server_port);
  store.set('use_ssl', nextConfig.use_ssl);
  store.set('udp_port', nextConfig.udp_port);
  store.set('discord_webhook_path', nextConfig.discord_webhook_path);
  store.set('api_token', nextConfig.api_token);

  if (apiClient?.update) {
    apiClient.update({
      useSsl: nextConfig.use_ssl,
      host: nextConfig.server_host,
      port: nextConfig.server_port,
      apiToken: nextConfig.api_token,
    });
  }

  if (discordClient?.updateWebhookPath) {
    discordClient.updateWebhookPath(nextConfig.discord_webhook_path);
  }

  if (udpServer?.updatePort) {
    await udpServer.updatePort(nextConfig.udp_port);
  }

  if (udpServer && apiClient && discordClient) {
    attachEventPipeline({ udpServer, apiClient, discordClient });
  }

  return { success: true };
});

app.whenReady().then(bootstrap);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

module.exports = { initApp };
