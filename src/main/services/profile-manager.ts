import fs from 'node:fs';
import path from 'node:path';

export class ProfileManager {
  constructor(
    private readonly managedRoot: string,
    private readonly defaultProfilePath: string
  ) {}

  public get profilePath(): string {
    return path.join(this.managedRoot, 'profiles', 'ac7-profile.json');
  }

  public async applyDefaultProfile(): Promise<string> {
    await fs.promises.mkdir(path.dirname(this.profilePath), { recursive: true });
    await fs.promises.copyFile(this.defaultProfilePath, this.profilePath);
    return this.profilePath;
  }

  public async importProfile(inputPath: string): Promise<string> {
    await fs.promises.mkdir(path.dirname(this.profilePath), { recursive: true });
    await fs.promises.copyFile(inputPath, this.profilePath);
    return this.profilePath;
  }

  public async exportProfile(outputPath: string): Promise<string> {
    await fs.promises.copyFile(this.profilePath, outputPath);
    return outputPath;
  }
}
