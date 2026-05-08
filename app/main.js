const { Menu, Tray, app, globalShortcut, ipcMain, nativeImage, dialog } = require('electron');
const path = require('path');
const contextMenuTemplate = require('./tray/contextMenuTemplate');
const { initApp, attachEventPipeline } = require('./appInit');
const store = require('./config');
const { showSettingsWindow } = require('./windows/settingsWindow');
const { showTelemetryWindow } = require('./windows/telemetryWindow');
const { DemoController } = require('./demo/demoController');

if (app.isPackaged) {
  delete process.env.DISCORD_INSECURE_TLS;
} else if (!process.env.DISCORD_INSECURE_TLS) {
  process.env.DISCORD_INSECURE_TLS = '1';
}

let tray = null;
const iconPath = path.join(__dirname, './assets/icon.png');
let iconImage;
let iconImageGray;

let udpServer;
let apiClient;
let discordClient;
let dcsChatClient;
let eventProcessor;
let gaugeSync;
let achievementEngine;
let demoController;
let healthChecker;
let isQuitting = false;

const openSettingsWindow = () => {
  return showSettingsWindow();
};

const openTelemetryWindow = () => {
  return showTelemetryWindow();
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
      openTelemetry: openTelemetryWindow,
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

function showLuaVersionMismatchDialog({ luaClientVersion, clientVersion }) {
  const luaLabel = luaClientVersion || 'unknown';

  return dialog.showMessageBox({
    type: 'warning',
    title: 'Checkride: Lua Scripts Out of Date',
    message: 'Checkride detected a Lua/client version mismatch',
    detail: [
      'Checkride Client detected a version mismatch with DCS Lua scripts.',
      '',
      `Client version: ${clientVersion}`,
      `Lua version: ${luaLabel}`,
      '',
      'DCS is likely still running older Lua scripts.',
      'Restart the DCS server after client installation so events and achievements remain reliable.',
    ].join('\n'),
    buttons: ['OK'],
    defaultId: 0,
    noLink: true,
  });
}

async function bootstrap() {
  const appInitResult = await initApp({
    onLuaVersionMismatch: showLuaVersionMismatchDialog,
  });
  udpServer = appInitResult.udpServer;
  apiClient = appInitResult.apiClient;
  discordClient = appInitResult.discordClient;
  dcsChatClient = appInitResult.dcsChatClient;
  eventProcessor = appInitResult.eventProcessor;
  gaugeSync = appInitResult.gaugeSync;
  achievementEngine = appInitResult.achievementEngine;
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
    mission_scripting_enabled: store.get('mission_scripting_enabled'),
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
    mission_scripting_enabled: Boolean(payload.mission_scripting_enabled),
  };

  store.set('server_host', nextConfig.server_host);
  store.set('server_port', nextConfig.server_port);
  store.set('path_prefix', nextConfig.path_prefix);
  store.set('use_ssl', nextConfig.use_ssl);
  store.set('discord_webhook_path', nextConfig.discord_webhook_path);
  store.set('api_token', nextConfig.api_token);
  store.set('mission_scripting_enabled', nextConfig.mission_scripting_enabled);

  if (dcsChatClient?.sendConfig) {
    const log = require('electron-log');
    log.info(`Sending mission scripting config on settings save: mission_scripting_enabled=${nextConfig.mission_scripting_enabled}`);
    dcsChatClient.sendConfig({ mission_scripting_enabled: nextConfig.mission_scripting_enabled })
      .catch((error) => log.error('Error sending config on settings save:', error));
  }

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
    attachEventPipeline({
      udpServer,
      apiClient,
      discordClient,
      dcsChatClient,
      gaugeSync,
      eventProcessor,
      achievementEngine,
    });
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

ipcMain.handle('telemetry:snapshot', () => {
  if (!achievementEngine) return { pilots: [] };
  return { pilots: achievementEngine.getAllPilotSnapshots() };
});

app.whenReady().then(bootstrap);

app.on('window-all-closed', (event) => {
  if (!isQuitting) {
    event.preventDefault();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (demoController?.isRunning) {
    demoController.stop();
  }
  if (healthChecker) {
    healthChecker.stop();
  }
});

module.exports = { initApp };
