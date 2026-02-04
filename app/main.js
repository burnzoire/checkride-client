const { Menu, Tray, app, globalShortcut, ipcMain, nativeImage } = require('electron');
const path = require('path');
const contextMenuTemplate = require('./tray/contextMenuTemplate');
const { initApp, attachEventPipeline } = require('./appInit');
const store = require('./config');
const { showSettingsWindow } = require('./windows/settingsWindow');
const { DemoController } = require('./demo/demoController');

let tray = null;
const iconPath = path.join(__dirname, './assets/icon.png');
let iconImage;
let iconImageGray;

let udpServer;
let apiClient;
let discordClient;
let dcsChatClient;
let eventProcessor;
let demoController;
let healthChecker;

const openSettingsWindow = () => {
  return showSettingsWindow();
};

function createGrayscaleIcon(image) {
  const size = image.getSize();
  const bitmap = image.toBitmap();
  const gray = Buffer.from(bitmap);

  for (let i = 0; i < gray.length; i += 4) {
    const b = gray[i];
    const g = gray[i + 1];
    const r = gray[i + 2];
    const a = gray[i + 3];
    const value = Math.round((r * 0.3) + (g * 0.59) + (b * 0.11));

    gray[i] = value;
    gray[i + 1] = value;
    gray[i + 2] = value;
    gray[i + 3] = a;
  }

  return nativeImage.createFromBuffer(gray, size);
}

function updateTrayHealth(isHealthy) {
  if (!tray) return;

  const icon = isHealthy ? iconImage : iconImageGray;
  if (icon) {
    tray.setImage(icon);
  }

  tray.setToolTip(`Checkride (API: ${isHealthy ? 'Healthy' : 'Unhealthy'})`);
  tray.setContextMenu(buildContextMenu());
}

function buildContextMenu() {
  const isHealthy = store.get('api_healthy', true);
  return Menu.buildFromTemplate(
    contextMenuTemplate(udpServer, apiClient, openSettingsWindow, {
      isHealthy,
      demoController,
      dcsChatClient,
      onChange: () => {
        if (tray) {
          tray.setContextMenu(buildContextMenu());
        }
      }
    })
  );
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
  dcsChatClient = appInitResult.dcsChatClient;
  eventProcessor = appInitResult.eventProcessor;
  healthChecker = appInitResult.healthChecker;

  demoController = new DemoController();

  setApplicationMenu();

  const contextMenu = buildContextMenu();
  iconImage = nativeImage.createFromPath(iconPath);
  iconImageGray = createGrayscaleIcon(iconImage);
  tray = new Tray(iconImage);

  if (app.dock) {
    app.dock.hide();
  }

  tray.setContextMenu(contextMenu);

  if (healthChecker?.setOnStatusChange) {
    healthChecker.setOnStatusChange((isHealthy) => {
      updateTrayHealth(isHealthy);
    });
  }

  updateTrayHealth(store.get('api_healthy', true));

  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });
}

ipcMain.handle('settings:load', () => {
  return {
    server_host: store.get('server_host'),
    server_port: store.get('server_port'),
    path_prefix: store.get('path_prefix'),
    use_ssl: store.get('use_ssl'),
    discord_webhook_path: store.get('discord_webhook_path'),
    api_token: store.get('api_token'),
  };
});

ipcMain.handle('settings:save', async (_event, payload) => {
  const nextConfig = {
    server_host: payload.server_host?.trim() || '',
    server_port: payload.server_port?.trim() || '',
    path_prefix: payload.path_prefix?.trim() || '',
    use_ssl: Boolean(payload.use_ssl),
    discord_webhook_path: payload.discord_webhook_path?.trim() || '',
    api_token: payload.api_token?.trim() || '',
  };

  store.set('server_host', nextConfig.server_host);
  store.set('server_port', nextConfig.server_port);
  store.set('path_prefix', nextConfig.path_prefix);
  store.set('use_ssl', nextConfig.use_ssl);
  store.set('discord_webhook_path', nextConfig.discord_webhook_path);
  store.set('api_token', nextConfig.api_token);

  if (apiClient?.update) {
    apiClient.update({
      useSsl: nextConfig.use_ssl,
      host: nextConfig.server_host,
      port: nextConfig.server_port,
      apiToken: nextConfig.api_token,
      pathPrefix: nextConfig.path_prefix,
    });
  }

  if (discordClient?.updateWebhookPath) {
    discordClient.updateWebhookPath(nextConfig.discord_webhook_path);
  }

  if (udpServer && apiClient && discordClient) {
    attachEventPipeline({ udpServer, apiClient, discordClient, eventProcessor });
  }

  if (healthChecker?.checkHealth) {
    await healthChecker.checkHealth();
  }

  return { success: true };
});

ipcMain.handle('api:health', () => {
  return {
    isHealthy: store.get('api_healthy', true),
  };
});

app.whenReady().then(bootstrap);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (demoController?.isRunning) {
    demoController.stop();
  }
  if (healthChecker) {
    healthChecker.stop();
  }
});

module.exports = { initApp };
