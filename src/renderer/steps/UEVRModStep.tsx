import React, { useEffect, useState } from 'react';
import type { SetupStepStatus, UEVRRuntimeOptions, UEVRStatus } from '@shared/types';
import { FixItButton } from '../components/FixItButton';
import { ProgressBar } from '../components/ProgressBar';
import { StatusBadge } from '../components/StatusBadge';

export const UEVRModStep: React.FC<{ ac7Path?: string }> = ({ ac7Path }) => {
  const [status, setStatus] = useState<UEVRStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [setupSteps, setSetupSteps] = useState<Record<string, SetupStepStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [fixMessage, setFixMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [runtimeOptions, setRuntimeOptions] = useState<UEVRRuntimeOptions | null>(null);

  const refreshStatus = async () => {
    try {
      setStatus(await window.ac7.getUEVRStatus());
      setRuntimeOptions(await window.ac7.getUEVRRuntimeOptions());
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void refreshStatus();
    const offProgress = window.ac7.onUEVRProgress(setProgress);
    const offSetup = window.ac7.onSetupProgress((step) =>
      setSetupSteps((prev) => ({ ...prev, [step.id]: step }))
    );
    return () => {
      offProgress();
      offSetup();
    };
  }, []);

  const runSetup = async () => {
    setBusy(true);
    setError(null);
    setDone(false);
    setSetupSteps({});
    setProgress(0);
    try {
      await window.ac7.fullSetup(ac7Path);
      await refreshStatus();
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const alreadyInstalled = status?.injectorExists && status.profileDeployed;

  return (
    <div className="step-body">
      <div className="info-box">
        <p>
          <strong>What this does:</strong> Downloads the latest UEVR mod from GitHub, installs it,
          deploys the AC7-specific VR profile to the correct location, and applies recommended game
          settings — all automatically. No manual file placement required.
        </p>
      </div>

      <div className="toolbar">
        <button type="button" disabled={busy} onClick={runSetup} className="btn-primary">
          {alreadyInstalled ? '↺ Re-install & Reconfigure' : '⬇ Install & Configure'}
        </button>
        <button type="button" aria-label="Inject UEVR into running Ace Combat 7 process" onClick={() => void window.ac7.injectUEVR().then(refreshStatus).catch((err) => setError((err as Error).message))}>Inject UEVR now</button>
        <button type="button" aria-label="Import an existing UEVR installation folder" onClick={() => void window.ac7.importUEVRFolder().then(refreshStatus).catch((err) => setError((err as Error).message))}>Import UEVR folder</button>
        <button type="button" aria-label="Deploy the Ace Combat 7 UEVR profile into UnrealVR games folder" onClick={() => void window.ac7.deployUEVRProfile().then(refreshStatus).catch((err) => setError((err as Error).message))}>Deploy AC7 profile</button>
        <button type="button" aria-label="Open official UEVR latest release page" onClick={() => void window.ac7.openExternal('https://github.com/praydog/UEVR/releases/latest')}>Download UEVR</button>
      </div>

      {busy ? <ProgressBar value={progress} /> : null}
      {error ? <p className="error">⚠ {error}</p> : null}
      {fixMessage ? <p className="muted">{fixMessage}</p> : null}
      {done ? <p className="good">✅ Setup complete — you are ready to launch!</p> : null}

      {Object.keys(setupSteps).length > 0 ? (
        <div className="status-list">
          {Object.values(setupSteps).map((step) => (
            <div key={step.id} className="status-row">
              <div>
                <strong>{step.label}</strong>
                {step.code ? <span className="error-code"> [{step.code}]</span> : null}
                {step.message ? <div className="muted">{step.message}</div> : null}
              </div>
              <div className="status-actions">
                <StatusBadge status={step.status} />
                {step.status === 'error' && step.fixAction ? (
                  <FixItButton
                    action={step.fixAction}
                    label={step.fixActionLabel}
                    ac7Path={ac7Path}
                    onDone={(ok, msg) => {
                      setFixMessage(msg);
                      if (ok) void refreshStatus();
                    }}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="kv-list">
        <div><span>UEVR installed</span><strong>{status?.injectorExists ? `Yes (${status.installedVersion ?? 'version unknown'})` : 'No'}</strong></div>
        <div><span>Injection status</span><strong>{status?.injectionStatus ?? 'unknown'}</strong></div>
        <div><span>AC7 profile deployed</span><strong>{status?.profileDeployed ? 'Yes' : 'No'}</strong></div>
        <div>
          <span>One-click VR injector</span>
          <strong>{status?.injectorTaskRegistered ? 'Yes (no UAC needed)' : 'No (UAC prompt per launch)'}</strong>
        </div>
        <div>
          <span>UEVR path</span>
          <strong className="muted" style={{ fontSize: '11px' }}>{status?.selectedPath ?? '-'}</strong>
        </div>
      </div>

      {runtimeOptions ? (
        <div className="toggle-grid">
          <label>
            Rendering method
            <select
              value={runtimeOptions.renderingMethod}
              onChange={(event) =>
                setRuntimeOptions((prev) => (prev ? { ...prev, renderingMethod: event.target.value as UEVRRuntimeOptions['renderingMethod'] } : prev))
              }
            >
              <option value="native-stereo">Native stereo</option>
              <option value="synchronized-sequential">Synchronized sequential</option>
              <option value="alternating">Alternating</option>
            </select>
          </label>
          <label>
            Runtime
            <select
              value={runtimeOptions.runtime}
              onChange={(event) =>
                setRuntimeOptions((prev) => (prev ? { ...prev, runtime: event.target.value as UEVRRuntimeOptions['runtime'] } : prev))
              }
            >
              <option value="openxr">OpenXR</option>
              <option value="openvr">OpenVR</option>
            </select>
          </label>
          <label><input type="checkbox" checked={runtimeOptions.ghostingFix} onChange={(event) => setRuntimeOptions((prev) => (prev ? { ...prev, ghostingFix: event.target.checked } : prev))} /> Ghosting fix</label>
          <button type="button" onClick={() => void window.ac7.setUEVRRuntimeOptions(runtimeOptions).then(() => setFixMessage('UEVR runtime options saved.'))}>Save runtime options</button>
        </div>
      ) : null}
    </div>
  );
};
