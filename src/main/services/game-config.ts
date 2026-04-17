import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProfileSettings } from '@shared/types';

const setOrAppend = (text: string, key: string, value: string): string => {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(text)) {
    return text.replace(regex, `${key}=${value}`);
  }
  return `${text.trimEnd()}\n${key}=${value}\n`;
};

export class GameConfigService {
  private get configPath(): string {
    return path.join(os.homedir(), 'AppData', 'Local', 'AC7', 'Saved', 'Config', 'WindowsNoEditor', 'GameUserSettings.ini');
  }

  public async apply(settings: ProfileSettings): Promise<string> {
    await fs.promises.mkdir(path.dirname(this.configPath), { recursive: true });
    let text = fs.existsSync(this.configPath) ? await fs.promises.readFile(this.configPath, 'utf8') : '';

    if (settings.borderlessWindow) {
      text = setOrAppend(text, 'FullscreenMode', '1');
      text = setOrAppend(text, 'LastConfirmedFullscreenMode', '1');
    }
    if (settings.disableMotionBlur) {
      text = setOrAppend(text, 'r.MotionBlurQuality', '0');
    }

    const [width, height] = settings.resolution.split('x');
    if (width && height) {
      text = setOrAppend(text, 'ResolutionSizeX', width.trim());
      text = setOrAppend(text, 'ResolutionSizeY', height.trim());
      text = setOrAppend(text, 'LastUserConfirmedResolutionSizeX', width.trim());
      text = setOrAppend(text, 'LastUserConfirmedResolutionSizeY', height.trim());
    }

    await fs.promises.writeFile(this.configPath, `${text.trimEnd()}\n`, 'utf8');
    return this.configPath;
  }
}
