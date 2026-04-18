import type { FixActionId } from '@shared/types';

/**
 * Catalog of launcher errors. Each entry assigns:
 *  - a short stable `code` users can Google / paste into support channels
 *  - a plain-English `message` the UI surfaces above the raw technical error
 *  - an optional `fixAction` id the UI can bind to a "Fix it for me" button
 *
 * Codes are short & namespaced (e.g. `VD-001`) so the dev team can map them
 * 1:1 back to the code that raised them.
 */
export interface ErrorEntry {
  code: string;
  /** Plain-English explanation. */
  message: string;
  fixAction?: FixActionId;
  fixActionLabel?: string;
}

export const ERRORS = {
  VD_NOT_INSTALLED: {
    code: 'VD-001',
    message:
      'Virtual Desktop Streamer is not installed on this PC. '
      + 'Install it from vrdesktop.net and sign in before continuing.',
    fixAction: 'install-virtual-desktop',
    fixActionLabel: 'Open Virtual Desktop site'
  },
  VD_NOT_RUNNING: {
    code: 'VD-002',
    message: 'Virtual Desktop Streamer is installed but not running.',
    fixAction: 'start-virtual-desktop',
    fixActionLabel: 'Start Virtual Desktop'
  },
  AC7_NOT_DETECTED: {
    code: 'AC7-001',
    message:
      'Ace Combat 7 was not detected in any Steam library. '
      + 'This usually means the game files moved or the drive is offline.',
    fixAction: 'rescan-ac7-path',
    fixActionLabel: 'Rescan Steam libraries'
  },
  AC7_NOT_STARTED: {
    code: 'AC7-002',
    message:
      'Ace Combat 7 did not start within 90 seconds. Steam may be updating the game, '
      + 'or SteamGuard / UAC may be waiting for your input.',
    fixAction: 'start-steam',
    fixActionLabel: 'Bring Steam to foreground'
  },
  AC7_EARLY_EXIT: {
    code: 'AC7-003',
    message:
      'Ace Combat 7 closed very soon after launch. This usually means UEVR injected before '
      + 'the engine finished loading, an outdated GPU driver, or the deployed profile is corrupted.',
    fixAction: 'retry-with-extra-warmup',
    fixActionLabel: 'Retry with extra warmup'
  },
  UEVR_MISSING: {
    code: 'UEVR-001',
    message: 'UEVRInjector.exe is missing from the managed folder. Re-running Install & Configure will fix this.',
    fixAction: 'reinstall-uevr',
    fixActionLabel: 'Re-install UEVR'
  },
  UEVR_DOWNLOAD_FAILED: {
    code: 'UEVR-002',
    message:
      'The UEVR release could not be downloaded. Check your internet connection, '
      + 'or try again — GitHub occasionally rate-limits anonymous requests.',
    fixAction: 'reinstall-uevr',
    fixActionLabel: 'Retry download'
  },
  UEVR_PROFILE_MISSING: {
    code: 'UEVR-003',
    message: 'The AC7 UEVR profile is missing. Re-deploying it takes one click.',
    fixAction: 'redeploy-profile',
    fixActionLabel: 'Re-deploy profile'
  },
  UEVR_ELEVATION_REFUSED: {
    code: 'UEVR-004',
    message:
      'Windows blocked the UEVR injector from running with admin rights. '
      + 'Click Launch VR again and choose Yes on the User Account Control prompt.'
  },
  VCPP_MISSING: {
    code: 'VCPP-001',
    message:
      'Microsoft Visual C++ 2015-2022 Redistributable (x64) is not installed. '
      + 'UEVR will not load without it.',
    fixAction: 'install-vcpp',
    fixActionLabel: 'Download VC++'
  },
  DIRECTX_MISSING: {
    code: 'DX-001',
    message: 'The DirectX runtime was not detected.',
    fixAction: 'install-directx',
    fixActionLabel: 'Download DirectX'
  },
  INI_MALFORMED: {
    code: 'INI-001',
    message:
      "AC7's GameUserSettings.ini was malformed. A backup has been saved and a known-good file was written in its place."
  },
  INI_SECTION_MISSING: {
    code: 'INI-002',
    message:
      "AC7's GameUserSettings.ini was missing the [/Script/Engine.GameUserSettings] section header. "
      + 'The launcher fixed it automatically.'
  },
  STEAM_MISSING: {
    code: 'STEAM-001',
    message: 'Steam is not installed on this PC.',
    fixAction: 'install-ac7',
    fixActionLabel: 'Install Steam'
  },
  INJECT_TASK_MISSING: {
    code: 'UEVR-005',
    message:
      'The elevated UEVR injector scheduled task is not registered. Without it, every Launch VR shows a UAC prompt. '
      + 'Re-running Install & Configure (or "Install one-click injector") registers it once with a single UAC prompt.',
    fixAction: 'register-inject-task',
    fixActionLabel: 'Install one-click injector'
  }
} as const satisfies Record<string, ErrorEntry>;

export type ErrorKey = keyof typeof ERRORS;

/**
 * Best-effort plain-English translation of an arbitrary error message. We
 * match on known substrings; if nothing matches we return `null` and the UI
 * falls back to rendering the raw message.
 */
export const translateError = (raw: string | undefined): ErrorEntry | null => {
  if (!raw) return null;
  const text = raw.toLowerCase();

  if (text.includes('virtual desktop streamer is not installed')) return ERRORS.VD_NOT_INSTALLED;
  if (text.includes('ace combat 7 process was not detected')) return ERRORS.AC7_NOT_STARTED;
  if (text.includes('ace combat 7 exited')) return ERRORS.AC7_EARLY_EXIT;
  if (text.includes('uevr injector not found')) return ERRORS.UEVR_MISSING;
  if (text.includes('uevr download failed') || text.includes('github api failed')) return ERRORS.UEVR_DOWNLOAD_FAILED;
  if (text.includes('error_elevation_required') || text.includes('admin rights')) return ERRORS.UEVR_ELEVATION_REFUSED;
  if (text.includes('deploy ac7 uevr profile') || text.includes('ac7 uevr config asset missing')) {
    return ERRORS.UEVR_PROFILE_MISSING;
  }

  return null;
};

/**
 * Wrap a raw thrown error with the plain-English message + code so callers
 * can surface it directly. The raw text is preserved after the code so that
 * developers diagnosing logs can still see the original stack fragment.
 */
export const formatError = (raw: string | undefined): { code?: string; message: string; entry: ErrorEntry | null } => {
  const entry = translateError(raw);
  if (!entry) return { message: raw ?? 'Unknown error', entry: null };
  return { code: entry.code, message: entry.message, entry };
};
