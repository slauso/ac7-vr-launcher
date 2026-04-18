import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import type {
  CameraPreset,
  AppSettings,
  FixActionId,
  LaunchStepStatus,
  ModEntry,
  PreflightResult,
  ProfileSettings,
  ResetResult,
  SetupStepStatus,
  StatusItem,
  UEVRRuntimeOptions
} from '@shared/types';
import { BackupManager } from './services/backup-manager';
import { DependencyChecker } from './services/dependency-checker';
import { buildDiagnosticsReport } from './services/diagnostics';
import { ERRORS } from './services/error-catalog';
import { runFixAction } from './services/fix-actions';
import { GameConfigService } from './services/game-config';
import { LaunchSequence } from './services/launch-sequence';
import {
  disableModInPath,
  enableModInPath,
  installModFromPathToAc7,
  listModsInPath,
  uninstallModFromAc7Path
} from './services/mod-manager';
import { ProcessManager } from './services/process-manager';
import { ProfileManager } from './services/profile-manager';
import { readSettingsFromPath, writeSettingsToPath } from './services/settings-store';
import { SteamDetector } from './services/steam-detector';
import { UEVRManager } from './services/uevr-manager';
import { readCameraPresets, readRuntimeOptions, writeCameraPreset, writeRuntimeOptions } from './services/uevr-profile-config';
import { launchElevated } from './utils/elevate';
import { registerInjectorTask } from './utils/scheduled-task';

const AC7_PROCESS_EXE = 'Ace7Game-Win64-Shipping.exe';

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
// Lazily created so launches use the latest settings-driven UEVR path.
let launchSequence: LaunchSequence | null = null;

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

const readSettings = async (): Promise<AppSettings> => readSettingsFromPath(settingsPath);
const writeSettings = async (settings: AppSettings): Promise<void> => writeSettingsToPath(settingsPath, settings);

const resolveAc7Path = async (): Promise<string> => {
  const settings = await readSettings();
  const pathFromSettings = settings.ac7Path ?? settings.defaultAc7Path;
  if (!pathFromSettings) throw new Error('AC7 path not configured. Set it in Settings.');
  return pathFromSettings;
};

const resolveUevrPath = async (): Promise<string> => {
  const settings = await readSettings();
  return settings.uevrPath ?? uevrManager.getAutoLocatedPath() ?? uevrManager.managedPath;
};

const resolveModBackupPath = () => path.join(managedRoot, 'backups', 'mods-backup');

