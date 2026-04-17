import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import type {
  AppSettings,
  FixActionId,
  LaunchStepStatus,
  PreflightResult,
  ProfileSettings,
  ResetResult,
  SetupStepStatus,
  StatusItem
} from '@shared/types';
import { BackupManager } from './services/backup-manager';
import { DependencyChecker } from './services/dependency-checker';
import { buildDiagnosticsReport } from './services/diagnostics';
import { ERRORS } from './services/error-catalog';
import { runFixAction } from './services/fix-actions';
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
const backupManager = new BackupManager(managedRoot);
const dependencyChecker = new DependencyChecker();
const steamDetector = new SteamDetector(processManager);
const uevrManager = new UEVRManager(managedRoot, backupManager);
const profileManager = new ProfileManager(managedRoot, path.resolve(__dirname, '../assets/default-profile.json'));
const gameConfig = new GameConfigService(backupManager);
const launchSequence = new LaunchSequence(processManager, uevrManager.managedPath);

/**
 * In-memory ring buffer of log lines so the "Copy diagnostic report" button
 * has something to include. Bounded so long sessions don't leak memory.
 */
const LOG_BUFFER_LIMIT = 500;
const recentLogs: string[] = [];
const pushLog = (line: string) => {
  recentLogs.push(line);
  if (recentLogs.length > LOG_BUFFER_LIMIT) recentLogs.splice(0, recentLogs.length - LOG_BUFFER_LIMIT);
};

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
   * Any step that fails is surfaced as a per-step error status with a
   * catalog code + fixAction id so the UI can show a "Fix it for me" button.
   */
  ipcMain.handle('setup:full', async (_event, _ac7Path?: string) => {
    const step = (payload: SetupStepStatus) => emit('setup:progress', payload);

    // 1 – UEVR
    step({ id: 'uevr', label: 'Download & install UEVR', status: 'pending' });
    try {
      await uevrManager.update((percent) => emit('uevr:progress', percent));
      step({ id: 'uevr', label: 'Download & install UEVR', status: 'ok' });
    } catch (err) {
      const message = (err as Error).message;
      step({
        id: 'uevr',
        label: 'Download & install UEVR',
        status: 'error',
        message,
        code: ERRORS.UEVR_DOWNLOAD_FAILED.code,
        fixAction: ERRORS.UEVR_DOWNLOAD_FAILED.fixAction,
        fixActionLabel: ERRORS.UEVR_DOWNLOAD_FAILED.fixActionLabel
      });
      throw new Error(`UEVR download failed: ${message}`);
    }

    // 2 – Profile
    step({ id: 'profile', label: 'Deploy AC7 UEVR profile', status: 'pending' });
    const cfgSrc = fs.existsSync(uevrCfgAsset) ? uevrCfgAsset : null;
    if (!cfgSrc) {
      step({
        id: 'profile',
        label: 'Deploy AC7 UEVR profile',
        status: 'error',
        message: `Config asset not found at ${uevrCfgAsset}`,
        code: ERRORS.UEVR_PROFILE_MISSING.code
      });
      throw new Error(`AC7 UEVR config asset missing at ${uevrCfgAsset}`);
    }
    try {
      await uevrManager.deployAC7Profile(cfgSrc);
      step({ id: 'profile', label: 'Deploy AC7 UEVR profile', status: 'ok' });
    } catch (err) {
      const message = (err as Error).message;
      step({
        id: 'profile',
        label: 'Deploy AC7 UEVR profile',
        status: 'error',
        message,
        code: ERRORS.UEVR_PROFILE_MISSING.code,
        fixAction: ERRORS.UEVR_PROFILE_MISSING.fixAction,
        fixActionLabel: ERRORS.UEVR_PROFILE_MISSING.fixActionLabel
      });
      throw new Error(`Failed to deploy AC7 UEVR profile: ${message}`);
    }

    // 3 – Game config
    step({ id: 'gameconfig', label: 'Apply game settings', status: 'pending' });
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
      step({
        id: 'gameconfig',
        label: 'Apply game settings',
        status: 'ok',
        message: 'Borderless windowed, motion blur off, 1920×1080'
      });
    } catch (err) {
      const message = (err as Error).message;
      step({
        id: 'gameconfig',
        label: 'Apply game settings',
        status: 'error',
        message,
        fixAction: 'reset-game-ini',
        fixActionLabel: 'Reset game settings'
      });
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

  ipcMain.handle('launch:start', async (_event, ac7Path?: string, options?: { extraWarmup?: boolean }) => {
    try {
      await launchSequence.run(
        ac7Path,
        (step) => {
          emit('launch:update', step);
          if (step.status === 'error' && step.message) {
            pushLog(`[launch:${step.id}] ERROR ${step.code ?? ''} ${step.message}`);
          }
        },
        (line) => {
          pushLog(line);
          emit('launch:log', line);
        },
        { extraWarmup: options?.extraWarmup }
      );
    } catch (err) {
      // Surface the tagged code / fixAction the launch sequence attached to
      // the Error so the renderer can render a "Fix it for me" button. Custom
      // fields are not preserved across the IPC boundary for rejected
      // promises, so we emit a dedicated step update instead.
      const tagged = err as Error & { code?: string; fixAction?: FixActionId; fixActionLabel?: string };
      emit('launch:update', {
        id: 'error',
        label: 'Launch failed',
        status: 'error',
        message: tagged.message,
        code: tagged.code,
        fixAction: tagged.fixAction,
        fixActionLabel: tagged.fixActionLabel
      } satisfies LaunchStepStatus);
      throw err;
    }
  });

  ipcMain.handle('launch:abort', () => launchSequence.abort());

  /**
   * Pre-flight verification run before Launch VR. We re-run cheap detection
   * so a regression since the user first walked the wizard (VD closed, UEVR
   * folder deleted, VC++ uninstalled, AC7 library offline) surfaces as an
   * actionable toast rather than a mid-flight failure.
   */
  ipcMain.handle('launch:preflight', async (_event, ac7Path?: string): Promise<PreflightResult> => {
    const deps = dependencyChecker.check();
    const soft = steamDetector.detect(ac7Path);
    const uevr = await uevrManager.getStatus();

    const issues: StatusItem[] = [];

    for (const item of deps.items) if (item.status === 'error') issues.push(item);
    // SteamVR is explicitly not required — skip its `unknown` state.
    for (const item of soft.items) {
      if (item.id === 'steamvr') continue;
      if (item.status === 'error' || (item.id === 'vd' && item.status !== 'ok')) issues.push(item);
    }
    if (!uevr.injectorExists) {
      issues.push({
        id: 'uevr-injector',
        label: 'UEVR injector missing',
        status: 'error',
        details: uevr.managedPath,
        code: ERRORS.UEVR_MISSING.code,
        fixAction: ERRORS.UEVR_MISSING.fixAction,
        fixActionLabel: ERRORS.UEVR_MISSING.fixActionLabel
      });
    }
    if (!uevr.profileDeployed) {
      issues.push({
        id: 'uevr-profile',
        label: 'AC7 UEVR profile not deployed',
        status: 'error',
        code: ERRORS.UEVR_PROFILE_MISSING.code,
        fixAction: ERRORS.UEVR_PROFILE_MISSING.fixAction,
        fixActionLabel: ERRORS.UEVR_PROFILE_MISSING.fixActionLabel
      });
    }

    return { ok: issues.length === 0, issues };
  });

  ipcMain.handle('fix:run', async (_event, action: FixActionId, ac7Path?: string) =>
    runFixAction(
      action,
      {
        processManager,
        steamDetector,
        uevrManager,
        gameConfig,
        uevrCfgAsset,
        onUevrProgress: (percent) => emit('uevr:progress', percent)
      },
      ac7Path
    )
  );

  ipcMain.handle('diagnostics:build', async () => {
    const report = await buildDiagnosticsReport({
      dependencyChecker,
      steamDetector,
      uevrManager,
      getRecentLogs: () => recentLogs
    });
    // Put it directly on the clipboard too so the button is one-click even
    // when the renderer can't access the system clipboard.
    clipboard.writeText(report);
    return report;
  });

  /**
   * "Reset everything": atomic rollback of launcher mutations.
   *   1. Restore snapshotted files (GameUserSettings.ini, any deployed configs)
   *   2. Remove managed UEVR folder
   *   3. Remove deployed AC7 profile
   * Game saves live in a separate directory and are not touched.
   */
  ipcMain.handle('maintenance:reset', async (): Promise<ResetResult> => {
    const details: string[] = [];
    let restoredIni = false;
    try {
      const restored = await backupManager.restoreAll();
      if (restored.length > 0) {
        restoredIni = true;
        details.push(`Restored ${restored.length} file(s) from backup`);
      }
    } catch (err) {
      details.push(`Warning: restore failed — ${(err as Error).message}`);
    }
    const { removedUevr, removedProfile, details: rmDetails } = await uevrManager.resetManagedState();
    details.push(...rmDetails);
    return { removedUevr, removedProfile, restoredIni, details };
  });

  ipcMain.handle('settings:get', () => readSettings());
  ipcMain.handle('settings:save', async (_event, settings: AppSettings) => writeSettings(settings));
};
