import fs from 'node:fs';
import path from 'node:path';

/**
 * Creates and restores timestamped snapshots of files the launcher mutates
 * (AC7 INI, deployed UEVR profile, etc.). Every backup is copied into
 * `<managedRoot>/backups/<timestamp>/` so a user can roll back to a known-
 * good state without the launcher ever losing the original file.
 *
 * A small `latest.json` manifest is kept at `<managedRoot>/backups/latest.json`
 * pointing at the most recent snapshot of each source path. That is what
 * "Undo last setup" / "Reset everything" uses to restore atomically.
 */
export interface BackupManifest {
  [sourcePath: string]: {
    /** Absolute path to the saved copy inside the backups directory. */
    backupPath: string;
    /** ISO timestamp the snapshot was taken. */
    savedAt: string;
  };
}

export class BackupManager {
  constructor(private readonly managedRoot: string) {}

  public get backupsDir(): string {
    return path.join(this.managedRoot, 'backups');
  }

  private get manifestPath(): string {
    return path.join(this.backupsDir, 'latest.json');
  }

  private async readManifest(): Promise<BackupManifest> {
    try {
      const text = await fs.promises.readFile(this.manifestPath, 'utf8');
      return JSON.parse(text) as BackupManifest;
    } catch {
      return {};
    }
  }

  private async writeManifest(manifest: BackupManifest): Promise<void> {
    await fs.promises.mkdir(this.backupsDir, { recursive: true });
    await fs.promises.writeFile(this.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  /**
   * Snapshot the given file. No-op if the source doesn't exist. Safe to call
   * before every write — repeated snapshots are cheap and the manifest only
   * tracks the latest one per source.
   */
  public async snapshotFile(sourcePath: string): Promise<string | null> {
    if (!fs.existsSync(sourcePath)) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bucket = path.join(this.backupsDir, timestamp);
    await fs.promises.mkdir(bucket, { recursive: true });

    const backupPath = path.join(bucket, path.basename(sourcePath));
    await fs.promises.copyFile(sourcePath, backupPath);

    // Also drop a sibling `.bak` next to the original so users can recover
    // the file manually with a file manager if the launcher is uninstalled.
    try {
      await fs.promises.copyFile(sourcePath, `${sourcePath}.bak`);
    } catch {
      // Non-fatal — the primary backup in backupsDir is what we rely on.
    }

    const manifest = await this.readManifest();
    manifest[sourcePath] = { backupPath, savedAt: new Date().toISOString() };
    await this.writeManifest(manifest);

    return backupPath;
  }

  /** Restore every source path in the manifest. Missing backups are skipped. */
  public async restoreAll(): Promise<string[]> {
    const manifest = await this.readManifest();
    const restored: string[] = [];
    for (const [source, entry] of Object.entries(manifest)) {
      if (!fs.existsSync(entry.backupPath)) continue;
      await fs.promises.mkdir(path.dirname(source), { recursive: true });
      await fs.promises.copyFile(entry.backupPath, source);
      restored.push(source);
    }
    return restored;
  }

  public async hasBackups(): Promise<boolean> {
    const manifest = await this.readManifest();
    return Object.keys(manifest).length > 0;
  }
}