export const registerIpcHandlers = (window: BrowserWindow): void => {
  const emit = (channel: string, payload: unknown) => window.webContents.send(channel, payload);

  ipcMain.handle('deps:check', () => dependencyChecker.check());
  ipcMain.handle('software:detect', (_event, manualPath?: string) => steamDetector.detect(manualPath));
  ipcMain.handle('shell:openExternal', async (_event, url: string) => shell.openExternal(url));

  ipcMain.handle('dialog:browseFolder', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('dialog:browseModFile', async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'Mods', extensions: ['zip', 'pak', 'ucas', 'utoc'] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('uevr:status', async () => {
    const status = await uevrManager.getStatus();
    const settings = await readSettings();
    const selectedPath = settings.uevrPath ?? status.selectedPath;
    const injectorExists = fs.existsSync(path.join(selectedPath, 'UEVRInjector.exe'));
    const gameRunning = processManager.isRunning(AC7_PROCESS_EXE);
    const injectorRunning = processManager.isRunning('UEVRInjector.exe');
    return {
      ...status,
      selectedPath,
      injectorExists,
      injectionStatus: !gameRunning ? 'not-running' : injectorRunning ? 'injected' : 'running'
    };
  });
  ipcMain.handle('uevr:inject', async () => {
    if (!processManager.isRunning(AC7_PROCESS_EXE)) {
      throw new Error('Ace Combat 7 is not running. Start the game first, then inject UEVR.');
    }
    const uevrPath = await resolveUevrPath();
    const injectorPath = path.join(uevrPath, 'UEVRInjector.exe');
    if (!fs.existsSync(injectorPath)) throw new Error(`UEVRInjector.exe missing at ${injectorPath}`);
    await launchElevated(injectorPath, [`--attach=${AC7_PROCESS_EXE}`], uevrPath);
  });
  ipcMain.handle('uevr:importFolder', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    await uevrManager.importInstall(result.filePaths[0]);
    const settings = await readSettings();
    await writeSettings({ ...settings, uevrPath: uevrManager.managedPath });
    return uevrManager.managedPath;
  });
  ipcMain.handle('uevr:deployProfile', async () => {
    if (!fs.existsSync(uevrCfgAsset)) throw new Error(`Config asset not found at ${uevrCfgAsset}`);
    await uevrManager.deployAC7Profile(uevrCfgAsset);
  });
  ipcMain.handle('uevr:runtimeOptions:get', async (): Promise<UEVRRuntimeOptions> => readRuntimeOptions(uevrManager.ac7ProfileDir));
  ipcMain.handle('uevr:runtimeOptions:set', async (_event, options: UEVRRuntimeOptions) =>
    writeRuntimeOptions(uevrManager.ac7ProfileDir, options)
  );

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

    // 4 – Register the elevated UEVR injector scheduled task. This is the
    // one-time UAC prompt the user pays to skip every per-launch UAC prompt
    // afterwards. The task bakes in `--attach=Ace7Game-Win64-Shipping.exe`,
    // so the injector waits for the running game and auto-injects with no
    // GUI interaction. Failure here is non-fatal: launches will fall back to
    // the legacy launchElevated() path (one UAC per launch).
    step({ id: 'inject-task', label: 'Install one-click VR injector', status: 'pending' });
    const injectorPath = path.join(uevrManager.managedPath, 'UEVRInjector.exe');
    if (!fs.existsSync(injectorPath)) {
      step({
        id: 'inject-task',
        label: 'Install one-click VR injector',
        status: 'error',
        message: `UEVRInjector.exe missing at ${injectorPath} — re-run the UEVR step.`,
        code: ERRORS.UEVR_MISSING.code,
        fixAction: ERRORS.UEVR_MISSING.fixAction,
        fixActionLabel: ERRORS.UEVR_MISSING.fixActionLabel
      });
      return;
    }
    try {
      await registerInjectorTask(injectorPath, AC7_PROCESS_EXE);
      step({
        id: 'inject-task',
        label: 'Install one-click VR injector',
        status: 'ok',
        message: 'Future Launch VR clicks will skip the UAC prompt.'
      });
    } catch (err) {
      // Most likely cause: user declined the UAC prompt. Surface as a
      // recoverable warning rather than aborting the whole setup — the
      // launcher still works, it just shows a UAC prompt per launch.
      step({
        id: 'inject-task',
        label: 'Install one-click VR injector',
        status: 'error',
        message:
          `${(err as Error).message} `
          + 'Launch VR will still work, but you will see a UAC prompt every time. '
          + 'Re-run "Install one-click injector" to skip it.',
        code: ERRORS.INJECT_TASK_MISSING.code,
        fixAction: ERRORS.INJECT_TASK_MISSING.fixAction,
        fixActionLabel: ERRORS.INJECT_TASK_MISSING.fixActionLabel
      });
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
      launchSequence = new LaunchSequence(processManager, await resolveUevrPath());
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

  ipcMain.handle('launch:abort', () => launchSequence?.abort());

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
    const { removedUevr, removedProfile, removedInjectorTask, details: rmDetails } =
      await uevrManager.resetManagedState();
    details.push(...rmDetails);
    return { removedUevr, removedProfile, removedInjectorTask, restoredIni, details };
  });

  ipcMain.handle('camera:getPresets', async (): Promise<CameraPreset[]> => readCameraPresets(uevrManager.ac7ProfileDir));
  ipcMain.handle('camera:setPreset', async (_event, preset: CameraPreset) => writeCameraPreset(uevrManager.ac7ProfileDir, preset));

  ipcMain.handle('mods:list', async (): Promise<ModEntry[]> => {
    const ac7Path = await resolveAc7Path();
    return listModsInPath(ac7Path);
  });
  ipcMain.handle('mods:enable', async (_event, fileName: string) => {
    const ac7Path = await resolveAc7Path();
    await enableModInPath(ac7Path, fileName);
  });
  ipcMain.handle('mods:disable', async (_event, fileName: string) => {
    const ac7Path = await resolveAc7Path();
    await disableModInPath(ac7Path, fileName);
  });
  ipcMain.handle('mods:install', async (_event, sourcePath: string) => {
    const ac7Path = await resolveAc7Path();
    await installModFromPathToAc7(ac7Path, sourcePath);
  });
  ipcMain.handle('mods:uninstall', async (_event, fileName: string) => {
    const ac7Path = await resolveAc7Path();
    await uninstallModFromAc7Path(ac7Path, fileName);
  });

  ipcMain.handle('backup:create', async () => {
    const ac7Path = await resolveAc7Path();
    const backupRoot = resolveModBackupPath();
    const modsPath = path.join(ac7Path, 'Game', 'Content', 'Paks');
    await fs.promises.rm(backupRoot, { recursive: true, force: true });
    if (fs.existsSync(modsPath)) {
      await fs.promises.mkdir(backupRoot, { recursive: true });
      await fs.promises.cp(modsPath, path.join(backupRoot, 'Paks'), { recursive: true });
    }
    if (fs.existsSync(uevrManager.ac7ProfileDir)) {
      await fs.promises.cp(uevrManager.ac7ProfileDir, path.join(backupRoot, 'UEVRProfile'), { recursive: true });
    }
  });
  ipcMain.handle('backup:restore', async () => {
    const ac7Path = await resolveAc7Path();
    const backupRoot = resolveModBackupPath();
    const modsBackup = path.join(backupRoot, 'Paks');
    const profileBackup = path.join(backupRoot, 'UEVRProfile');
    if (!fs.existsSync(modsBackup) && !fs.existsSync(profileBackup)) {
      throw new Error('No backup exists yet.');
    }
    if (fs.existsSync(modsBackup)) {
      const modsPath = path.join(ac7Path, 'Game', 'Content', 'Paks');
      await fs.promises.rm(modsPath, { recursive: true, force: true });
      await fs.promises.cp(modsBackup, modsPath, { recursive: true });
    }
    if (fs.existsSync(profileBackup)) {
      await fs.promises.rm(uevrManager.ac7ProfileDir, { recursive: true, force: true });
      await fs.promises.cp(profileBackup, uevrManager.ac7ProfileDir, { recursive: true });
    }
  });

  ipcMain.handle('settings:get', () => readSettings());
  ipcMain.handle('settings:save', async (_event, settings: AppSettings) => {
    const normalized = {
      ...settings,
      ac7Path: settings.ac7Path ?? settings.defaultAc7Path,
      defaultAc7Path: settings.ac7Path ?? settings.defaultAc7Path
    };
    await writeSettings(normalized);
  });
};
