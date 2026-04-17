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
    onStep({ id: 'steamvr', label: 'Start SteamVR', status: 'pending' });
    if (!this.processManager.isRunning('vrserver.exe')) {
      this.processManager.launch('steamvr', 'cmd', ['/c', 'start', 'steam://run/250820'], onLog);
      await sleep(3000);
    }
    onStep({ id: 'steamvr', label: 'Start SteamVR', status: 'ok' });

    onStep({ id: 'vd', label: 'Start Virtual Desktop Streamer', status: 'pending' });
    if (!this.processManager.isRunning('VirtualDesktop.Streamer.exe')) {
      const vdPath = 'C:\\Program Files\\Virtual Desktop Streamer\\VirtualDesktop.Streamer.exe';
      if (fs.existsSync(vdPath)) {
        this.processManager.launch('virtual-desktop', `"${vdPath}"`, [], onLog);
        await sleep(2000);
      } else {
        throw new Error('Virtual Desktop Streamer is not installed');
      }
    }
    onStep({ id: 'vd', label: 'Start Virtual Desktop Streamer', status: 'ok' });

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

    onStep({ id: 'inject', label: 'Inject UEVR', status: 'pending' });
    const injectorPath = path.join(this.uevrManagedPath, 'UEVRInjector.exe');
    if (!fs.existsSync(injectorPath)) {
      throw new Error(`Missing injector at ${injectorPath}`);
    }
    this.processManager.launch('uevr-injector', `"${injectorPath}"`, [String(pid)], onLog);
    onStep({ id: 'inject', label: 'Inject UEVR', status: 'ok' });
  }

  public abort(): void {
    this.processManager.killAll();
  }
}
