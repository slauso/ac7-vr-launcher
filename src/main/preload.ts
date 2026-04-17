import { contextBridge, ipcRenderer } from 'electron';
import type {
  AC7Api,
  AppSettings,
  FixActionId,
  LaunchStepStatus,
  ProfileSettings,
  SetupStepStatus
} from '@shared/types';

const api: AC7Api = {
  checkDependencies: () => ipcRenderer.invoke('deps:check'),
  detectSoftware: (manualPath?: string) => ipcRenderer.invoke('software:detect', manualPath),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  browseForFolder: () => ipcRenderer.invoke('dialog:browseFolder'),
  getUEVRStatus: () => ipcRenderer.invoke('uevr:status'),
  updateUEVR: () => ipcRenderer.invoke('uevr:update'),
  fullSetup: (ac7Path?: string) => ipcRenderer.invoke('setup:full', ac7Path),
  applyDefaultProfile: () => ipcRenderer.invoke('profile:applyDefault'),
  importProfile: () => ipcRenderer.invoke('profile:import'),
  exportProfile: () => ipcRenderer.invoke('profile:export'),
  applyGameConfig: (settings: ProfileSettings) => ipcRenderer.invoke('game:applyConfig', settings),
  launchVR: (ac7Path?: string, options?: { extraWarmup?: boolean }) =>
    ipcRenderer.invoke('launch:start', ac7Path, options),
  abortLaunch: () => ipcRenderer.invoke('launch:abort'),
  preflightCheck: (ac7Path?: string) => ipcRenderer.invoke('launch:preflight', ac7Path),
  runFixAction: (action: FixActionId, ac7Path?: string) => ipcRenderer.invoke('fix:run', action, ac7Path),
  buildDiagnosticsReport: () => ipcRenderer.invoke('diagnostics:build'),
  resetEverything: () => ipcRenderer.invoke('maintenance:reset'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
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
