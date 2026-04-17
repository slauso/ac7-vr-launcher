import fs from 'node:fs';
import path from 'node:path';
import type { LaunchStepStatus } from '@shared/types';
import { ProcessManager } from './process-manager';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
      const vdPath = 'C:\\Program Files\\Virtual Desktop Streamer\\VirtualDesktop.Streamer.exe';
      if (fs.existsSync(vdPath)) {
        this.processManager.launch('virtual-desktop', `"${vdPath}"`, [], onLog);
        await sleep(2000);
      } else {
        throw new Error(
          'Virtual Desktop Streamer is not installed. Install it from https://www.vrdesktop.net/ and sign in before continuing.'
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
    for (let i = 0; i < 30; i += 1) {
      pid = this.processManager.findPid('Ace7Game-Win64-Shipping.exe');
      if (pid) break;
      await sleep(2000);
    }
    if (!pid) {
      throw new Error('Ace Combat 7 process was not detected in time');
    }
    onStep({ id: 'ac7', label: 'Launch Ace Combat 7', status: 'ok', message: `PID ${pid}` });

    // Step 3 – Inject UEVR
    onStep({ id: 'inject', label: 'Inject UEVR mod', status: 'pending' });
    const injectorPath = path.join(this.uevrManagedPath, 'UEVRInjector.exe');
    if (!fs.existsSync(injectorPath)) {
      throw new Error(`UEVR injector not found at ${injectorPath} — run Install & Configure first.`);
    }
    this.processManager.launch('uevr-injector', `"${injectorPath}"`, [String(pid)], onLog);
    // Give the injector a moment to attach
    await sleep(3000);
    onStep({ id: 'inject', label: 'Inject UEVR mod', status: 'ok' });

    // Step 4 – Prompt the user to connect from their headset
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
