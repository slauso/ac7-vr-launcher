import fs from 'node:fs';
import path from 'node:path';
import type { CameraPreset, UEVRRuntimeOptions } from '@shared/types';

const DEFAULT_RUNTIME_OPTIONS: UEVRRuntimeOptions = {
  renderingMethod: 'synchronized-sequential',
  runtime: 'openxr',
  ghostingFix: true,
  overlaysEnabled: true,
  performanceHud: false,
  controllerBindingsOverlay: false,
  recenterPrompt: true
};

const DEFAULT_CAMERA_PRESETS: CameraPreset[] = [
  { id: 'inside-cockpit', name: 'Inside Cockpit', mode: 'inside-cockpit', fov: 90, offsetX: 0, offsetY: 0, offsetZ: 0, pitch: 0, yaw: 0, roll: 0 },
  { id: 'outside-chase', name: 'Outside / Chase', mode: 'outside-chase', fov: 80, offsetX: 0, offsetY: 1.2, offsetZ: -4, pitch: 5, yaw: 0, roll: 0 },
  { id: 'free-cinematic', name: 'Free / Cinematic', mode: 'free-cinematic', fov: 70, offsetX: 0, offsetY: 0.5, offsetZ: -6, pitch: 0, yaw: 0, roll: 0 }
];

const CONFIG_KEY_MAP: Record<keyof UEVRRuntimeOptions, string> = {
  renderingMethod: 'rendering_method',
  runtime: 'runtime',
  ghostingFix: 'ghosting_fix',
  overlaysEnabled: 'overlays_enabled',
  performanceHud: 'overlay_perf_hud',
  controllerBindingsOverlay: 'overlay_controller_bindings',
  recenterPrompt: 'overlay_recenter_prompt'
};

export const camerasFileName = 'cameras.json';

const parseConfigText = (text: string): Record<string, string> => {
  const lines = text.split(/\r?\n/);
  const out: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    out[key.trim()] = rest.join('=').trim();
  }
  return out;
};

const stringifyConfigText = (kv: Record<string, string>): string =>
  `${Object.entries(kv).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;

const ensureProfileDir = async (profileDir: string): Promise<void> => {
  await fs.promises.mkdir(profileDir, { recursive: true });
};

export const readRuntimeOptions = async (profileDir: string): Promise<UEVRRuntimeOptions> => {
  await ensureProfileDir(profileDir);
  const configPath = path.join(profileDir, 'config.txt');
  if (!fs.existsSync(configPath)) return DEFAULT_RUNTIME_OPTIONS;
  const parsed = parseConfigText(await fs.promises.readFile(configPath, 'utf8'));
  const current: UEVRRuntimeOptions = { ...DEFAULT_RUNTIME_OPTIONS };
  (Object.keys(CONFIG_KEY_MAP) as Array<keyof UEVRRuntimeOptions>).forEach((key) => {
    const configKey = CONFIG_KEY_MAP[key];
    const value = parsed[configKey];
    if (value === undefined) return;
    if (typeof DEFAULT_RUNTIME_OPTIONS[key] === 'boolean') {
      (current[key] as boolean) = value === 'true' || value === '1';
    } else {
      (current[key] as string) = value;
    }
  });
  return current;
};

export const writeRuntimeOptions = async (profileDir: string, options: UEVRRuntimeOptions): Promise<void> => {
  await ensureProfileDir(profileDir);
  const configPath = path.join(profileDir, 'config.txt');
  const existing = fs.existsSync(configPath)
    ? parseConfigText(await fs.promises.readFile(configPath, 'utf8'))
    : {};
  (Object.keys(CONFIG_KEY_MAP) as Array<keyof UEVRRuntimeOptions>).forEach((key) => {
    const configKey = CONFIG_KEY_MAP[key];
    const value = options[key];
    existing[configKey] = typeof value === 'boolean' ? String(value) : value;
  });
  await fs.promises.writeFile(configPath, stringifyConfigText(existing), 'utf8');
};

const cameraPresetToText = (preset: CameraPreset): string =>
  `${preset.id}|${preset.name}|${preset.mode}|${preset.fov}|${preset.offsetX}|${preset.offsetY}|${preset.offsetZ}|${preset.pitch}|${preset.yaw}|${preset.roll}`;

export const serializeCameraPresets = (presets: CameraPreset[]): string =>
  `${presets.map(cameraPresetToText).join('\n')}\n`;

export const readCameraPresets = async (profileDir: string): Promise<CameraPreset[]> => {
  await ensureProfileDir(profileDir);
  const cameraFile = path.join(profileDir, camerasFileName);
  if (!fs.existsSync(cameraFile)) return DEFAULT_CAMERA_PRESETS;
  const parsed = JSON.parse(await fs.promises.readFile(cameraFile, 'utf8')) as CameraPreset[];
  return parsed.length > 0 ? parsed : DEFAULT_CAMERA_PRESETS;
};

export const writeCameraPreset = async (profileDir: string, preset: CameraPreset): Promise<void> => {
  const all = await readCameraPresets(profileDir);
  const next = [...all.filter((item) => item.id !== preset.id), preset];
  // cameras.json is the editable source-of-truth for launcher UI presets.
  // cameras.txt mirrors the same data in a line format for compatibility with
  // existing UEVR profile tooling that expects text-based camera entries.
  await fs.promises.writeFile(path.join(profileDir, camerasFileName), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await fs.promises.writeFile(path.join(profileDir, 'cameras.txt'), serializeCameraPresets(next), 'utf8');
};
