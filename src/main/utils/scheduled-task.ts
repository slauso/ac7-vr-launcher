import { execFile, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { launchElevated } from './elevate';

const execFileAsync = promisify(execFile);

/**
 * Stable name of the Windows Scheduled Task we create to launch the elevated
 * UEVR injector without prompting for UAC each time the user clicks "Launch
 * VR". The task is registered once during Install & Configure (which is the
 * single UAC prompt the user pays) with `RunLevel=HIGHEST`, after which any
 * standard-user process can trigger it via `schtasks /Run` with no additional
 * consent dialog.
 */
export const INJECTOR_TASK_NAME = 'AC7VRLauncher_UEVRInject';

/**
 * Returns true if the named scheduled task is currently registered for the
 * current user. Uses `schtasks /Query` which exits non-zero if the task is
 * absent — that's how we infer "not installed" without needing admin rights.
 */
export const taskExists = (taskName: string = INJECTOR_TASK_NAME): boolean => {
  try {
    execSync(`schtasks /Query /TN "${taskName}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * Build a Task Scheduler XML document that runs `<injectorPath> --attach=<exe>`
 * elevated, on demand only (no time/event triggers — we always invoke it via
 * `schtasks /Run`). Using XML rather than the `schtasks /Create /TR ...` form
 * avoids the well-known double-quoting pitfalls that bite when the injector
 * path contains spaces (very common under `C:\Users\<name>\AppData\…`).
 */
const buildTaskXml = (injectorPath: string, attachExeName: string, userId: string): string => {
  const args = `--attach=${attachExeName}`;
  const workingDir = path.dirname(injectorPath);
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>AC7 VR Launcher: launch UEVR Injector elevated without a UAC prompt.</Description>
    <URI>\\${INJECTOR_TASK_NAME}</URI>
  </RegistrationInfo>
  <Triggers />
  <Principals>
    <Principal id="Author">
      <UserId>${xmlEscape(userId)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xmlEscape(injectorPath)}</Command>
      <Arguments>${xmlEscape(args)}</Arguments>
      <WorkingDirectory>${xmlEscape(workingDir)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
};

/**
 * Register (or overwrite) the elevated injector scheduled task. Requires a
 * single UAC prompt because `RunLevel=HighestAvailable` registration writes
 * to the system Task Scheduler. The task is per-user; once installed the
 * user can trigger it without UAC for the lifetime of their account.
 */
export const registerInjectorTask = async (
  injectorPath: string,
  attachExeName: string,
  taskName: string = INJECTOR_TASK_NAME
): Promise<void> => {
  const username = os.userInfo().username;
  // Prefer DOMAIN\user form when running on a domain-joined PC; fall back to
  // bare username for typical home installations. schtasks accepts both.
  const userDomain = process.env.USERDOMAIN;
  const userId = userDomain ? `${userDomain}\\${username}` : username;
  const xml = buildTaskXml(injectorPath, attachExeName, userId);
  // schtasks /XML requires UTF-16 LE with BOM. Write it to a temp file and
  // hand the file path off to schtasks via launchElevated.
  const tmpFile = path.join(os.tmpdir(), `ac7-vr-launcher-task-${Date.now()}.xml`);
  // BOM (FF FE) + UTF-16 LE encoded body.
  const bom = Buffer.from([0xff, 0xfe]);
  const body = Buffer.from(xml, 'utf16le');
  await fs.promises.writeFile(tmpFile, Buffer.concat([bom, body]));
  try {
    await launchElevated('schtasks.exe', [
      '/Create',
      '/TN', taskName,
      '/XML', tmpFile,
      '/F'
    ]);
  } finally {
    await fs.promises.unlink(tmpFile).catch(() => undefined);
  }
};

/**
 * Trigger the injector task. This call is intentionally NOT elevated — that's
 * the whole point of the scheduled-task design: elevation lives in the task
 * definition, not in the trigger. Returns when schtasks has returned, which
 * happens immediately; the injector is launched asynchronously by the task
 * scheduler.
 */
export const runInjectorTask = async (taskName: string = INJECTOR_TASK_NAME): Promise<void> => {
  await execFileAsync('schtasks.exe', ['/Run', '/TN', taskName]);
};

/**
 * Best-effort removal of the scheduled task. Used by the "Reset everything"
 * maintenance action. Returns true if the task was deleted; false if it was
 * absent or the deletion failed.
 */
export const removeInjectorTask = async (taskName: string = INJECTOR_TASK_NAME): Promise<boolean> => {
  if (!taskExists(taskName)) return false;
  try {
    // Deleting an elevated task requires elevation — same UAC trade-off as
    // creating it. Reset is an explicit user action so the prompt is expected.
    await launchElevated('schtasks.exe', ['/Delete', '/TN', taskName, '/F']);
    return true;
  } catch {
    return false;
  }
};

