import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { ModEntry } from '@shared/types';

const MOD_FILE_EXTENSIONS = new Set(['.pak', '.ucas', '.utoc']);

interface ModMeta {
  description?: string;
  type?: 'skin' | 'mod';
  aircraft?: string;
}

const readMeta = async (basePathWithoutExt: string): Promise<ModMeta | null> => {
  const metaPath = `${basePathWithoutExt}.json`;
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(await fs.promises.readFile(metaPath, 'utf8')) as ModMeta;
  } catch {
    return null;
  }
};

const toEntry = async (fullPath: string, enabled: boolean): Promise<ModEntry> => {
  const stat = await fs.promises.stat(fullPath);
  const ext = path.extname(fullPath).toLowerCase();
  const base = fullPath.slice(0, fullPath.length - ext.length);
  const meta = await readMeta(base);
  const fileName = path.basename(fullPath);
  const type = meta?.type ?? (/skin|livery/i.test(fileName) ? 'skin' : 'mod');
  const thumbnailPath = `${base}.preview.png`;
  return {
    fileName,
    fullPath,
    enabled,
    size: stat.size,
    dateAdded: stat.birthtime.toISOString(),
    description: meta?.description,
    type,
    aircraft: meta?.aircraft,
    thumbnailPath: fs.existsSync(thumbnailPath) ? thumbnailPath : undefined
  };
};

const modRoot = (ac7Path: string) => path.join(ac7Path, 'Game', 'Content', 'Paks');
const enabledDir = (ac7Path: string) => path.join(modRoot(ac7Path), '~mods');
const disabledDir = (ac7Path: string) => path.join(modRoot(ac7Path), '~mods_disabled');

const listFiles = async (dir: string): Promise<string[]> => {
  if (!fs.existsSync(dir)) return [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(dir, entry.name));
};

const isModFile = (filePath: string) => MOD_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());

const moveModFileSet = async (sourceRoot: string, destinationRoot: string, fileName: string): Promise<void> => {
  const source = path.join(sourceRoot, fileName);
  if (!fs.existsSync(source)) throw new Error(`Mod file not found: ${fileName}`);
  await fs.promises.mkdir(destinationRoot, { recursive: true });
  await fs.promises.rename(source, path.join(destinationRoot, fileName));
  const sidecars = ['.json', '.preview.png'];
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  for (const suffix of sidecars) {
    const sidecar = path.join(sourceRoot, `${stem}${suffix}`);
    if (fs.existsSync(sidecar)) {
      await fs.promises.rename(sidecar, path.join(destinationRoot, `${stem}${suffix}`));
    }
  }
};

export const listModsInPath = async (ac7Path: string): Promise<ModEntry[]> => {
  const [enabledFiles, disabledFiles] = await Promise.all([listFiles(enabledDir(ac7Path)), listFiles(disabledDir(ac7Path))]);
  const enabledEntries = await Promise.all(enabledFiles.filter(isModFile).map((filePath) => toEntry(filePath, true)));
  const disabledEntries = await Promise.all(disabledFiles.filter(isModFile).map((filePath) => toEntry(filePath, false)));
  return [...enabledEntries, ...disabledEntries].sort((a, b) => a.fileName.localeCompare(b.fileName));
};

export const enableModInPath = async (ac7Path: string, fileName: string): Promise<void> =>
  moveModFileSet(disabledDir(ac7Path), enabledDir(ac7Path), fileName);

export const disableModInPath = async (ac7Path: string, fileName: string): Promise<void> =>
  moveModFileSet(enabledDir(ac7Path), disabledDir(ac7Path), fileName);

const copyIfExists = async (source: string, destinationDir: string): Promise<void> => {
  if (!fs.existsSync(source)) return;
  await fs.promises.copyFile(source, path.join(destinationDir, path.basename(source)));
};

export const installModFromPathToAc7 = async (ac7Path: string, sourcePath: string): Promise<void> => {
  const targetDir = enabledDir(ac7Path);
  await fs.promises.mkdir(targetDir, { recursive: true });
  const ext = path.extname(sourcePath).toLowerCase();

  if (ext === '.zip') {
    const zip = new AdmZip(sourcePath);
    const entries = zip.getEntries();
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryExt = path.extname(entry.entryName).toLowerCase();
      if (!['.pak', '.ucas', '.utoc', '.json', '.png'].includes(entryExt)) continue;
      const dest = path.join(targetDir, path.basename(entry.entryName));
      await fs.promises.writeFile(dest, entry.getData());
    }
    return;
  }

  if (!MOD_FILE_EXTENSIONS.has(ext)) {
    throw new Error('Unsupported file type. Select a .zip, .pak, .ucas, or .utoc file.');
  }

  const base = sourcePath.slice(0, sourcePath.length - ext.length);
  await fs.promises.copyFile(sourcePath, path.join(targetDir, path.basename(sourcePath)));
  await copyIfExists(`${base}.json`, targetDir);
  await copyIfExists(`${base}.preview.png`, targetDir);
};

export const uninstallModFromAc7Path = async (ac7Path: string, fileName: string): Promise<void> => {
  for (const root of [enabledDir(ac7Path), disabledDir(ac7Path)]) {
    const target = path.join(root, fileName);
    if (fs.existsSync(target)) {
      await fs.promises.rm(target, { force: true });
      const ext = path.extname(fileName);
      const stem = fileName.slice(0, fileName.length - ext.length);
      await fs.promises.rm(path.join(root, `${stem}.json`), { force: true });
      await fs.promises.rm(path.join(root, `${stem}.preview.png`), { force: true });
      return;
    }
  }
  throw new Error(`Mod not found: ${fileName}`);
};
