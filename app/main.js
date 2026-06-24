const { Menu, Tray, app, globalShortcut, ipcMain, nativeImage, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const contextMenuTemplate = require('./tray/contextMenuTemplate');
const { initApp, attachEventPipeline } = require('./appInit');
const { SortieLogger } = require('./services/sortieLogger');
const store = require('./config');
const { showSettingsWindow } = require('./windows/settingsWindow');
const { showTelemetryWindow } = require('./windows/telemetryWindow');
const { version: APP_VERSION } = require('./package.json');

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
let sortieLogger;
let achievementEngine;
let weaponTracker;
let healthChecker;
let isQuitting = false;
let updateReady = false;
let updateInfo = null;
let manualUpdateCheck = false;

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
  return Menu.buildFromTemplate(
    contextMenuTemplate(apiClient, openSettingsWindow, {
      openTelemetry: openTelemetryWindow,
      updateReady,
      checkForUpdates: app.isPackaged
        ? () => {
            manualUpdateCheck = true;
            autoUpdater.checkForUpdates().catch((err) => log.error('Update check failed:', err));
          }
        : null,
      installUpdate: updateReady && updateInfo ? () => promptAndInstall(updateInfo) : null,
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

function initAutoUpdater() {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', () => {
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      tray?.displayBalloon({
        title: 'Update Found',
        content: 'Downloading the latest version of Checkride...',
        noSound: true,
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      tray?.displayBalloon({
        title: 'Checkride is up to date',
        content: `v${app.getVersion()} is the latest version.`,
        noSound: true,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true;
    updateInfo = info;
    if (tray) {
      tray.displayBalloon({
        title: 'Checkride Update Ready',
        content: `v${info.version} has been downloaded. Click here to install.`,
        noSound: false,
      });
      tray.once('balloon-click', () => promptAndInstall(info));
      tray.setContextMenu(buildContextMenu());
    } else {
      promptAndInstall(info);
    }
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err);
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      dialog.showMessageBox({
        type: 'error',
        title: 'Update Check Failed',
        message: 'Could not check for updates.',
        detail: err.message,
        buttons: ['OK'],
        noLink: true,
      });
    }
  });
}

async function promptAndInstall(info) {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Checkride Update Ready',
    message: `Checkride v${info.version} is ready to install.`,
    detail: [
      'The update has been downloaded and is ready to install.',
      '',
      'Click "Install Now" to restart and update.',
      '',
      'Note: if the update includes Lua script changes, you will also need to restart the DCS server after the client updates.',
    ].join('\n'),
    buttons: ['Install Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response === 0) {
    autoUpdater.quitAndInstall();
  }
}

async function bootstrap() {
  sortieLogger = new SortieLogger(path.join(app.getPath('userData'), 'logs'));
  sortieLogger.purgeLogs();

  const appInitResult = await initApp({
    onLuaVersionMismatch: showLuaVersionMismatchDialog,
    sortieLogger,
  });
  udpServer = appInitResult.udpServer;
  apiClient = appInitResult.apiClient;
  discordClient = appInitResult.discordClient;
  dcsChatClient = appInitResult.dcsChatClient;
  eventProcessor = appInitResult.eventProcessor;
  gaugeSync = appInitResult.gaugeSync;
  achievementEngine = appInitResult.achievementEngine;
  weaponTracker = appInitResult.weaponTracker;
  healthChecker = appInitResult.healthChecker;

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
    auto_update_enabled: store.get('auto_update_enabled'),
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
    auto_update_enabled: Boolean(payload.auto_update_enabled),
  };

  store.set('server_host', nextConfig.server_host);
  store.set('server_port', nextConfig.server_port);
  store.set('path_prefix', nextConfig.path_prefix);
  store.set('use_ssl', nextConfig.use_ssl);
  store.set('discord_webhook_path', nextConfig.discord_webhook_path);
  store.set('api_token', nextConfig.api_token);
  store.set('mission_scripting_enabled', nextConfig.mission_scripting_enabled);
  store.set('auto_update_enabled', nextConfig.auto_update_enabled);

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
      sortieLogger,
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
  const pilots = achievementEngine.getAllPilotSnapshots();
  // The shot tracker is the single weapon-state source for telemetry. Attach its view
  // INSIDE pilot.state so it flows through the renderer's history/scrubber path (which
  // only carries `state`). Per-kill weapon comes from the kill record itself (Combat),
  // not a victim-id correlation — DCS shots have no reliable victim link.
  if (weaponTracker) {
    for (const pilot of pilots) {
      if (!pilot.state) continue;
      const weapons = weaponTracker.trackedShots(pilot.ucid);
      pilot.state.weaponsFired = weapons;
      pilot.state.gunBurst = weaponTracker.gunBurst(pilot.ucid);

      // The kill_enrichment usually lacks the weapon (the mission script's desc capture
      // fails), but the tracker knows it. Assign credited shots to the real kills in
      // order — collateral kills have no victim and are skipped; same-weapon kills make
      // ordering moot. Display only; the API gets the weapon via resolveWeapon.
      const kills = pilot.state.state?.kills;
      if (Array.isArray(kills)) {
        const killedShots = weapons.filter((s) => s.outcome === 'killed');
        let si = 0;
        for (const kill of kills) {
          if (!kill.victimTypeName && !kill.victimAirType) continue;
          if (!kill.weaponName && si < killedShots.length) {
            const shot = killedShots[si++];
            kill.weaponName = shot.weaponDisplayName || shot.weaponName;
            kill.weaponDescRaw = kill.weaponDescRaw || shot.descRaw;
          }
        }
      }
    }
  }
  return { pilots };
});

ipcMain.handle('sortie:open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open Sortie Log',
    filters: [{ name: 'Sortie Logs', extensions: ['jsonl'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;
  const { readFileSync } = require('fs');
  return readFileSync(filePaths[0], 'utf8');
});

app.whenReady().then(async () => {
  // The native About panel on Windows defaults to the executable's 4-part file
  // version (e.g. 1.5.6.0), which drops the semver prerelease tag. Show the real
  // package version (e.g. 1.5.6-beta3) instead.
  app.setAboutPanelOptions({
    applicationName: app.name,
    applicationVersion: APP_VERSION,
  });
  await bootstrap();
  if (app.isPackaged) {
    initAutoUpdater();
    if (store.get('auto_update_enabled', true)) {
      autoUpdater.checkForUpdates().catch((err) => log.error('Update check failed:', err));
    }
  }
});

app.on('window-all-closed', (event) => {
  if (!isQuitting) {
    event.preventDefault();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  sortieLogger?.closeAll();
  if (healthChecker) {
    healthChecker.stop();
  }
});

module.exports = { initApp };
