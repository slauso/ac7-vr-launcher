import os from 'node:os';
import type { DependencyCheckResult, StatusItem } from '@shared/types';
import { readRegistryValue, registryKeyExists } from '../utils/registry';

export class DependencyChecker {
  public check(): DependencyCheckResult {
    const windowsVersion = os.release();
    const windowsSupported = process.platform === 'win32' && Number(windowsVersion.split('.')[0] ?? 0) >= 10;

    const vcppInstalled = Number(
      readRegistryValue('HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64', 'Installed') ?? 0
    ) === 1;

    const directxInstalled = registryKeyExists('HKLM\\SOFTWARE\\Microsoft\\DirectX')
      || registryKeyExists('HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\DirectX');

    const items: StatusItem[] = [
      {
        id: 'windows',
        label: 'Windows 10 or newer',
        status: windowsSupported ? 'ok' : 'error',
        details: `Detected: ${process.platform} ${windowsVersion}`
      },
      {
        id: 'vcpp',
        label: 'Microsoft Visual C++ Redistributable x64',
        status: vcppInstalled ? 'ok' : 'error',
        details: vcppInstalled ? 'Installed' : 'Missing',
        actionLabel: 'Download',
        actionUrl: 'https://aka.ms/vs/17/release/vc_redist.x64.exe'
      },
      {
        id: 'directx',
        label: 'DirectX Runtime',
        status: directxInstalled ? 'ok' : 'error',
        details: directxInstalled ? 'Detected' : 'Not detected',
        actionLabel: 'Download',
        actionUrl: 'https://www.microsoft.com/en-us/download/details.aspx?id=35'
      }
    ];

    return { windowsVersion, windowsSupported, vcppInstalled, directxInstalled, items };
  }
}
