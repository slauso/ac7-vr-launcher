import { spawn } from 'node:child_process';

/**
 * Launch a Windows executable with elevated (admin) privileges by delegating to
 * PowerShell's Start-Process -Verb RunAs. This triggers a single UAC prompt
 * without requiring the whole launcher to run elevated. Required for UEVR's
 * injector, which needs SeDebugPrivilege to perform DLL injection into the
 * running game process.
 *
 * Returns a Promise that resolves once PowerShell has returned. Note that the
 * child process launched by PowerShell is detached from ours — this intentionally
 * matches how the injector needs to keep running after we return.
 */
export const launchElevated = (
  exePath: string,
  args: string[] = [],
  workingDirectory?: string
): Promise<void> => {
  // Build the PowerShell argument list. Quoting is critical because paths may
  // contain spaces. ArgumentList entries are joined by commas and each wrapped in
  // single quotes to survive PowerShell parsing.
  const psArgList = args.map((a) => `'${a.replace(/'/g, "''")}'`).join(',');
  const startProcessArgs = [
    '-FilePath',
    `'${exePath.replace(/'/g, "''")}'`,
    '-Verb',
    'RunAs'
  ];
  if (psArgList) {
    startProcessArgs.push('-ArgumentList', psArgList);
  }
  if (workingDirectory) {
    startProcessArgs.push('-WorkingDirectory', `'${workingDirectory.replace(/'/g, "''")}'`);
  }

  const command = `Start-Process ${startProcessArgs.join(' ')}`;

  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true }
    );

    let stderr = '';
    child.stderr?.on('data', (data) => {
      stderr += String(data);
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        // Most common non-zero case: user declined the UAC prompt.
        reject(new Error(stderr.trim() || `Elevation request was cancelled or failed (exit code ${code ?? 'unknown'})`));
      }
    });
  });
};
