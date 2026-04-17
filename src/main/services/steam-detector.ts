import fs from 'node:fs';
import path from 'node:path';
import type { SoftwareDetectionResult, StatusItem } from '@shared/types';
import { readRegistryValue } from '../utils/registry';
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

    const virtualDesktopInstall =
      'C:\\Program Files\\Virtual Desktop Streamer\\VirtualDesktop.Streamer.exe';
    const virtualDesktopInstalled = fs.existsSync(virtualDesktopInstall);
    const virtualDesktopRunning = this.processManager.isRunning('VirtualDesktop.Streamer.exe');

    const items: StatusItem[] = [
      {
        id: 'steam',
        label: 'Steam installed',
        status: steamInstalled ? 'ok' : 'error',
        details: steamPath ?? 'Not found',
        actionLabel: steamInstalled ? 'Launch' : 'Install',
        actionUrl: steamInstalled ? 'steam://open/main' : 'https://store.steampowered.com/about/'
      },
      {
        id: 'steam-running',
        label: 'Steam running',
        status: steamRunning ? 'ok' : 'pending',
        actionLabel: 'Launch',
        actionUrl: 'steam://open/main'
      },
      {
        id: 'steamvr',
        label: 'SteamVR installed (AppID 250820)',
        status: steamVRInstalled ? 'ok' : 'error',
        actionLabel: steamVRInstalled ? 'Launch' : 'Install',
        actionUrl: steamVRInstalled ? undefined : 'steam://install/250820'
      },
      {
        id: 'ac7',
        label: 'Ace Combat 7 installed (AppID 502500)',
        status: ac7Installed ? 'ok' : 'error',
        details: ac7InstallPath ?? 'Not found',
        actionLabel: ac7Installed ? 'Launch' : 'Install',
        actionUrl: ac7Installed ? 'steam://rungameid/502500' : 'steam://install/502500'
      },
      {
        id: 'vd',
        label: 'Virtual Desktop Streamer installed/running',
        status: virtualDesktopInstalled && virtualDesktopRunning ? 'ok' : (virtualDesktopInstalled ? 'pending' : 'error'),
        details: virtualDesktopInstall,
        actionLabel: virtualDesktopInstalled ? 'Launch' : 'Install',
        actionUrl: virtualDesktopInstalled ? 'file:///C:/Program%20Files/Virtual%20Desktop%20Streamer/VirtualDesktop.Streamer.exe' : 'https://www.vrdesktop.net/'
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
