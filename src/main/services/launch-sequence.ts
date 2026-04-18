import fs from 'node:fs';
import path from 'node:path';
import type { LaunchStepStatus } from '@shared/types';
import { launchElevated } from '../utils/elevate';
import { runInjectorTask, taskExists } from '../utils/scheduled-task';
import { resolveVirtualDesktopStreamerPath } from '../utils/vd-streamer';
import { ERRORS } from './error-catalog';
import { ProcessManager } from './process-manager';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Minimum seconds to wait after the Ace7Game process first appears before attempting
 * UEVR injection. The Unreal Engine needs to fully initialize (render device, UWorld,
 * etc.) before UEVR can safely hook it; injecting too early causes the game to crash
 * or the mod to silently fail. 25s is a conservative default that works across a wide
 * range of hardware.
 */
const UE4_WARMUP_SECONDS_DEFAULT = 25;
/** Bumped warmup used by the "Retry with extra warmup" fix action. */
const UE4_WARMUP_SECONDS_EXTRA = 60;
/**
 * If the game process disappears within this many seconds of successful
 * injection we treat it as an early-crash and surface AC7-003 with a
 * "Retry with extra warmup" button.
 */
const AC7_EARLY_EXIT_WINDOW_SECONDS = 60;

/**
 * Game executable name (with .exe) passed to UEVRInjector via `--attach=`.
 * The frontend matches case-insensitively and strips the extension before
 * polling Process.GetProcessesByName, so this is the canonical form to use.
 */
const AC7_PROCESS_EXE = 'Ace7Game-Win64-Shipping.exe';

/**
 * Attach an error-catalog entry to a thrown error. The rendered UI reads
 * `(err as any).code` / `(err as any).fixAction` to offer a one-click remedy.
 */
const tagError = (err: Error, entry: typeof ERRORS[keyof typeof ERRORS]): Error => {
  Object.assign(err, {
    code: entry.code,
    fixAction: 'fixAction' in entry ? entry.fixAction : undefined,
    fixActionLabel: 'fixActionLabel' in entry ? entry.fixActionLabel : undefined
  });
  return err;
};

export interface LaunchOptions {
  /** Override default UE4 warmup seconds (used by "Retry with extra warmup"). */
  extraWarmup?: boolean;
}

export class LaunchSequence {
  /** Track whether the previous run triggered an early-exit so the UI can offer retry-with-warmup. */
  private lastEarlyExit = false;

  constructor(
    private readonly processManager: ProcessManager,
    private readonly uevrManagedPath: string
  ) {}

