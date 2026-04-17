import fs from 'node:fs';
import path from 'node:path';
import { readRegistryValue } from './registry';

const EXE_NAME = 'VirtualDesktop.Streamer.exe';

/**
 * Candidate install locations to probe when registry lookup fails. Order matters —
 * registry-derived path is always tried first.
 */
const FALLBACK_INSTALL_DIRS = [
  'C:\\Program Files\\Virtual Desktop Streamer',
  'C:\\Program Files (x86)\\Virtual Desktop Streamer',
  path.join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Virtual Desktop Streamer'),
  path.join(process.env['LOCALAPPDATA'] ?? '', 'Virtual Desktop Streamer')
];

/** Windows Uninstall keys that may contain Virtual Desktop Streamer's InstallLocation. */
const UNINSTALL_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Virtual Desktop Streamer_is1',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Virtual Desktop Streamer_is1',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Virtual Desktop Streamer_is1'
];

/**
 * Resolve the Virtual Desktop Streamer executable path by consulting the Windows
 * registry first, then well-known install locations. Returns null if not found.
 */
export const resolveVirtualDesktopStreamerPath = (): string | null => {
  for (const key of UNINSTALL_KEYS) {
    const installLocation = readRegistryValue(key, 'InstallLocation');
    if (installLocation) {
      const exe = path.join(installLocation.replace(/[\\/]$/, ''), EXE_NAME);
      if (fs.existsSync(exe)) return exe;
    }
    const displayIcon = readRegistryValue(key, 'DisplayIcon');
    if (displayIcon) {
      const candidate = displayIcon.replace(/^"|"$/g, '').split(',')[0];
      if (candidate && fs.existsSync(candidate) && candidate.toLowerCase().endsWith(EXE_NAME.toLowerCase())) {
        return candidate;
      }
    }
  }

  for (const dir of FALLBACK_INSTALL_DIRS) {
    if (!dir) continue;
    const exe = path.join(dir, EXE_NAME);
    if (fs.existsSync(exe)) return exe;
  }

  return null;
};

export const VIRTUAL_DESKTOP_STREAMER_EXE_NAME = EXE_NAME;
