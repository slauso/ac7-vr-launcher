import React, { useState } from 'react';
import type { SoftwareDetectionResult } from '@shared/types';
import { FixItButton } from '../components/FixItButton';
import { PathPicker } from '../components/PathPicker';
import { StatusBadge } from '../components/StatusBadge';

export const SoftwareDetectStep: React.FC<{
  ac7Path?: string;
  onAc7Path: (path?: string) => void;
}> = ({ ac7Path, onAc7Path }) => {
  const [result, setResult] = useState<SoftwareDetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixMessage, setFixMessage] = useState<string | null>(null);

  const detect = async () => {
    setError(null);
    try {
      const output = await window.ac7.detectSoftware(ac7Path);
      onAc7Path(output.ac7InstallPath);
      setResult(output);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="step-body">
      <div className="info-box">
        <p>
          <strong>How it works:</strong> Your Quest 3 headset runs the <em>Virtual Desktop</em> app.
          The PC runs the <em>Virtual Desktop Streamer</em> — this is what we start here.
          SteamVR is <em>not required</em> for this setup.
        </p>
      </div>
      <div className="toolbar">
        <button type="button" onClick={detect}>Detect Software</button>
      </div>
      <PathPicker label="Ace Combat 7 Install Path (auto-detected, or browse)" value={ac7Path} onChange={(value) => onAc7Path(value)} />
      {error ? <p className="error">{error}</p> : null}
      {fixMessage ? <p className="muted">{fixMessage}</p> : null}
      <div className="status-list">
        {result?.items.map((item) => (
          <div key={item.id} className="status-row">
            <div>
              <strong>{item.label}</strong>
              {item.code ? <span className="error-code"> [{item.code}]</span> : null}
              {item.details ? <div className="muted">{item.details}</div> : null}
            </div>
            <div className="status-actions">
              <StatusBadge status={item.status} />
              {item.fixAction ? (
                <FixItButton
                  action={item.fixAction}
                  label={item.fixActionLabel}
                  ac7Path={ac7Path}
                  onDone={(ok, msg) => {
                    setFixMessage(msg);
                    if (ok) void detect();
                  }}
                />
              ) : null}
              {item.actionUrl ? (
                <button type="button" onClick={() => void window.ac7.openExternal(item.actionUrl!)}>{item.actionLabel ?? 'Open'}</button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
