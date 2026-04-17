import React, { useEffect, useState } from 'react';
import type { UEVRStatus } from '@shared/types';
import { ProgressBar } from '../components/ProgressBar';

export const UEVRModStep: React.FC = () => {
  const [status, setStatus] = useState<UEVRStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.ac7.getUEVRStatus().then(setStatus).catch((err) => setError((err as Error).message));
    return window.ac7.onUEVRProgress(setProgress);
  }, []);

  const update = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await window.ac7.updateUEVR();
      setStatus(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="step-body">
      <div className="toolbar">
        <button type="button" disabled={busy} onClick={update}>Download / Update UEVR</button>
      </div>
      <ProgressBar value={progress} />
      {error ? <p className="error">{error}</p> : null}
      <div className="kv-list">
        <div><span>Managed Path</span><strong>{status?.managedPath ?? '-'}</strong></div>
        <div><span>Installed Version</span><strong>{status?.installedVersion ?? 'Not installed'}</strong></div>
        <div><span>Latest Version</span><strong>{status?.latestVersion ?? 'Unknown'}</strong></div>
        <div><span>Injector Found</span><strong>{status?.injectorExists ? 'Yes' : 'No'}</strong></div>
      </div>
    </div>
  );
};
