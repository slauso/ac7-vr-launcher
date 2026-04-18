import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { UEVRReleaseInfo, UEVRStatus } from '@shared/types';
import { downloadFile } from '../utils/download';
import { removeInjectorTask, taskExists } from '../utils/scheduled-task';
import { BackupManager } from './backup-manager';

/** Directory where UEVR reads game-specific configs */
const UEVR_GAMES_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'UnrealVR', 'games');
/** Process name without extension for Ace Combat 7 — used as UEVR's game profile directory name */
const AC7_PROCESS_NAME = 'Ace7Game-Win64-Shipping';
const UEVR_RELEASE_MANIFEST_REL = path.join('resources', 'uevr', 'uevr-release.json');

export class UEVRManager {
  constructor(private readonly managedRoot: string, private readonly backupManager?: BackupManager) {}

  public get managedPath(): string {
    return path.join(this.managedRoot, 'uevr');
  }

  public get ac7ProfileDir(): string {
    return path.join(UEVR_GAMES_DIR, AC7_PROCESS_NAME);
  }

  private getReleaseManifestPath(): string {
    const distPath = path.resolve(__dirname, '..', '..', '..', UEVR_RELEASE_MANIFEST_REL);
    if (fs.existsSync(distPath)) return distPath;
    return path.resolve(process.cwd(), UEVR_RELEASE_MANIFEST_REL);
  }

  public async getPinnedRelease(): Promise<UEVRReleaseInfo> {
    const manifestPath = this.getReleaseManifestPath();
    const manifestJson = await fs.promises.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestJson) as Partial<UEVRReleaseInfo>;

    if (
      !manifest.version
      || !manifest.assetName
      || !manifest.downloadUrl
      || !manifest.sha256
      || !manifest.releasePageUrl
    ) {
      throw new Error(`Invalid UEVR release manifest at ${manifestPath}`);
    }

    return {
      version: manifest.version,
      assetName: manifest.assetName,
      downloadUrl: manifest.downloadUrl,
      sha256: manifest.sha256,
      releasePageUrl: manifest.releasePageUrl
    };
  }

  /** Deploy the AC7-specific UEVR config to the location UEVR reads at injection time */
  public async deployAC7Profile(configSourcePath: string): Promise<void> {
    await fs.promises.mkdir(this.ac7ProfileDir, { recursive: true });
    const destPath = path.join(this.ac7ProfileDir, 'config.txt');
    // Snapshot any existing deployed config before overwriting so "Reset
    // everything" / "Undo last setup" can restore it.
    if (this.backupManager) {
      try {
        await this.backupManager.snapshotFile(destPath);
      } catch {
        // Non-fatal.
      }
    }
    await fs.promises.copyFile(configSourcePath, destPath);
  }

  /**
   * Wipe the launcher-managed UEVR install and the deployed AC7 profile.
   * Used by the "Reset everything" maintenance action. Returns a list of
   * human-readable bullets describing what was removed.
   */
  public async resetManagedState(): Promise<{
    removedUevr: boolean;
    removedProfile: boolean;
    removedInjectorTask: boolean;
    details: string[];
  }> {
    const details: string[] = [];
    let removedUevr = false;
    let removedProfile = false;

    if (fs.existsSync(this.managedPath)) {
      await fs.promises.rm(this.managedPath, { recursive: true, force: true });
      removedUevr = true;
      details.push(`Removed UEVR install at ${this.managedPath}`);
    }
    if (fs.existsSync(this.ac7ProfileDir)) {
      await fs.promises.rm(this.ac7ProfileDir, { recursive: true, force: true });
      removedProfile = true;
      details.push(`Removed deployed AC7 profile at ${this.ac7ProfileDir}`);
    }

    // Best-effort: also drop the elevated injector scheduled task. This may
    // trigger a UAC prompt because deleting an elevated task is itself an
    // elevated operation; the user already opted in to "Reset everything".
    let removedInjectorTask = false;
    try {
      removedInjectorTask = await removeInjectorTask();
      if (removedInjectorTask) {
        details.push('Removed elevated UEVR injector scheduled task');
      }
    } catch (err) {
      details.push(`Warning: failed to remove injector scheduled task — ${(err as Error).message}`);
    }

    return { removedUevr, removedProfile, removedInjectorTask, details };
  }

  public async getStatus(): Promise<UEVRStatus> {
    await fs.promises.mkdir(this.managedPath, { recursive: true });
    const versionFile = path.join(this.managedPath, 'version.txt');
    const installedVersion = fs.existsSync(versionFile)
      ? (await fs.promises.readFile(versionFile, 'utf8')).trim()
      : undefined;

    const injectorExists = fs.existsSync(path.join(this.managedPath, 'UEVRInjector.exe'));
    const profileDeployed = fs.existsSync(path.join(this.ac7ProfileDir, 'config.txt'));
    const injectorTaskRegistered = taskExists();

    return {
      installedVersion,
      managedPath: this.managedPath,
      injectorExists,
      profileDeployed,
      injectorTaskRegistered
    };
  }

  public async update(onProgress: (percent: number) => void): Promise<UEVRStatus> {
    await fs.promises.mkdir(this.managedPath, { recursive: true });
    const latest = await this.getPinnedRelease();

    const archivePath = path.join(this.managedPath, latest.assetName);
    await downloadFile(latest.downloadUrl, archivePath, onProgress);
    const actualSha = await this.computeFileSha256(archivePath);
    if (actualSha !== latest.sha256.toLowerCase()) {
      await fs.promises.unlink(archivePath).catch(() => undefined);
      throw new Error('UEVR download failed integrity check — refusing to install');
    }

    const zip = new AdmZip(archivePath);
    zip.extractAllTo(this.managedPath, true);

    await fs.promises.writeFile(path.join(this.managedPath, 'version.txt'), `${latest.version}\n`, 'utf8');
    await fs.promises.unlink(archivePath).catch(() => undefined);

    const status = await this.getStatus();
    if (!status.injectorExists) {
      throw new Error('UEVR extraction succeeded but UEVRInjector.exe is missing');
    }

    return { ...status, latestVersion: latest.version };
  }

  private async computeFileSha256(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve());
    });
    return hash.digest('hex');
  }
}
