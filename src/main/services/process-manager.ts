import { execSync, spawn, type ChildProcess } from 'node:child_process';

export class ProcessManager {
  private children = new Map<string, ChildProcess>();

  public launch(
    id: string,
    command: string,
    args: string[],
    onLog: (line: string) => void,
    detached = false
  ): void {
    const child = spawn(command, args, { shell: true, detached });
    this.children.set(id, child);

    child.stdout?.on('data', (data) => onLog(`[${id}] ${String(data).trim()}`));
    child.stderr?.on('data', (data) => onLog(`[${id}:err] ${String(data).trim()}`));
    child.on('exit', (code) => {
      onLog(`[${id}] exited with code ${code ?? 0}`);
      this.children.delete(id);
    });
  }

  public kill(id: string): void {
    const child = this.children.get(id);
    if (!child) return;
    child.kill('SIGTERM');
    this.children.delete(id);
  }

  public killAll(): void {
    for (const id of this.children.keys()) {
      this.kill(id);
    }
  }

  public isRunning(processName: string): boolean {
    try {
      const output = execSync(`tasklist /FI "IMAGENAME eq ${processName}"`, { encoding: 'utf8' });
      return output.toLowerCase().includes(processName.toLowerCase());
    } catch {
      return false;
    }
  }

  public findPid(processName: string): number | null {
    try {
      const output = execSync(`tasklist /FI "IMAGENAME eq ${processName}" /FO CSV /NH`, { encoding: 'utf8' });
      const match = output.match(/^"[^"]+","(\d+)"/m);
      return match ? Number(match[1]) : null;
    } catch {
      return null;
    }
  }
}
