import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { DependencyChecker } from './dependency-checker';
import { SteamDetector } from './steam-detector';
import { UEVRManager } from './uevr-manager';

/**
 * Produce a sanitized, plain-text diagnostic report the user can paste into
 * a support channel. Deliberately excludes:
 *   - Full home path (collapsed to `~`)
 *   - Machine name / username
 *   - GitHub access tokens / environment variables
 *
 * Includes just enough to reproduce / debug: OS build, launcher version,
 * UEVR version + DLL hashes, detection summary and the last N log lines.
 */
export interface DiagnosticsDeps {
  dependencyChecker: DependencyChecker;
  steamDetector: SteamDetector;
  uevrManager: UEVRManager;
  /** Ring buffer of recent log lines maintained by the IPC layer. */
  getRecentLogs: () => string[];
}

const MAX_LOG_LINES = 200;

const redactHome = (input: string | undefined): string => {
  if (!input) return '';
  const home = os.homedir();
  return input.split(home).join('~');
};

const sha256Short = async (filePath: string): Promise<string | null> => {
  try {
    const hash = crypto.createHash('sha256');
    hash.update(await fs.promises.readFile(filePath));
    return hash.digest('hex').slice(0, 16);
  } catch {
    return null;
  }
};

export const buildDiagnosticsReport = async (deps: DiagnosticsDeps): Promise<string> => {
  const lines: string[] = [];
  const push = (label: string, value: string | number | boolean | undefined) =>
    lines.push(`${label}: ${value ?? '(unknown)'}`);

  lines.push('=== AC7 VR Launcher — Diagnostic Report ===');
  push('Generated', new Date().toISOString());
  push('Launcher version', app.getVersion());
  push('Electron', process.versions.electron ?? 'unknown');
  push('Node', process.versions.node);
  push('Platform', `${process.platform} ${os.release()} (${os.arch()})`);
  push('CPU', os.cpus()[0]?.model ?? 'unknown');
  push('Total RAM (GB)', Math.round(os.totalmem() / 1e9));

  lines.push('');
  lines.push('--- Dependencies ---');
  const deps$ = deps.dependencyChecker.check();
  push('Windows supported', deps$.windowsSupported);
  push('VC++ x64', deps$.vcppInstalled);
  push('DirectX', deps$.directxInstalled);

  lines.push('');
  lines.push('--- Software detection ---');
  const soft = deps.steamDetector.detect();
  push('Steam installed', soft.steamInstalled);
  push('Steam running', soft.steamRunning);
  push('AC7 installed', soft.ac7Installed);
  push('AC7 path', redactHome(soft.ac7InstallPath));
  push('Virtual Desktop Streamer installed', soft.virtualDesktopInstalled);
  push('Virtual Desktop Streamer running', soft.virtualDesktopRunning);

  lines.push('');
  lines.push('--- UEVR ---');
  const uevr = await deps.uevrManager.getStatus();
  push('Installed version', uevr.installedVersion);
  push('Injector present', uevr.injectorExists);
  push('AC7 profile deployed', uevr.profileDeployed);
  push('One-click injector task', uevr.injectorTaskRegistered);
  push('Managed path', redactHome(uevr.managedPath));

  // Hash the key DLLs so support can spot a corrupted / tampered UEVR drop.
  const dllsToHash = ['UEVRInjector.exe', 'UEVRBackend.dll', 'UEVRPluginNullifier.dll'];
  for (const dll of dllsToHash) {
    const p = path.join(uevr.managedPath, dll);
    const hash = await sha256Short(p);
    if (hash) push(`  sha256[0..16] ${dll}`, hash);
  }

  lines.push('');
  lines.push(`--- Last ${MAX_LOG_LINES} log lines ---`);
  const logs = deps.getRecentLogs().slice(-MAX_LOG_LINES);
  if (logs.length === 0) {
    lines.push('(no logs captured this session)');
  } else {
    for (const line of logs) lines.push(redactHome(line));
  }

  return lines.join('\n');
};
