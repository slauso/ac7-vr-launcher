import { contextBridge, ipcRenderer } from 'electron';
import type {
  AC7Api,
  AddModRequest,
  AppSettings,
  FixActionId,
  LaunchStepStatus,
  PathOverrides,
  ProfileSettings,
  UEVRSettingItem,
  SetupStepStatus
} from '@shared/types';

const api: AC7Api = {
  checkDependencies: () => ipcRenderer.invoke('deps:check'),
  detectSoftware: (manualPath?: string, overrides?: PathOverrides) =>
    ipcRenderer.invoke('software:detect', manualPath, overrides),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  browseForFolder: () => ipcRenderer.invoke('dialog:browseFolder'),
  browseForFile: (extensions?: string[]) => ipcRenderer.invoke('dialog:browseFile', extensions),
  browseForModSource: () => ipcRenderer.invoke('dialog:browseModSource'),
  getUEVRStatus: () => ipcRenderer.invoke('uevr:status'),
  updateUEVR: () => ipcRenderer.invoke('uevr:update'),
  fullSetup: (ac7Path?: string, overrides?: PathOverrides) => ipcRenderer.invoke('setup:full', ac7Path, overrides),
  applyDefaultProfile: () => ipcRenderer.invoke('profile:applyDefault'),
  importProfile: () => ipcRenderer.invoke('profile:import'),
  exportProfile: () => ipcRenderer.invoke('profile:export'),
  getUEVRSettings: (settingsPath?: string) => ipcRenderer.invoke('uevr:settings:get', settingsPath),
  saveUEVRSettings: (items: Array<Pick<UEVRSettingItem, 'key' | 'value'>>, settingsPath?: string) =>
    ipcRenderer.invoke('uevr:settings:save', items, settingsPath),
  importUEVRSettings: (settingsPath?: string) => ipcRenderer.invoke('uevr:settings:import', settingsPath),
  exportUEVRSettings: (items: Array<Pick<UEVRSettingItem, 'key' | 'value'>>, settingsPath?: string) =>
    ipcRenderer.invoke('uevr:settings:export', items, settingsPath),
  applyGameConfig: (settings: ProfileSettings) => ipcRenderer.invoke('game:applyConfig', settings),
  launchVR: (ac7Path?: string, options?: { extraWarmup?: boolean; overrides?: PathOverrides }) =>
    ipcRenderer.invoke('launch:start', ac7Path, options),
  abortLaunch: () => ipcRenderer.invoke('launch:abort'),
  preflightCheck: (ac7Path?: string, overrides?: PathOverrides) => ipcRenderer.invoke('launch:preflight', ac7Path, overrides),
  runFixAction: (action: FixActionId, ac7Path?: string) => ipcRenderer.invoke('fix:run', action, ac7Path),
  buildDiagnosticsReport: () => ipcRenderer.invoke('diagnostics:build'),
  exportDiagnosticsBundle: () => ipcRenderer.invoke('diagnostics:exportBundle'),
  exportLogs: (lines: string[]) => ipcRenderer.invoke('logs:export', lines),
  resetEverything: () => ipcRenderer.invoke('maintenance:reset'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
  listMods: () => ipcRenderer.invoke('mods:list'),
  addMod: (request: AddModRequest) => ipcRenderer.invoke('mods:add', request),
  setModEnabled: (id: string, enabled: boolean, ac7Path?: string, modsDir?: string, loaderDir?: string) =>
    ipcRenderer.invoke('mods:setEnabled', id, enabled, ac7Path, modsDir, loaderDir),
  removeMod: (id: string) => ipcRenderer.invoke('mods:remove', id),
  reorderMods: (orderedIds: string[]) => ipcRenderer.invoke('mods:reorder', orderedIds),
  onUEVRProgress: (callback: (percent: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, percent: number) => callback(percent);
    ipcRenderer.on('uevr:progress', listener);
    return () => ipcRenderer.removeListener('uevr:progress', listener);
  },
  onSetupProgress: (callback: (step: SetupStepStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, step: SetupStepStatus) => callback(step);
    ipcRenderer.on('setup:progress', listener);
    return () => ipcRenderer.removeListener('setup:progress', listener);
  },
  onLaunchUpdate: (callback: (step: LaunchStepStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, step: LaunchStepStatus) => callback(step);
    ipcRenderer.on('launch:update', listener);
    return () => ipcRenderer.removeListener('launch:update', listener);
  },
  onLog: (callback: (line: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, line: string) => callback(line);
    ipcRenderer.on('launch:log', listener);
    return () => ipcRenderer.removeListener('launch:log', listener);
  }
};

contextBridge.exposeInMainWorld('ac7', api);
