import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProfileSettings } from '@shared/types';

const GAME_USER_SETTINGS_SECTION = '/Script/Engine.GameUserSettings';

/**
 * Insert or update `key=value` inside the given INI section. If the section
 * does not exist in the file, it is appended. This matches UE4's strict INI
 * parser which only reads keys that live under the correct `[Section]` header.
 */
const setOrAppendInSection = (
  text: string,
  section: string,
  key: string,
  value: string
): string => {
  // Split the file into its sections. Anything before the first header is
  // treated as a preamble and preserved verbatim.
  const headerRegex = /^\[([^\]\r\n]+)\]\s*$/gm;
  const headers: Array<{ name: string; start: number; bodyStart: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(text)) !== null) {
    headers.push({ name: match[1], start: match.index, bodyStart: match.index + match[0].length });
  }

  const target = headers.find((h) => h.name === section);
  if (!target) {
    // Append a fresh section with the key.
    const separator = text.length === 0 || text.endsWith('\n') ? '' : '\n';
    return `${text}${separator}\n[${section}]\n${key}=${value}\n`;
  }

  const targetIndex = headers.indexOf(target);
  const bodyEnd = targetIndex + 1 < headers.length ? headers[targetIndex + 1].start : text.length;
  const before = text.slice(0, target.bodyStart);
  const body = text.slice(target.bodyStart, bodyEnd);
  const after = text.slice(bodyEnd);

  const keyRegex = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=.*$`, 'm');
  const updatedBody = keyRegex.test(body)
    ? body.replace(keyRegex, `${key}=${value}`)
    : `${body.replace(/\s*$/, '')}\n${key}=${value}\n`;

  return `${before}${updatedBody}${after}`;
};

export class GameConfigService {
  private get configPath(): string {
    return path.join(os.homedir(), 'AppData', 'Local', 'AC7', 'Saved', 'Config', 'WindowsNoEditor', 'GameUserSettings.ini');
  }

  public async apply(settings: ProfileSettings): Promise<string> {
    await fs.promises.mkdir(path.dirname(this.configPath), { recursive: true });
    let text = fs.existsSync(this.configPath) ? await fs.promises.readFile(this.configPath, 'utf8') : '';

    if (settings.borderlessWindow) {
      text = setOrAppendInSection(text, GAME_USER_SETTINGS_SECTION, 'FullscreenMode', '1');
      text = setOrAppendInSection(text, GAME_USER_SETTINGS_SECTION, 'LastConfirmedFullscreenMode', '1');
    }
    if (settings.disableMotionBlur) {
      text = setOrAppendInSection(text, GAME_USER_SETTINGS_SECTION, 'r.MotionBlurQuality', '0');
    }

    const [width, height] = settings.resolution.split('x');
    if (width && height) {
      text = setOrAppendInSection(text, GAME_USER_SETTINGS_SECTION, 'ResolutionSizeX', width.trim());
      text = setOrAppendInSection(text, GAME_USER_SETTINGS_SECTION, 'ResolutionSizeY', height.trim());
      text = setOrAppendInSection(text, GAME_USER_SETTINGS_SECTION, 'LastUserConfirmedResolutionSizeX', width.trim());
      text = setOrAppendInSection(text, GAME_USER_SETTINGS_SECTION, 'LastUserConfirmedResolutionSizeY', height.trim());
    }

    await fs.promises.writeFile(this.configPath, `${text.trimEnd()}\n`, 'utf8');
    return this.configPath;
  }
}