  public async run(
    ac7Path: string | undefined,
    onStep: (step: LaunchStepStatus) => void,
    onLog: (line: string) => void,
    options: LaunchOptions = {}
  ): Promise<void> {
    const warmupSeconds = options.extraWarmup ? UE4_WARMUP_SECONDS_EXTRA : UE4_WARMUP_SECONDS_DEFAULT;
    // Step 1 – Virtual Desktop Streamer (PC side)
    onStep({ id: 'vd', label: 'Virtual Desktop Streamer (PC)', status: 'pending' });
    if (!this.processManager.isRunning('VirtualDesktop.Streamer.exe')) {
      const vdPath = resolveVirtualDesktopStreamerPath();
      if (vdPath) {
        this.processManager.launch('virtual-desktop', `"${vdPath}"`, [], onLog);
        await sleep(2000);
      } else {
        throw tagError(
          new Error(
            'Virtual Desktop Streamer is not installed (or was not found in the registry or standard install locations). '
            + 'Install it from https://www.vrdesktop.net/ and sign in before continuing.'
          ),
          ERRORS.VD_NOT_INSTALLED
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
      throw tagError(
        new Error('Ace Combat 7 process was not detected in time (90s). Make sure the game starts successfully.'),
        ERRORS.AC7_NOT_STARTED
      );
    }
    onStep({ id: 'ac7', label: 'Launch Ace Combat 7', status: 'ok', message: `PID ${pid}` });

    // Step 3 – Wait for the Unreal Engine to finish warming up before injecting.
    // Injecting too early causes AC7 to crash. We stream a countdown to the UI so
    // the user sees that the launcher is still working.
    for (let remaining = warmupSeconds; remaining > 0; remaining -= 1) {
      onStep({
        id: 'warmup',
        label: 'Wait for game to finish loading',
        status: 'pending',
        message: `Injecting UEVR in ${remaining}s — do not close the game window`
      });
      await sleep(1000);
      // Bail out early if the game crashed / was closed during warmup.
      if (!this.processManager.findPid('Ace7Game-Win64-Shipping.exe')) {
        throw tagError(
          new Error('Ace Combat 7 exited before UEVR could be injected.'),
          ERRORS.AC7_EARLY_EXIT
        );
      }
    }
    onStep({ id: 'warmup', label: 'Wait for game to finish loading', status: 'ok' });

    // Step 4 – Inject UEVR. UEVRInjector.exe is a GUI tool that needs admin
    // rights (SeDebugPrivilege) to inject into the running game, AND we want
    // to skip the manual "select process + click Inject" click.
    //
    // Two automations are layered here:
    //  1. We always pass `--attach=Ace7Game-Win64-Shipping.exe` so the
    //     injector waits for the running game and auto-injects with no GUI
    //     interaction (verified in praydog/uevr-frontend MainWindow.xaml.cs).
    //  2. We prefer triggering a pre-installed Windows Scheduled Task
    //     (registered during Install & Configure with `RunLevel=Highest`)
    //     so launching it does NOT trigger a UAC prompt. If the task isn't
    //     present (fresh install / older user) we fall back to launchElevated
    //     which preserves the original behavior (one UAC prompt per launch).
    onStep({ id: 'inject', label: 'Inject UEVR mod', status: 'pending' });
    const injectorPath = path.join(this.uevrManagedPath, 'UEVRInjector.exe');
    if (!fs.existsSync(injectorPath)) {
      throw tagError(
        new Error(`UEVR injector not found at ${injectorPath} — run Install & Configure first.`),
        ERRORS.UEVR_MISSING
      );
    }
    const attachArgs = [`--attach=${AC7_PROCESS_EXE}`];
    let usedScheduledTask = false;
    try {
      if (taskExists()) {
        await runInjectorTask();
        usedScheduledTask = true;
        onLog(`[uevr-injector] launched via scheduled task (no UAC) with --attach=${AC7_PROCESS_EXE}`);
      } else {
        await launchElevated(injectorPath, attachArgs, this.uevrManagedPath);
        onLog(`[uevr-injector] launched elevated: ${injectorPath} ${attachArgs.join(' ')}`);
      }
    } catch (err) {
      throw tagError(
        new Error(
          `Could not launch the UEVR injector with admin rights: ${(err as Error).message}. `
          + 'Injection requires Administrator privileges. Please accept the UAC prompt next time.'
        ),
        ERRORS.UEVR_ELEVATION_REFUSED
      );
    }
    onStep({
      id: 'inject',
      label: 'Inject UEVR mod',
      status: 'ok',
      message: usedScheduledTask
        ? 'UEVR Injector launched silently and is auto-injecting Ace7Game-Win64-Shipping.exe.'
        : 'UEVR Injector launched elevated and is auto-injecting Ace7Game-Win64-Shipping.exe. '
          + 'Tip: re-run Install & Configure to register the one-click VR injector task and '
          + 'skip the UAC prompt on future launches.'
    });

    // Post-inject crash detector. If AC7 exits inside the early-exit window we
    // flip the `inject` step to an error with AC7-003 + "Retry with extra warmup".
    // We don't await the full window here — the user is already supposed to
    // don the headset — but we do kick off a detached watcher that updates
    // the UI if the game disappears quickly.
    this.lastEarlyExit = false;
    void this.watchForEarlyExit(onStep, onLog, pid);

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

  public get lastAttemptTriggeredEarlyExit(): boolean {
    return this.lastEarlyExit;
  }

  /**
   * Poll for AC7 exit within the early-exit window. Flips the `inject` step
   * to an error with AC7-003 so the UI can offer "Retry with extra warmup".
   */
  private async watchForEarlyExit(
    onStep: (step: LaunchStepStatus) => void,
    onLog: (line: string) => void,
    pid: number
  ): Promise<void> {
    for (let elapsed = 0; elapsed < AC7_EARLY_EXIT_WINDOW_SECONDS; elapsed += 2) {
      await sleep(2000);
      if (!this.processManager.findPid('Ace7Game-Win64-Shipping.exe')) {
        this.lastEarlyExit = true;
        onLog(`[watchdog] Ace7Game (PID ${pid}) exited within ${elapsed}s of inject`);
        onStep({
          id: 'inject',
          label: 'Inject UEVR mod',
          status: 'error',
          code: ERRORS.AC7_EARLY_EXIT.code,
          message: ERRORS.AC7_EARLY_EXIT.message,
          fixAction: ERRORS.AC7_EARLY_EXIT.fixAction,
          fixActionLabel: ERRORS.AC7_EARLY_EXIT.fixActionLabel
        });
        return;
      }
    }
  }
}
