import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { AppSettings, ProfileSettings, SetupStepStatus } from '@shared/types';
import { DependencyChecker } from './services/dependency-checker';
import { GameConfigService } from './services/game-config';
import { LaunchSequence } from './services/launch-sequence';
import { ProcessManager } from './services/process-manager';
import { ProfileManager } from './services/profile-manager';
import { SteamDetector } from './services/steam-detector';
import { UEVRManager } from './services/uevr-manager';

const managedRoot = path.join(os.homedir(), 'AppData', 'Roaming', 'ac7-vr-launcher');
const settingsPath = path.join(managedRoot, 'settings.json');
const uevrCfgAsset = path.resolve(__dirname, '../assets/ac7-uevr.cfg');

const processManager = new ProcessManager();
const dependencyChecker = new DependencyChecker();
const steamDetector = new SteamDetector(processManager);
const uevrManager = new UEVRManager(managedRoot);
const profileManager = new ProfileManager(managedRoot, path.resolve(__dirname, '../assets/default-profile.json'));
const gameConfig = new GameConfigService();
const launchSequence = new LaunchSequence(processManager, uevrManager.managedPath);

const defaultSettings: AppSettings = {
  theme: 'dark-blue',
  autoUpdateUEVR: true,
  minimizeToTray: false
};

const readSettings = async (): Promise<AppSettings> => {
  if (!fs.existsSync(settingsPath)) return defaultSettings;
  const parsed = JSON.parse(await fs.promises.readFile(settingsPath, 'utf8')) as Partial<AppSettings>;
  return { ...defaultSettings, ...parsed };
};

const writeSettings = async (settings: AppSettings): Promise<void> => {
  await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.promises.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
};

export const registerIpcHandlers = (window: BrowserWindow): void => {
  const emit = (channel: string, payload: unknown) => window.webContents.send(channel, payload);

  ipcMain.handle('deps:check', () => dependencyChecker.check());
  ipcMain.handle('software:detect', (_event, manualPath?: string) => steamDetector.detect(manualPath));
  ipcMain.handle('shell:openExternal', async (_event, url: string) => shell.openExternal(url));

  ipcMain.handle('dialog:browseFolder', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('uevr:status', () => uevrManager.getStatus());
  ipcMain.handle('uevr:update', async () => {
    return uevrManager.update((percent) => emit('uevr:progress', percent));
  });

  /**
   * One-click full setup:
   *  1. Download + install UEVR (latest release)
   *  2. Deploy AC7 UEVR profile to %APPDATA%\UnrealVR\games\Ace7Game-Win64-Shipping\
   *  3. Apply recommended AC7 game config (borderless, no motion blur, 1920×1080)
   *
   * Any step that fails is surfaced as a per-step error status so the UI can
   * show the user what went wrong instead of an opaque unhandled rejection.
   */
  ipcMain.handle('setup:full', async (_event, _ac7Path?: string) => {
    const step = (id: string, label: string, status: SetupStepStatus['status'], message?: string) =>
      emit('setup:progress', { id, label, status, message } satisfies SetupStepStatus);

    // 1 – UEVR
    step('uevr', 'Download & install UEVR', 'pending');
    try {
      await uevrManager.update((percent) => emit('uevr:progress', percent));
      step('uevr', 'Download & install UEVR', 'ok');
    } catch (err) {
      const message = (err as Error).message;
      step('uevr', 'Download & install UEVR', 'error', message);
      throw new Error(`UEVR download failed: ${message}`);
    }

    // 2 – Profile
    step('profile', 'Deploy AC7 UEVR profile', 'pending');
    const cfgSrc = fs.existsSync(uevrCfgAsset) ? uevrCfgAsset : null;
    if (!cfgSrc) {
      step('profile', 'Deploy AC7 UEVR profile', 'error', `Config asset not found at ${uevrCfgAsset}`);
      throw new Error(`AC7 UEVR config asset missing at ${uevrCfgAsset}`);
    }
    try {
      await uevrManager.deployAC7Profile(cfgSrc);
      step('profile', 'Deploy AC7 UEVR profile', 'ok');
    } catch (err) {
      const message = (err as Error).message;
      step('profile', 'Deploy AC7 UEVR profile', 'error', message);
      throw new Error(`Failed to deploy AC7 UEVR profile: ${message}`);
    }

    // 3 – Game config
    step('gameconfig', 'Apply game settings', 'pending');
    const defaultProfileSettings: ProfileSettings = {
      borderlessWindow: true,
      disableMotionBlur: true,
      resolution: '1920x1080',
      headTracking: true,
      useOpenXR: true,
      sequentialRendering: true
    };
    try {
      await gameConfig.apply(defaultProfileSettings);
      step('gameconfig', 'Apply game settings', 'ok', 'Borderless windowed, motion blur off, 1920×1080');
    } catch (err) {
      const message = (err as Error).message;
      step('gameconfig', 'Apply game settings', 'error', message);
      throw new Error(`Failed to apply game settings: ${message}`);
    }
  });

  ipcMain.handle('profile:applyDefault', () => profileManager.applyDefaultProfile());
  ipcMain.handle('profile:import', async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'Profile', extensions: ['json', 'txt'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return profileManager.importProfile(result.filePaths[0]);
  });

  ipcMain.handle('profile:export', async () => {
    const result = await dialog.showSaveDialog(window, {
      title: 'Export UEVR Profile',
      defaultPath: 'ac7-profile.json',
      filters: [{ name: 'Profile', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return null;
    return profileManager.exportProfile(result.filePath);
  });

  ipcMain.handle('game:applyConfig', (_event, settings: ProfileSettings) => gameConfig.apply(settings));

  ipcMain.handle('launch:start', async (_event, ac7Path?: string) => {
    await launchSequence.run(
      ac7Path,
      (step) => emit('launch:update', step),
      (line) => emit('launch:log', line)
    );
  });

  ipcMain.handle('launch:abort', () => launchSequence.abort());

  ipcMain.handle('settings:get', () => readSettings());
  ipcMain.handle('settings:save', async (_event, settings: AppSettings) => writeSettings(settings));
};
