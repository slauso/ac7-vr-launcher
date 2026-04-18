import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { AddModRequest, ModRecord, ModType } from '@shared/types';

interface ModManifest {
  mods: ModRecord[];
}

const ensureDir = async (dir: string): Promise<void> => {
  await fs.promises.mkdir(dir, { recursive: true });
};

const copyDir = async (fromDir: string, toDir: string): Promise<void> => {
  await ensureDir(toDir);
  const entries = await fs.promises.readdir(fromDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(fromDir, entry.name);
    const dest = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(src, dest);
    } else if (entry.isFile()) {
      await ensureDir(path.dirname(dest));
      await fs.promises.copyFile(src, dest);
    }
  }
};

const walkFiles = async (dir: string): Promise<string[]> => {
  const result: string[] = [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walkFiles(full)));
    } else if (entry.isFile()) {
      result.push(full);
    }
  }
  return result;
};

const stripDisabledSuffix = (target: string): string => target.replace(/\.disabled$/i, '');

const detectType = (sourcePath: string, stagedFiles: string[]): ModType => {
  const lowerSource = sourcePath.toLowerCase();
  const lowerFiles = stagedFiles.map((file) => file.toLowerCase());
  if (lowerFiles.some((file) => file.endsWith('.pak'))) return 'pak';
  if (lowerFiles.some((file) => file.endsWith('.dll'))) return 'dll';
  if (lowerFiles.some((file) => file.endsWith('.ini') || file.endsWith('.cfg'))) return 'config';
  if (lowerSource.endsWith('.pak')) return 'pak';
  return 'dll';
};

const safeName = (input: string): string => input.replace(/[^\w.-]+/g, '_');

export class ModManager {
  private readonly modsRoot: string;
  private readonly manifestPath: string;

  constructor(private readonly managedRoot: string) {
    this.modsRoot = path.join(this.managedRoot, 'mods');
    this.manifestPath = path.join(this.managedRoot, 'mods.json');
  }

  public async list(): Promise<ModRecord[]> {
    const data = await this.readManifest();
    return data.mods.sort((a, b) => a.order - b.order);
  }

  public async add(request: AddModRequest): Promise<{ added: ModRecord; mods: ModRecord[] }> {
    if (!request.ac7Path) {
      throw new Error('Ace Combat 7 path is required to install mods.');
    }
    await ensureDir(this.modsRoot);
    const manifest = await this.readManifest();
    const id = crypto.randomUUID();
    const stageDir = path.join(this.modsRoot, id);
    await ensureDir(stageDir);
    await this.stageSource(request.sourcePath, stageDir);

    const files = await walkFiles(stageDir);
    const type = request.type ?? detectType(request.sourcePath, files);
    const order = manifest.mods.length + 1;
    const name = request.name?.trim() || path.basename(request.sourcePath).replace(/\.(zip|pak|rar|7z)$/i, '');
    const installTargets = await this.installFromStage({
      id,
      type,
      order,
      stageDir,
      ac7Path: request.ac7Path,
      modsDir: request.modsDir,
      loaderDir: request.loaderDir
    });

    const added: ModRecord = {
      id,
      name,
      type,
      enabled: true,
      source: request.sourcePath,
      installTargets,
      order,
      installedAt: new Date().toISOString()
    };
    manifest.mods.push(added);
    await this.writeManifest(manifest);
    return { added, mods: manifest.mods.sort((a, b) => a.order - b.order) };
  }

  public async setEnabled(id: string, enabled: boolean): Promise<ModRecord[]> {
    const manifest = await this.readManifest();
    const mod = manifest.mods.find((entry) => entry.id === id);
    if (!mod) throw new Error(`Mod not found: ${id}`);
    for (const target of mod.installTargets) {
      if (mod.type === 'config') {
        const base = stripDisabledSuffix(target);
        const disabledPath = `${base}.disabled`;
        if (enabled && fs.existsSync(disabledPath)) await fs.promises.rename(disabledPath, base);
        if (!enabled && fs.existsSync(base)) await fs.promises.rename(base, disabledPath);
        continue;
      }
      const base = stripDisabledSuffix(target);
      const disabledPath = `${base}.disabled`;
      if (enabled && fs.existsSync(disabledPath)) await fs.promises.rename(disabledPath, base);
      if (!enabled && fs.existsSync(base)) await fs.promises.rename(base, disabledPath);
    }
    mod.enabled = enabled;
    await this.writeManifest(manifest);
    return manifest.mods.sort((a, b) => a.order - b.order);
  }

