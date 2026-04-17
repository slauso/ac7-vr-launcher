import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { UEVRReleaseInfo, UEVRStatus } from '@shared/types';
import { downloadFile } from '../utils/download';
import { BackupManager } from './backup-manager';

interface GitHubRelease {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

/** Directory where UEVR reads game-specific configs */
const UEVR_GAMES_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'UnrealVR', 'games');
/** Process name without extension for Ace Combat 7 — used as UEVR's game profile directory name */
const AC7_PROCESS_NAME = 'Ace7Game-Win64-Shipping';

export class UEVRManager {
  constructor(private readonly managedRoot: string, private readonly backupManager?: BackupManager) {}

  public get managedPath(): string {
    return path.join(this.managedRoot, 'uevr');
  }

  public get ac7ProfileDir(): string {
    return path.join(UEVR_GAMES_DIR, AC7_PROCESS_NAME);
  }

  public async getLatestRelease(): Promise<UEVRReleaseInfo> {
    const json = await new Promise<string>((resolve, reject) => {
      https
        .get(
          'https://api.github.com/repos/praydog/UEVR/releases/latest',
          { headers: { 'User-Agent': 'ac7-vr-launcher', Accept: 'application/vnd.github+json' } },
          (response) => {
            if (response.statusCode !== 200) {
              reject(new Error(`GitHub API failed with status ${response.statusCode}`));
              return;
            }
            let data = '';
            response.on('data', (chunk) => {
              data += String(chunk);
            });
            response.on('end', () => resolve(data));
          }
        )
        .on('error', reject);
    });

    const release = JSON.parse(json) as GitHubRelease;
    const zipAsset = release.assets.find((asset) => asset.name.toLowerCase().endsWith('.zip'));
    if (!zipAsset) {
      throw new Error('No zip asset found in latest UEVR release');
    }

    return {
      version: release.tag_name,
      downloadUrl: zipAsset.browser_download_url,
      fileName: zipAsset.name
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
  public async resetManagedState(): Promise<{ removedUevr: boolean; removedProfile: boolean; details: string[] }> {
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

    return { removedUevr, removedProfile, details };
  }

  public async getStatus(): Promise<UEVRStatus> {
    await fs.promises.mkdir(this.managedPath, { recursive: true });
    const versionFile = path.join(this.managedPath, 'version.txt');
    const installedVersion = fs.existsSync(versionFile)
      ? (await fs.promises.readFile(versionFile, 'utf8')).trim()
      : undefined;

    const injectorExists = fs.existsSync(path.join(this.managedPath, 'UEVRInjector.exe'));
    const profileDeployed = fs.existsSync(path.join(this.ac7ProfileDir, 'config.txt'));

    return {
      installedVersion,
      managedPath: this.managedPath,
      injectorExists,
      profileDeployed
    };
  }

  public async update(onProgress: (percent: number) => void): Promise<UEVRStatus> {
    await fs.promises.mkdir(this.managedPath, { recursive: true });
    const latest = await this.getLatestRelease();

    const archivePath = path.join(this.managedPath, latest.fileName);
    await downloadFile(latest.downloadUrl, archivePath, onProgress);

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
}
