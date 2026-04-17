import fs from 'node:fs';
import path from 'node:path';
import { shell } from 'electron';
import type { FixActionId, FixActionResult } from '@shared/types';
import { registerInjectorTask } from '../utils/scheduled-task';
import { resolveVirtualDesktopStreamerPath } from '../utils/vd-streamer';
import { GameConfigService } from './game-config';
import { ProcessManager } from './process-manager';
import { SteamDetector } from './steam-detector';
import { UEVRManager } from './uevr-manager';

const AC7_PROCESS_EXE = 'Ace7Game-Win64-Shipping.exe';

/**
 * Shared AC7 UEVR config asset path. Passed in by the IPC layer so we don't
 * duplicate the `../assets/…` resolution here.
 */
export interface FixActionDeps {
  processManager: ProcessManager;
  steamDetector: SteamDetector;
  uevrManager: UEVRManager;
  gameConfig: GameConfigService;
  /** Absolute path to the bundled ac7-uevr.cfg asset. */
  uevrCfgAsset: string;
  /** Invoked by `reinstall-uevr` to stream progress to the renderer. */
  onUevrProgress?: (percent: number) => void;
}

/**
 * Execute the one-click remedy identified by `action`. These are deliberately
 * idempotent so a user can mash "Fix it for me" with no side-effects if the
 * underlying problem is already resolved.
 */
export const runFixAction = async (
  action: FixActionId,
  deps: FixActionDeps,
  ac7Path?: string
): Promise<FixActionResult> => {
  switch (action) {
    case 'install-vcpp':
      await shell.openExternal('https://aka.ms/vs/17/release/vc_redist.x64.exe');
      return { ok: true, message: 'Opened Microsoft VC++ download in your browser.' };

    case 'install-directx':
      await shell.openExternal('https://www.microsoft.com/en-us/download/details.aspx?id=35');
      return { ok: true, message: 'Opened DirectX download in your browser.' };

    case 'install-virtual-desktop':
      await shell.openExternal('https://www.vrdesktop.net/');
      return { ok: true, message: 'Opened Virtual Desktop site — purchase, install, then sign in.' };

    case 'install-ac7':
      await shell.openExternal('steam://install/502500');
      return { ok: true, message: 'Asked Steam to install Ace Combat 7.' };

    case 'start-virtual-desktop': {
      if (deps.processManager.isRunning('VirtualDesktop.Streamer.exe')) {
        return { ok: true, message: 'Virtual Desktop Streamer is already running.' };
      }
      const vdPath = resolveVirtualDesktopStreamerPath();
      if (!vdPath) {
        return {
          ok: false,
          message: 'Virtual Desktop Streamer is not installed. Install it from vrdesktop.net first.'
        };
      }
      deps.processManager.launch('virtual-desktop', `"${vdPath}"`, [], () => undefined);
      return { ok: true, message: 'Starting Virtual Desktop Streamer…' };
    }

    case 'start-steam': {
      await shell.openExternal('steam://open/main');
      return { ok: true, message: 'Asked Windows to open Steam.' };
    }

    case 'rescan-ac7-path': {
      const detection = deps.steamDetector.detect();
      if (detection.ac7InstallPath && fs.existsSync(detection.ac7InstallPath)) {
        return { ok: true, message: `Found Ace Combat 7 at ${detection.ac7InstallPath}` };
      }
      return {
        ok: false,
        message: 'Could not find Ace Combat 7 in any Steam library. Use the path picker to browse to it.'
      };
    }

    case 'reinstall-uevr': {
      await deps.uevrManager.update((percent) => deps.onUevrProgress?.(percent));
      // Redeploy the profile right after — a stale profile is a common silent
      // failure that reinstalling UEVR alone wouldn't fix.
      if (fs.existsSync(deps.uevrCfgAsset)) {
        await deps.uevrManager.deployAC7Profile(deps.uevrCfgAsset);
      }
      return { ok: true, message: 'UEVR re-downloaded and AC7 profile re-deployed.' };
    }

    case 'redeploy-profile': {
      if (!fs.existsSync(deps.uevrCfgAsset)) {
        return { ok: false, message: `AC7 UEVR config asset missing at ${deps.uevrCfgAsset}` };
      }
      await deps.uevrManager.deployAC7Profile(deps.uevrCfgAsset);
      return { ok: true, message: 'AC7 UEVR profile re-deployed.' };
    }

    case 'reset-game-ini': {
      // Writing a minimal known-good INI gets the user unstuck when the file
      // is corrupt. apply() handles backup + repair internally.
      await deps.gameConfig.apply({
        borderlessWindow: true,
        disableMotionBlur: true,
        resolution: '1920x1080',
        headTracking: true,
        useOpenXR: true,
        sequentialRendering: true
      });
      return { ok: true, message: `Restored recommended AC7 settings at ${deps.gameConfig.configPath}.` };
    }

    case 'retry-with-extra-warmup':
      // The renderer is responsible for re-invoking launchVR with the extra
      // warmup flag; this case exists so the FixAction id validates here.
      return {
        ok: true,
        message: 'Click Launch VR again — the launcher will wait an extra 35 seconds before injecting.'
      };

    case 'register-inject-task': {
      const injectorPath = path.join(deps.uevrManager.managedPath, 'UEVRInjector.exe');
      if (!fs.existsSync(injectorPath)) {
        return {
          ok: false,
          message: `UEVRInjector.exe missing at ${injectorPath}. Re-install UEVR first.`
        };
      }
      try {
        await registerInjectorTask(injectorPath, AC7_PROCESS_EXE);
        return {
          ok: true,
          message: 'One-click VR injector installed. Future Launch VR clicks will skip the UAC prompt.'
        };
      } catch (err) {
        return {
          ok: false,
          message:
            `Could not register the injector scheduled task: ${(err as Error).message}. `
            + 'You can keep using Launch VR; you will see a UAC prompt each time.'
        };
      }
    }

    default: {
      const exhaustive: never = action;
      return { ok: false, message: `Unknown fix action: ${exhaustive as string}` };
    }
  }
};
