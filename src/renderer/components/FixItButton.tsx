import React, { useState } from 'react';
import type { FixActionId } from '@shared/types';

/**
 * Single-click "Fix it for me" button. Renders next to a failed step /
 * status row when the main process advertised a `fixAction` id.
 *
 * The retry-with-extra-warmup action is special-cased by `onRetryWithWarmup`
 * because it doesn't run in the main process — it re-invokes launchVR from
 * the renderer.
 */
export const FixItButton: React.FC<{
  action: FixActionId;
  label?: string;
  ac7Path?: string;
  onDone?: (ok: boolean, message: string) => void;
  onRetryWithWarmup?: () => void;
}> = ({ action, label, ac7Path, onDone, onRetryWithWarmup }) => {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (action === 'retry-with-extra-warmup' && onRetryWithWarmup) {
        onRetryWithWarmup();
        onDone?.(true, 'Retrying with extra warmup…');
        return;
      }
      const result = await window.ac7.runFixAction(action, ac7Path);
      onDone?.(result.ok, result.message);
    } catch (err) {
      onDone?.(false, (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="btn-fix" disabled={busy} onClick={() => void run()}>
      {busy ? 'Working…' : `🛠 ${label ?? 'Fix it for me'}`}
    </button>
  );
};
