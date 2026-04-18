import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { UEVRSettingItem, UEVRSettingsDocument } from '@shared/types';

const DEFAULT_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'UnrealVRMod');
const PREFERRED_FILES = ['settings.txt', 'config.txt', 'uevr-settings.txt', 'frontend.txt', 'frontend.cfg'];
// We accept ':' or '=' when reading for compatibility with existing files,
// but always write "key=value" for consistency.
const KEY_VALUE_REGEX = /^([^:=\s]+)\s*[:=]\s*(.*)$/;

interface SettingMeta {
  category: string;
  label: string;
  description: string;
}

const KNOWN_SETTINGS: Record<string, SettingMeta> = {
  FrameworkConfig_AdvancedView: {
    category: 'Interface',
    label: 'Advanced view',
    description: 'Shows additional advanced controls in the injector.'
  },
  FrameworkConfig_AlwaysShowCursor: {
    category: 'Interface',
    label: 'Always show cursor',
    description: 'Keeps the cursor visible inside the injector UI.'
  },
  FrameworkConfig_EnableL3R3Toggle: {
    category: 'Input',
    label: 'Enable L3+R3 toggle',
    description: 'Lets controller L3+R3 combo toggle the menu.'
  },
  FrameworkConfig_FontSize: {
    category: 'Interface',
    label: 'UI font size',
    description: 'Adjusts injector menu text size.'
  },
  FrameworkConfig_ImGuiTheme: {
    category: 'Interface',
    label: 'Theme',
    description: 'Selects the injector theme preset.'
  },
  FrameworkConfig_LogLevel: {
    category: 'Diagnostics',
    label: 'Log level',
    description: 'Controls logging verbosity.'
  },
  FrameworkConfig_MenuKey: {
    category: 'Input',
    label: 'Menu key',
    description: 'Keyboard key code used to open the injector menu.'
  },
  Frontend_RequestedRuntime: {
    category: 'Runtime',
    label: 'Requested runtime',
    description: 'Preferred VR runtime for injection.'
  },
  LuaLoader_GarbageCollectionMultiplier: {
    category: 'Lua',
    label: 'Lua GC multiplier',
    description: 'Lua garbage collection tuning.'
  }
};

const prettifyKey = (key: string): string =>
  key
    .replace(/^FrameworkConfig_/, '')
    .replace(/^Frontend_/, '')
    .replace(/^LuaLoader_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

const classify = (key: string): SettingMeta => {
  const known = KNOWN_SETTINGS[key];
  if (known) return known;
  if (key.startsWith('FrameworkConfig_')) {
    return { category: 'Framework', label: prettifyKey(key), description: 'Framework-level UEVR behavior.' };
  }
  if (key.startsWith('Frontend_')) {
    return { category: 'Frontend', label: prettifyKey(key), description: 'UEVR frontend preference.' };
  }
  if (key.startsWith('LuaLoader_')) {
    return { category: 'Lua', label: prettifyKey(key), description: 'Lua loader/runtime tuning.' };
  }
  return { category: 'Other', label: prettifyKey(key) || key, description: 'Unmapped raw UEVR setting.' };
};

const toItem = (key: string, value: string): UEVRSettingItem => {
  const meta = classify(key);
  return {
    key,
    value,
    category: meta.category,
    label: meta.label,
    description: meta.description,
    known: Boolean(KNOWN_SETTINGS[key])
  };
};

export class UEVRSettingsService {
  public getDefaultDir(): string {
    return DEFAULT_DIR;
  }

  public async read(settingsDir?: string): Promise<UEVRSettingsDocument> {
    const dir = settingsDir || DEFAULT_DIR;
    await fs.promises.mkdir(dir, { recursive: true });
    const settingsFile = await this.resolveSettingsFile(dir);
    const items = await this.readFileItems(settingsFile);
    return { settingsDir: dir, settingsFile, items };
  }

  public async write(items: Array<Pick<UEVRSettingItem, 'key' | 'value'>>, settingsDir?: string): Promise<string> {
    const dir = settingsDir || DEFAULT_DIR;
    await fs.promises.mkdir(dir, { recursive: true });
    const settingsFile = await this.resolveSettingsFile(dir);
    const lines = items
      .filter((item) => item.key.trim().length > 0)
      .map((item) => `${item.key}=${item.value}`);
    await fs.promises.writeFile(settingsFile, `${lines.join('\n')}\n`, 'utf8');
    return settingsFile;
  }

  public async importFrom(inputPath: string, settingsDir?: string): Promise<UEVRSettingsDocument> {
    const dir = settingsDir || DEFAULT_DIR;
    await fs.promises.mkdir(dir, { recursive: true });
    const settingsFile = await this.resolveSettingsFile(dir);
    await fs.promises.copyFile(inputPath, settingsFile);
    return this.read(dir);
  }

  public async exportTo(outputPath: string, items: Array<Pick<UEVRSettingItem, 'key' | 'value'>>, settingsDir?: string): Promise<string> {
    const dir = settingsDir || DEFAULT_DIR;
    const settingsFile = await this.write(items, dir);
    await fs.promises.copyFile(settingsFile, outputPath);
    return outputPath;
  }

  private async resolveSettingsFile(dir: string): Promise<string> {
    for (const fileName of PREFERRED_FILES) {
      const full = path.join(dir, fileName);
      if (fs.existsSync(full)) return full;
    }
    const candidates = (await fs.promises.readdir(dir)).filter((name) => /\.(txt|cfg|ini)$/i.test(name));
    if (candidates.length > 0) return path.join(dir, candidates[0]);
    return path.join(dir, 'settings.txt');
  }

  private async readFileItems(filePath: string): Promise<UEVRSettingItem[]> {
    if (!fs.existsSync(filePath)) return [];
    const text = await fs.promises.readFile(filePath, 'utf8');
    const items = new Map<string, UEVRSettingItem>();
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith(';') || line.startsWith('//')) continue;
      const match = line.match(KEY_VALUE_REGEX);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim();
      items.set(key, toItem(key, value));
    }
    return [...items.values()].sort((a, b) => a.category.localeCompare(b.category) || a.key.localeCompare(b.key));
  }
}
