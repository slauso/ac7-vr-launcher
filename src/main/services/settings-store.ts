import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '@shared/types';

export const defaultSettings: AppSettings = {
  theme: 'dark-blue',
  autoUpdateUEVR: true,
  minimizeToTray: false,
  defaultVRRuntime: 'openxr',
  defaultRenderingMethod: 'synchronized-sequential',
  autoInjectUEVR: true,
  launchOptions: ''
};

const migrateSettings = (parsed: Partial<AppSettings>): AppSettings => {
  // Backward compatibility: older settings only had `defaultAc7Path`.
  // We promote it to `ac7Path` while still writing both keys.
  const ac7Path = parsed.ac7Path ?? parsed.defaultAc7Path;
  return { ...defaultSettings, ...parsed, ac7Path, defaultAc7Path: ac7Path };
};

export const readSettingsFromPath = async (settingsPath: string): Promise<AppSettings> => {
  if (!fs.existsSync(settingsPath)) return defaultSettings;
  const parsed = JSON.parse(await fs.promises.readFile(settingsPath, 'utf8')) as Partial<AppSettings>;
  return migrateSettings(parsed);
};

export const writeSettingsToPath = async (settingsPath: string, settings: AppSettings): Promise<void> => {
  await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.promises.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
};
