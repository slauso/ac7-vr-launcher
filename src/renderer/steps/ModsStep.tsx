import React, { useEffect, useState } from 'react';
import type { ModEntry } from '@shared/types';

export const ModsStep: React.FC = () => {
  const [mods, setMods] = useState<ModEntry[]>([]);
  const [message, setMessage] = useState<string>('');

  const refresh = async () => {
    try {
      setMods(await window.ac7.listMods());
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const installFromPicker = async () => {
    const source = await window.ac7.browseForModFile();
    if (!source) return;
    await window.ac7.installModFromPath(source);
    setMessage('Mod installed.');
    await refresh();
  };

  return (
    <div className="step-body">
      <div className="toolbar">
        <button type="button" className="btn-primary" onClick={() => void installFromPicker()}>Install mod from file</button>
        <button type="button" onClick={() => void refresh()}>Refresh</button>
      </div>
      {mods.length === 0 ? <p className="muted">No mods found in ~mods or ~mods_disabled.</p> : null}
      <div className="status-list">
        {mods.map((mod) => (
          <div key={mod.fullPath} className="status-row">
            <div>
              <strong>{mod.fileName}</strong>
              <div className="muted">{Math.round(mod.size / 1024)} KB · added {new Date(mod.dateAdded).toLocaleString()}</div>
              {mod.description ? <div className="muted">{mod.description}</div> : null}
            </div>
            <div className="status-actions">
              <strong>{mod.enabled ? 'Enabled' : 'Disabled'}</strong>
              <button
                type="button"
                onClick={() => void (mod.enabled ? window.ac7.disableMod(mod.fileName) : window.ac7.enableMod(mod.fileName)).then(refresh)}
              >
                {mod.enabled ? 'Disable' : 'Enable'}
              </button>
              <button type="button" onClick={() => void window.ac7.uninstallMod(mod.fileName).then(refresh)}>Uninstall</button>
            </div>
          </div>
        ))}
      </div>
      {message ? <p className="good">{message}</p> : null}
    </div>
  );
};
