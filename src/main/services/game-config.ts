import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProfileSettings } from '@shared/types';
import { BackupManager } from './backup-manager';

const GAME_USER_SETTINGS_SECTION = '/Script/Engine.GameUserSettings';

/**
 * Quick heuristic check for a GameUserSettings.ini that UE4 cannot parse.
 * UE4's strict parser silently ignores any line outside a recognised section
 * header, so a file that is missing the header (or contains unterminated
 * headers / binary garbage) is effectively broken from the game's POV.
 *
 * Returns the reason (INI error code) if the content is malformed, or null
 * if it looks usable.
 */
export const diagnoseIni = (text: string): 'INI_SECTION_MISSING' | 'INI_MALFORMED' | null => {
  if (!text) return null; // empty is fine — we'll append a fresh section
  // Reject binary / null-byte contamination up front.
  if (text.includes('\u0000')) return 'INI_MALFORMED';

  const lines = text.split(/\r?\n/);
  let inSection = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    // Unterminated / malformed header is a hard fail.
    if (line.startsWith('[')) {
      if (!line.endsWith(']')) return 'INI_MALFORMED';
      inSection = true;
      continue;
    }
    // A key=value line appearing before any [Section] header is UE4's
    // silent-drop footgun.
    if (!inSection && /=/.test(line)) return 'INI_SECTION_MISSING';
  }
  return null;
};

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
  constructor(private readonly backupManager?: BackupManager) {}

  public get configPath(): string {
    return path.join(os.homedir(), 'AppData', 'Local', 'AC7', 'Saved', 'Config', 'WindowsNoEditor', 'GameUserSettings.ini');
  }

  /**
   * Read the current INI, auto-repairing and backing up if it's malformed.
   * Returns both the (possibly rewritten) content and any repair note the UI
   * can surface ("Restored recommended settings").
   */
  public async readAndRepair(): Promise<{ text: string; repaired: 'INI_SECTION_MISSING' | 'INI_MALFORMED' | null }> {
    if (!fs.existsSync(this.configPath)) return { text: '', repaired: null };

    const current = await fs.promises.readFile(this.configPath, 'utf8');
    const problem = diagnoseIni(current);
    if (!problem) return { text: current, repaired: null };

    // Snapshot before we rewrite anything.
    if (this.backupManager) {
      try {
        await this.backupManager.snapshotFile(this.configPath);
      } catch {
        // Fall through — we'll still write a `.bak` sibling below.
      }
    }
    // Defensive: always leave a .bak next to the original so users can recover
    // the file manually even if the managed backups folder is wiped.
    try {
      await fs.promises.copyFile(this.configPath, `${this.configPath}.bak`);
    } catch {
      // Non-fatal.
    }

    // Start from a minimal known-good skeleton; the apply() pass below will
    // fill in the keys the launcher actually cares about.
    return { text: `[${GAME_USER_SETTINGS_SECTION}]\n`, repaired: problem };
  }

  public async apply(settings: ProfileSettings): Promise<string> {
    await fs.promises.mkdir(path.dirname(this.configPath), { recursive: true });
    const { text: initialText } = await this.readAndRepair();
    let text = initialText;

    // Snapshot the (healthy) original before mutating it, so "Reset
    // everything" can roll back to the user's pre-launcher state.
    if (this.backupManager && initialText && fs.existsSync(this.configPath)) {
      try {
        await this.backupManager.snapshotFile(this.configPath);
      } catch {
        // Non-fatal.
      }
    }

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
