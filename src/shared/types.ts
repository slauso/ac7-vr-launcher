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

export interface PathOverrides {
  steamExePath?: string;
  steamVRPath?: string;
  ac7InstallPath?: string;
  virtualDesktopPath?: string;
  uevrInjectorPath?: string;
  uevrSettingsPath?: string;
  ac7ModsPath?: string;
  ac7LoaderPath?: string;
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
  /**
   * True when the elevated injector Scheduled Task (`AC7VRLauncher_UEVRInject`)
   * is registered. When present, Launch VR triggers it via `schtasks /Run` and
   * skips the per-launch UAC prompt.
   */
  injectorTaskRegistered: boolean;
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
  autoUpdateUEVR: boolean;
  minimizeToTray: boolean;
  paths: PathOverrides;
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

export interface UEVRSettingItem {
  key: string;
  value: string;
  category: string;
  label: string;
  description: string;
  known: boolean;
}

export interface UEVRSettingsDocument {
  settingsDir: string;
  settingsFile: string;
  items: UEVRSettingItem[];
}

export type ModType = 'pak' | 'dll' | 'config';

export interface ModRecord {
  id: string;
  name: string;
  type: ModType;
  enabled: boolean;
  version?: string;
  source: string;
  installTargets: string[];
  order: number;
  installedAt: string;
}

export interface AddModRequest {
  sourcePath: string;
  name?: string;
  type?: ModType;
  ac7Path?: string;
  modsDir?: string;
  loaderDir?: string;
}

export interface AddModResult {
  added: ModRecord;
  mods: ModRecord[];
}

export interface AC7Api {
  checkDependencies: () => Promise<DependencyCheckResult>;
  detectSoftware: (manualPath?: string, overrides?: PathOverrides) => Promise<SoftwareDetectionResult>;
  openExternal: (url: string) => Promise<void>;
  browseForFolder: () => Promise<string | null>;
  browseForFile: (extensions?: string[]) => Promise<string | null>;
  browseForModSource: () => Promise<string | null>;
  getUEVRStatus: () => Promise<UEVRStatus>;
  updateUEVR: () => Promise<UEVRStatus>;
  /** One-click: download UEVR + deploy AC7 profile + apply game config */
  fullSetup: (ac7Path?: string, overrides?: PathOverrides) => Promise<void>;
  applyDefaultProfile: () => Promise<string>;
  importProfile: () => Promise<string | null>;
  exportProfile: () => Promise<string | null>;
  getUEVRSettings: (settingsPath?: string) => Promise<UEVRSettingsDocument>;
  saveUEVRSettings: (items: Array<Pick<UEVRSettingItem, 'key' | 'value'>>, settingsPath?: string) => Promise<string>;
  importUEVRSettings: (settingsPath?: string) => Promise<UEVRSettingsDocument | null>;
  exportUEVRSettings: (items: Array<Pick<UEVRSettingItem, 'key' | 'value'>>, settingsPath?: string) => Promise<string | null>;
  applyGameConfig: (settings: ProfileSettings) => Promise<string>;
  launchVR: (ac7Path?: string, options?: { extraWarmup?: boolean; overrides?: PathOverrides }) => Promise<void>;
  abortLaunch: () => Promise<void>;
  /** Re-run dependency + software detection, returning structured issues for pre-flight. */
  preflightCheck: (ac7Path?: string, overrides?: PathOverrides) => Promise<PreflightResult>;
  /** Execute a one-click remedy by id. */
  runFixAction: (action: FixActionId, ac7Path?: string) => Promise<FixActionResult>;
  /** Build a sanitized plain-text diagnostic report ready for clipboard / paste. */
  buildDiagnosticsReport: () => Promise<string>;
  exportDiagnosticsBundle: () => Promise<string | null>;
  exportLogs: (lines: string[]) => Promise<string | null>;
  /** Undo the launcher's mutations (delete UEVR folder, profile, restore INI backup). */
  resetEverything: () => Promise<ResetResult>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  listMods: () => Promise<ModRecord[]>;
  addMod: (request: AddModRequest) => Promise<AddModResult>;
  setModEnabled: (id: string, enabled: boolean, ac7Path?: string, modsDir?: string, loaderDir?: string) => Promise<ModRecord[]>;
  removeMod: (id: string) => Promise<ModRecord[]>;
  reorderMods: (orderedIds: string[]) => Promise<ModRecord[]>;
  onUEVRProgress: (callback: (percent: number) => void) => () => void;
  onSetupProgress: (callback: (step: SetupStepStatus) => void) => () => void;
  onLaunchUpdate: (callback: (step: LaunchStepStatus) => void) => () => void;
  onLog: (callback: (line: string) => void) => () => void;
}
