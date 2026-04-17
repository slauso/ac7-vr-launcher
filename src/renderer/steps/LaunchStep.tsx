import React, { useEffect, useState } from 'react';
import type { LaunchStepStatus } from '@shared/types';
import { LogPanel } from '../components/LogPanel';
import { StatusBadge } from '../components/StatusBadge';

export const LaunchStep: React.FC<{ ac7Path?: string }> = ({ ac7Path }) => {
  const [steps, setSteps] = useState<Record<string, LaunchStepStatus>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const offUpdate = window.ac7.onLaunchUpdate((step) => {
      setSteps((prev) => ({ ...prev, [step.id]: step }));
    });
    const offLog = window.ac7.onLog((line) => setLogs((prev) => [...prev.slice(-299), line]));
    return () => {
      offUpdate();
      offLog();
    };
  }, []);

  const launch = async () => {
    setBusy(true);
    setError(null);
    setLogs([]);
    try {
      await window.ac7.launchVR(ac7Path);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const abort = async () => {
    await window.ac7.abortLaunch();
    setBusy(false);
  };

  return (
    <div className="step-body">
      <div className="toolbar">
        <button type="button" disabled={busy} onClick={launch}>Launch VR</button>
        <button type="button" onClick={() => void abort()}>Stop / Abort</button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="status-list">
        {Object.values(steps).map((step) => (
          <div key={step.id} className="status-row">
            <div>
              <strong>{step.label}</strong>
              {step.message ? <div className="muted">{step.message}</div> : null}
            </div>
            <StatusBadge status={step.status} />
          </div>
        ))}
      </div>
      <LogPanel lines={logs} />
    </div>
  );
};
