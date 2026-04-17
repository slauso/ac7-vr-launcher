import fs from 'node:fs';
import path from 'node:path';
import type { LaunchStepStatus } from '@shared/types';
import { launchElevated } from '../utils/elevate';
import { resolveVirtualDesktopStreamerPath } from '../utils/vd-streamer';
import { ProcessManager } from './process-manager';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Minimum seconds to wait after the Ace7Game process first appears before attempting
 * UEVR injection. The Unreal Engine needs to fully initialize (render device, UWorld,
 * etc.) before UEVR can safely hook it; injecting too early causes the game to crash
 * or the mod to silently fail. 25s is a conservative default that works across a wide
 * range of hardware.
 */
const UE4_WARMUP_SECONDS = 25;

export class LaunchSequence {
  constructor(
    private readonly processManager: ProcessManager,
    private readonly uevrManagedPath: string
  ) {}

  public async run(
    ac7Path: string | undefined,
    onStep: (step: LaunchStepStatus) => void,
    onLog: (line: string) => void
  ): Promise<void> {
    // Step 1 – Virtual Desktop Streamer (PC side)
    onStep({ id: 'vd', label: 'Virtual Desktop Streamer (PC)', status: 'pending' });
    if (!this.processManager.isRunning('VirtualDesktop.Streamer.exe')) {
      const vdPath = resolveVirtualDesktopStreamerPath();
      if (vdPath) {
        this.processManager.launch('virtual-desktop', `"${vdPath}"`, [], onLog);
        await sleep(2000);
      } else {
        throw new Error(
          'Virtual Desktop Streamer is not installed (or was not found in the registry or standard install locations). '
          + 'Install it from https://www.vrdesktop.net/ and sign in before continuing.'
        );
      }
    }
    onStep({ id: 'vd', label: 'Virtual Desktop Streamer (PC)', status: 'ok' });

    // Step 2 – Launch Ace Combat 7
    onStep({ id: 'ac7', label: 'Launch Ace Combat 7', status: 'pending' });
    if (ac7Path && fs.existsSync(ac7Path)) {
      const binary = path.join(ac7Path, 'Game', 'Binaries', 'Win64', 'Ace7Game-Win64-Shipping.exe');
      if (fs.existsSync(binary)) {
        this.processManager.launch('ac7', `"${binary}"`, [], onLog);
      } else {
        this.processManager.launch('ac7', 'cmd', ['/c', 'start', 'steam://rungameid/502500'], onLog);
      }
    } else {
      this.processManager.launch('ac7', 'cmd', ['/c', 'start', 'steam://rungameid/502500'], onLog);
    }

    // Wait for the game process to appear
    let pid: number | null = null;
    for (let i = 0; i < 45; i += 1) {
      pid = this.processManager.findPid('Ace7Game-Win64-Shipping.exe');
      if (pid) break;
      await sleep(2000);
    }
    if (!pid) {
      throw new Error('Ace Combat 7 process was not detected in time (90s). Make sure the game starts successfully.');
    }
    onStep({ id: 'ac7', label: 'Launch Ace Combat 7', status: 'ok', message: `PID ${pid}` });

    // Step 3 – Wait for the Unreal Engine to finish warming up before injecting.
    // Injecting too early causes AC7 to crash. We stream a countdown to the UI so
    // the user sees that the launcher is still working.
    for (let remaining = UE4_WARMUP_SECONDS; remaining > 0; remaining -= 1) {
      onStep({
        id: 'warmup',
        label: 'Wait for game to finish loading',
        status: 'pending',
        message: `Injecting UEVR in ${remaining}s — do not close the game window`
      });
      await sleep(1000);
      // Bail out early if the game crashed / was closed during warmup.
      if (!this.processManager.findPid('Ace7Game-Win64-Shipping.exe')) {
        throw new Error('Ace Combat 7 exited before UEVR could be injected.');
      }
    }
    onStep({ id: 'warmup', label: 'Wait for game to finish loading', status: 'ok' });

    // Step 4 – Inject UEVR. UEVRInjector.exe is a GUI tool that needs admin rights
    // (SeDebugPrivilege) to inject into the running game. We launch it elevated via
    // a single UAC prompt. The injector remembers the last-used process, so after
    // the first successful run the user does not need to click anything.
    onStep({ id: 'inject', label: 'Inject UEVR mod', status: 'pending' });
    const injectorPath = path.join(this.uevrManagedPath, 'UEVRInjector.exe');
    if (!fs.existsSync(injectorPath)) {
      throw new Error(`UEVR injector not found at ${injectorPath} — run Install & Configure first.`);
    }
    try {
      await launchElevated(injectorPath, [], this.uevrManagedPath);
      onLog(`[uevr-injector] launched elevated: ${injectorPath}`);
    } catch (err) {
      throw new Error(
        `Could not launch the UEVR injector with admin rights: ${(err as Error).message}. `
        + 'Injection requires Administrator privileges. Please accept the UAC prompt next time.'
      );
    }
    onStep({
      id: 'inject',
      label: 'Inject UEVR mod',
      status: 'ok',
      message:
        'UEVR Injector window opened. First-time setup: select "Ace7Game-Win64-Shipping.exe" and click "Inject". '
        + 'On later launches it auto-injects — no clicks needed.'
    });

    // Step 5 – Prompt the user to connect from their headset
    onStep({
      id: 'quest',
      label: '🥽 Put on your Quest 3',
      status: 'ok',
      message: 'Open the Virtual Desktop app on your headset and connect to this PC.'
    });
  }

  public abort(): void {
    this.processManager.killAll();
  }
}