  public async remove(id: string): Promise<ModRecord[]> {
    const manifest = await this.readManifest();
    const mod = manifest.mods.find((entry) => entry.id === id);
    if (!mod) return manifest.mods;
    for (const target of mod.installTargets) {
      await fs.promises.rm(target, { force: true });
      await fs.promises.rm(`${stripDisabledSuffix(target)}.disabled`, { force: true });
    }
    await fs.promises.rm(path.join(this.modsRoot, id), { recursive: true, force: true });
    const next = manifest.mods.filter((entry) => entry.id !== id).map((entry, index) => ({ ...entry, order: index + 1 }));
    await this.writeManifest({ mods: next });
    return next;
  }

  public async reorder(orderedIds: string[]): Promise<ModRecord[]> {
    const manifest = await this.readManifest();
    const byId = new Map(manifest.mods.map((mod) => [mod.id, mod]));
    const reordered: ModRecord[] = [];
    for (const id of orderedIds) {
      const mod = byId.get(id);
      if (mod) reordered.push(mod);
    }
    for (const mod of manifest.mods) {
      if (!orderedIds.includes(mod.id)) reordered.push(mod);
    }
    reordered.forEach((mod, index) => {
      mod.order = index + 1;
    });
    await this.writeManifest({ mods: reordered });
    return reordered;
  }

  private async stageSource(sourcePath: string, stageDir: string): Promise<void> {
    const stat = await fs.promises.stat(sourcePath);
    if (stat.isDirectory()) {
      await copyDir(sourcePath, stageDir);
      return;
    }
    if (sourcePath.toLowerCase().endsWith('.zip')) {
      const zip = new AdmZip(sourcePath);
      zip.extractAllTo(stageDir, true);
      return;
    }
    await fs.promises.copyFile(sourcePath, path.join(stageDir, path.basename(sourcePath)));
  }

  private async installFromStage(params: {
    id: string;
    type: ModType;
    order: number;
    stageDir: string;
    ac7Path: string;
    modsDir?: string;
    loaderDir?: string;
  }): Promise<string[]> {
    const files = await walkFiles(params.stageDir);
    if (params.type === 'pak') {
      const modsDir = params.modsDir || path.join(params.ac7Path, 'Game', 'Content', 'Paks', '~mods');
      await ensureDir(modsDir);
      const pakFiles = files.filter((file) => file.toLowerCase().endsWith('.pak'));
      const targets: string[] = [];
      for (const file of pakFiles) {
        const renamed = `${String(params.order).padStart(3, '0')}_${safeName(path.basename(file))}`;
        const target = path.join(modsDir, renamed);
        await fs.promises.copyFile(file, target);
        targets.push(target);
      }
      return targets;
    }
    if (params.type === 'dll') {
      const loaderDir = params.loaderDir || path.join(params.ac7Path, 'Game', 'Binaries', 'Win64', 'mods-loader');
      await ensureDir(loaderDir);
      const targets: string[] = [];
      for (const file of files) {
        const rel = path.relative(params.stageDir, file);
        const target = path.join(loaderDir, rel);
        await ensureDir(path.dirname(target));
        await fs.promises.copyFile(file, target);
        targets.push(target);
      }
      return targets;
    }

    const targets: string[] = [];
    for (const file of files.filter((entry) => /\.(ini|cfg|txt)$/i.test(entry))) {
      const rel = path.relative(params.stageDir, file);
      const target = path.join(params.ac7Path, rel);
      await ensureDir(path.dirname(target));
      const patchText = await fs.promises.readFile(file, 'utf8');
      const markerStart = `; AC7VRLauncher Patch ${params.id} START`;
      const markerEnd = `; AC7VRLauncher Patch ${params.id} END`;
      const existing = fs.existsSync(target) ? await fs.promises.readFile(target, 'utf8') : '';
      const cleaned = existing.replace(
        new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}\\n?`, 'g'),
        ''
      );
      const merged = `${cleaned.trimEnd()}\n${markerStart}\n${patchText.trim()}\n${markerEnd}\n`;
      await fs.promises.writeFile(target, merged, 'utf8');
      targets.push(target);
    }
    return targets;
  }

  private async readManifest(): Promise<ModManifest> {
    await ensureDir(this.managedRoot);
    if (!fs.existsSync(this.manifestPath)) return { mods: [] };
    const parsed = JSON.parse(await fs.promises.readFile(this.manifestPath, 'utf8')) as Partial<ModManifest>;
    return { mods: parsed.mods ?? [] };
  }

  private async writeManifest(manifest: ModManifest): Promise<void> {
    await ensureDir(this.managedRoot);
    await fs.promises.writeFile(this.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
}
