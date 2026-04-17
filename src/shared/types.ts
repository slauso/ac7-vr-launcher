export type StatusState = 'ok' | 'error' | 'pending' | 'unknown';

export interface StatusItem {
  id: string;
  label: string;
  status: StatusState;
  details?: string;
  actionLabel?: string;
  actionUrl?: string;
}

export interface DependencyCheckResult {
  windowsVersion: string;
  windowsSupported: boolean;
  vcppInstalled: boolean;
  directxInstalled: boolean;
  items: StatusItem[];
}

export interface SoftwareDetectionResult {
  steamInstalled: boolean;
  steamRunning: boolean;
  steamVRInstalled: boolean;
  ac7Installed: boolean;
  ac7InstallPath?: string;
  virtualDesktopInstalled: boolean;
  virtualDesktopRunning: boolean;
  items: StatusItem[];
}

export interface UEVRReleaseInfo {
  version: string;
  downloadUrl: string;
  fileName: string;
}

export interface UEVRStatus {
  installedVersion?: string;
  latestVersion?: string;
  managedPath: string;
  injectorExists: boolean;
  /** True when the AC7 UEVR config has been deployed to %APPDATA%\UnrealVR\games\Ace7Game-Win64-Shipping\ */
  profileDeployed: boolean;
}

export interface SetupStepStatus {
  id: string;
  label: string;
  status: StatusState;
  message?: string;
}

export interface ProfileSettings {
  borderlessWindow: boolean;
  disableMotionBlur: boolean;
  resolution: string;
  headTracking: boolean;
  useOpenXR: boolean;
  sequentialRendering: boolean;
}

export interface LaunchStepStatus {
  id: string;
  label: string;
  status: StatusState;
  message?: string;
}

export interface AppSettings {
  theme: 'dark' | 'dark-blue';
  defaultAc7Path?: string;
  autoUpdateUEVR: boolean;
  minimizeToTray: boolean;
}

export interface AC7Api {
  checkDependencies: () => Promise<DependencyCheckResult>;
  detectSoftware: (manualPath?: string) => Promise<SoftwareDetectionResult>;
  openExternal: (url: string) => Promise<void>;
  browseForFolder: () => Promise<string | null>;
  getUEVRStatus: () => Promise<UEVRStatus>;
  updateUEVR: () => Promise<UEVRStatus>;
  /** One-click: download UEVR + deploy AC7 profile + apply game config */
  fullSetup: (ac7Path?: string) => Promise<void>;
  applyDefaultProfile: () => Promise<string>;
  importProfile: () => Promise<string | null>;
  exportProfile: () => Promise<string | null>;
  applyGameConfig: (settings: ProfileSettings) => Promise<string>;
  launchVR: (ac7Path?: string) => Promise<void>;
  abortLaunch: () => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  onUEVRProgress: (callback: (percent: number) => void) => () => void;
  onSetupProgress: (callback: (step: SetupStepStatus) => void) => () => void;
  onLaunchUpdate: (callback: (step: LaunchStepStatus) => void) => () => void;
  onLog: (callback: (line: string) => void) => () => void;
}
