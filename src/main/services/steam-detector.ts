import fs from 'node:fs';
import path from 'node:path';
import type { SoftwareDetectionResult, StatusItem } from '@shared/types';
import { readRegistryValue } from '../utils/registry';
import { resolveVirtualDesktopStreamerPath } from '../utils/vd-streamer';
import { ERRORS } from './error-catalog';
import { ProcessManager } from './process-manager';

const appManifest = (library: string, appId: string) => path.join(library, 'steamapps', `appmanifest_${appId}.acf`);

export class SteamDetector {
  constructor(private readonly processManager: ProcessManager) {}

  private getSteamPath(): string | null {
    return (
      readRegistryValue('HKCU\\Software\\Valve\\Steam', 'SteamPath')
      ?? readRegistryValue('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath')
      ?? null
    );
  }

  private getSteamLibraries(steamPath: string): string[] {
    const libraries = new Set<string>([steamPath]);
    const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
    if (!fs.existsSync(vdfPath)) return [...libraries];

    const text = fs.readFileSync(vdfPath, 'utf8');
    const matches = text.matchAll(/"path"\s+"([^"]+)"/g);
    for (const match of matches) {
      libraries.add(match[1].replace(/\\\\/g, '\\'));
    }
    return [...libraries];
  }

  private findAppInstall(libraries: string[], appId: string): boolean {
    return libraries.some((lib) => fs.existsSync(appManifest(lib, appId)));
  }

  public detect(manualAc7Path?: string): SoftwareDetectionResult {
    const steamPath = this.getSteamPath();
    const steamInstalled = Boolean(steamPath);
    const steamRunning = this.processManager.isRunning('steam.exe');

    const libraries = steamPath ? this.getSteamLibraries(steamPath) : [];
    const steamVRInstalled = steamPath ? this.findAppInstall(libraries, '250820') : false;

    const ac7FromLibraries = libraries.find((lib) => fs.existsSync(appManifest(lib, '502500')));
    const ac7InstallPath = manualAc7Path || (ac7FromLibraries
      ? path.join(ac7FromLibraries, 'steamapps', 'common', 'ACE COMBAT 7')
      : undefined);
    const ac7Installed = Boolean(ac7InstallPath && fs.existsSync(ac7InstallPath));

    const virtualDesktopInstall = resolveVirtualDesktopStreamerPath();
    const virtualDesktopInstalled = Boolean(virtualDesktopInstall);
    const virtualDesktopRunning = this.processManager.isRunning('VirtualDesktop.Streamer.exe');

    const items: StatusItem[] = [
      {
        id: 'steam',
        label: 'Steam installed',
        status: steamInstalled ? 'ok' : 'error',
        details: steamPath ?? 'Not found',
        actionLabel: steamInstalled ? 'Launch' : 'Install',
        actionUrl: steamInstalled ? 'steam://open/main' : 'https://store.steampowered.com/about/',
        code: steamInstalled ? undefined : ERRORS.STEAM_MISSING.code
      },
      {
        id: 'steam-running',
        label: 'Steam running',
        status: steamRunning ? 'ok' : 'pending',
        actionLabel: 'Launch',
        actionUrl: 'steam://open/main',
        fixAction: steamRunning ? undefined : 'start-steam',
        fixActionLabel: steamRunning ? undefined : 'Start Steam'
      },
      {
        // SteamVR is NOT required for Quest 3 + Virtual Desktop. Listed here as info only.
        id: 'steamvr',
        label: 'SteamVR (not required for Quest 3 + Virtual Desktop)',
        status: steamVRInstalled ? 'ok' : 'unknown',
        details: steamVRInstalled ? 'Installed' : 'Not detected — not needed for this setup',
        actionLabel: 'Info',
        actionUrl: 'https://store.steampowered.com/app/250820/SteamVR/'
      },
      {
        id: 'ac7',
        label: 'Ace Combat 7 installed (AppID 502500)',
        status: ac7Installed ? 'ok' : 'error',
        details: ac7InstallPath ?? 'Not found',
        actionLabel: ac7Installed ? 'Launch' : 'Install',
        actionUrl: ac7Installed ? 'steam://rungameid/502500' : 'steam://install/502500',
        code: ac7Installed ? undefined : ERRORS.AC7_NOT_DETECTED.code,
        fixAction: ac7Installed ? undefined : ERRORS.AC7_NOT_DETECTED.fixAction,
        fixActionLabel: ac7Installed ? undefined : ERRORS.AC7_NOT_DETECTED.fixActionLabel
      },
      {
        // Virtual Desktop Streamer runs on this PC. The Quest 3 headset connects to it.
        id: 'vd',
        label: 'Virtual Desktop Streamer (PC side — Quest 3 connects to this)',
        status: virtualDesktopInstalled && virtualDesktopRunning ? 'ok' : (virtualDesktopInstalled ? 'pending' : 'error'),
        details: virtualDesktopInstalled
          ? (virtualDesktopRunning ? `Running — ${virtualDesktopInstall}` : `Installed at ${virtualDesktopInstall} — not running`)
          : 'Not found — install from https://www.vrdesktop.net/',
        actionLabel: virtualDesktopInstalled ? 'Launch' : 'Install',
        actionUrl: virtualDesktopInstalled && virtualDesktopInstall
          ? `file:///${virtualDesktopInstall.replace(/\\/g, '/').replace(/ /g, '%20')}`
          : 'https://www.vrdesktop.net/',
        code: !virtualDesktopInstalled
          ? ERRORS.VD_NOT_INSTALLED.code
          : (!virtualDesktopRunning ? ERRORS.VD_NOT_RUNNING.code : undefined),
        fixAction: !virtualDesktopInstalled
          ? ERRORS.VD_NOT_INSTALLED.fixAction
          : (!virtualDesktopRunning ? ERRORS.VD_NOT_RUNNING.fixAction : undefined),
        fixActionLabel: !virtualDesktopInstalled
          ? ERRORS.VD_NOT_INSTALLED.fixActionLabel
          : (!virtualDesktopRunning ? ERRORS.VD_NOT_RUNNING.fixActionLabel : undefined)
      }
    ];

    return {
      steamInstalled,
      steamRunning,
      steamVRInstalled,
      ac7Installed,
      ac7InstallPath,
      virtualDesktopInstalled,
      virtualDesktopRunning,
      items
    };
  }
}
