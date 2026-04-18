export type StatusState = 'ok' | 'error' | 'pending' | 'unknown';

/**
 * Identifier for a one-click remedy the main process knows how to execute.
 * Rendered as a "Fix it for me" button next to a failed step / item.
 */
export type FixActionId =
  | 'install-vcpp'
  | 'install-directx'
  | 'install-virtual-desktop'
  | 'start-virtual-desktop'
  | 'start-steam'
  | 'install-ac7'
  | 'reinstall-uevr'
  | 'redeploy-profile'
  | 'reset-game-ini'
  | 'rescan-ac7-path'
  | 'retry-with-extra-warmup'
  | 'register-inject-task';

export interface StatusItem {
  id: string;
  label: string;
  status: StatusState;
  details?: string;
  actionLabel?: string;
  actionUrl?: string;
  /** Structured error code (e.g. `VCPP-001`) so users can search / paste it */
  code?: string;
  /** Optional one-click remedy — renders a "Fix it for me" button */
  fixAction?: FixActionId;
  fixActionLabel?: string;
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
  selectedPath: string;
  autoLocatedPath?: string;
  injectorExists: boolean;
  injectionStatus: 'not-running' | 'running' | 'injected';
  /** True when the AC7 UEVR config has been deployed to %APPDATA%\UnrealVR\games\Ace7Game-Win64-Shipping\ */
  profileDeployed: boolean;
  /**
   * True when the elevated injector Scheduled Task (`AC7VRLauncher_UEVRInject`)
   * is registered. When present, Launch VR triggers it via `schtasks /Run` and
   * skips the per-launch UAC prompt.
   */
  injectorTaskRegistered: boolean;
}

export type UEVRRenderingMethod = 'native-stereo' | 'synchronized-sequential' | 'alternating';
export type UEVRRuntime = 'openxr' | 'openvr';

export interface UEVRRuntimeOptions {
  renderingMethod: UEVRRenderingMethod;
  runtime: UEVRRuntime;
  ghostingFix: boolean;
  overlaysEnabled: boolean;
  performanceHud: boolean;
  controllerBindingsOverlay: boolean;
  recenterPrompt: boolean;
}

export interface SetupStepStatus {
  id: string;
  label: string;
  status: StatusState;
  message?: string;
  code?: string;
  fixAction?: FixActionId;
  fixActionLabel?: string;
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
  code?: string;
  fixAction?: FixActionId;
  fixActionLabel?: string;
}

export interface AppSettings {
  theme: 'dark' | 'dark-blue';
  defaultAc7Path?: string;
  ac7Path?: string;
  uevrPath?: string;
  defaultVRRuntime: UEVRRuntime;
  defaultRenderingMethod: UEVRRenderingMethod;
  autoInjectUEVR: boolean;
  launchOptions: string;
  autoUpdateUEVR: boolean;
  minimizeToTray: boolean;
}

export type CameraMode = 'inside-cockpit' | 'outside-chase' | 'free-cinematic';

export interface CameraPreset {
  id: string;
  name: string;
  mode: CameraMode;
  fov: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  pitch: number;
  yaw: number;
  roll: number;
}

export interface ModEntry {
  fileName: string;
  fullPath: string;
  enabled: boolean;
  size: number;
  dateAdded: string;
  description?: string;
  type?: 'skin' | 'mod';
  aircraft?: string;
  thumbnailPath?: string;
}

/**
 * Machine-readable result of running a preflight check before the launch
 * sequence. If `ok` is false, the UI surfaces the issue(s) with a
 * "Fix it for me" button rather than letting the launch fail mid-flight.
 */
export interface PreflightResult {
  ok: boolean;
  issues: StatusItem[];
}

/** Result of executing a `FixActionId`. `ok:false` surfaces the reason to the user. */
export interface FixActionResult {
  ok: boolean;
  message: string;
}

/** Output of the "Reset everything" maintenance action. */
export interface ResetResult {
  removedUevr: boolean;
  removedProfile: boolean;
  removedInjectorTask: boolean;
  restoredIni: boolean;
  details: string[];
}

export interface AC7Api {
  checkDependencies: () => Promise<DependencyCheckResult>;
  detectSoftware: (manualPath?: string) => Promise<SoftwareDetectionResult>;
  openExternal: (url: string) => Promise<void>;
  browseForFolder: () => Promise<string | null>;
  getUEVRStatus: () => Promise<UEVRStatus>;
  injectUEVR: () => Promise<void>;
  updateUEVR: () => Promise<UEVRStatus>;
  importUEVRFolder: () => Promise<string | null>;
  deployUEVRProfile: () => Promise<void>;
  getUEVRRuntimeOptions: () => Promise<UEVRRuntimeOptions>;
  setUEVRRuntimeOptions: (options: UEVRRuntimeOptions) => Promise<void>;
  /** One-click: download UEVR + deploy AC7 profile + apply game config */
  fullSetup: (ac7Path?: string) => Promise<void>;
  applyDefaultProfile: () => Promise<string>;
  importProfile: () => Promise<string | null>;
  exportProfile: () => Promise<string | null>;
  applyGameConfig: (settings: ProfileSettings) => Promise<string>;
  launchVR: (ac7Path?: string, options?: { extraWarmup?: boolean }) => Promise<void>;
  abortLaunch: () => Promise<void>;
  /** Re-run dependency + software detection, returning structured issues for pre-flight. */
  preflightCheck: (ac7Path?: string) => Promise<PreflightResult>;
  /** Execute a one-click remedy by id. */
  runFixAction: (action: FixActionId, ac7Path?: string) => Promise<FixActionResult>;
  /** Build a sanitized plain-text diagnostic report ready for clipboard / paste. */
  buildDiagnosticsReport: () => Promise<string>;
  /** Undo the launcher's mutations (delete UEVR folder, profile, restore INI backup). */
  resetEverything: () => Promise<ResetResult>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  readSettings: () => Promise<AppSettings>;
  writeSettings: (settings: AppSettings) => Promise<void>;
  browseForModFile: () => Promise<string | null>;
  listMods: () => Promise<ModEntry[]>;
  enableMod: (fileName: string) => Promise<void>;
  disableMod: (fileName: string) => Promise<void>;
  installModFromPath: (sourcePath: string) => Promise<void>;
  uninstallMod: (fileName: string) => Promise<void>;
  getCameraPresets: () => Promise<CameraPreset[]>;
  setCameraPreset: (preset: CameraPreset) => Promise<void>;
  createBackup: () => Promise<void>;
  restoreBackup: () => Promise<void>;
  onUEVRProgress: (callback: (percent: number) => void) => () => void;
  onSetupProgress: (callback: (step: SetupStepStatus) => void) => () => void;
  onLaunchUpdate: (callback: (step: LaunchStepStatus) => void) => () => void;
  onLog: (callback: (line: string) => void) => () => void;
}
