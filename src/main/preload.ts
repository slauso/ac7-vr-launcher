import { contextBridge, ipcRenderer } from 'electron';
import type { AC7Api, AppSettings, LaunchStepStatus, ProfileSettings } from '@shared/types';

const api: AC7Api = {
  checkDependencies: () => ipcRenderer.invoke('deps:check'),
  detectSoftware: (manualPath?: string) => ipcRenderer.invoke('software:detect', manualPath),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  browseForFolder: () => ipcRenderer.invoke('dialog:browseFolder'),
  getUEVRStatus: () => ipcRenderer.invoke('uevr:status'),
  updateUEVR: () => ipcRenderer.invoke('uevr:update'),
  applyDefaultProfile: () => ipcRenderer.invoke('profile:applyDefault'),
  importProfile: () => ipcRenderer.invoke('profile:import'),
  exportProfile: () => ipcRenderer.invoke('profile:export'),
  applyGameConfig: (settings: ProfileSettings) => ipcRenderer.invoke('game:applyConfig', settings),
  launchVR: (ac7Path?: string) => ipcRenderer.invoke('launch:start', ac7Path),
  abortLaunch: () => ipcRenderer.invoke('launch:abort'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
  onUEVRProgress: (callback: (percent: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, percent: number) => callback(percent);
    ipcRenderer.on('uevr:progress', listener);
    return () => ipcRenderer.removeListener('uevr:progress', listener);
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
