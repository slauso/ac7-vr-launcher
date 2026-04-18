import React, { useEffect, useState } from 'react';
import type { UEVRRuntimeOptions } from '@shared/types';

export const OverlaysStep: React.FC = () => {
  const [options, setOptions] = useState<UEVRRuntimeOptions | null>(null);
  const [message, setMessage] = useState('');

  const refresh = async () => setOptions(await window.ac7.getUEVRRuntimeOptions());
  useEffect(() => {
    void refresh();
  }, []);

  if (!options) return <p className="muted">Loading overlay settings…</p>;

  return (
    <div className="step-body">
      <label><input type="checkbox" checked={options.overlaysEnabled} onChange={(event) => setOptions((prev) => (prev ? { ...prev, overlaysEnabled: event.target.checked } : prev))} /> Overlays enabled in VR</label>
      <label><input type="checkbox" checked={options.performanceHud} disabled={!options.overlaysEnabled} onChange={(event) => setOptions((prev) => (prev ? { ...prev, performanceHud: event.target.checked } : prev))} /> Performance HUD</label>
      <label><input type="checkbox" checked={options.controllerBindingsOverlay} disabled={!options.overlaysEnabled} onChange={(event) => setOptions((prev) => (prev ? { ...prev, controllerBindingsOverlay: event.target.checked } : prev))} /> Controller bindings overlay</label>
      <label><input type="checkbox" checked={options.recenterPrompt} disabled={!options.overlaysEnabled} onChange={(event) => setOptions((prev) => (prev ? { ...prev, recenterPrompt: event.target.checked } : prev))} /> Recenter prompt</label>
      <div className="toolbar">
        <button type="button" className="btn-primary" onClick={() => void window.ac7.setUEVRRuntimeOptions(options).then(() => setMessage('Overlay settings saved.'))}>Save overlays</button>
      </div>
      {message ? <p className="good">{message}</p> : null}
    </div>
  );
};
