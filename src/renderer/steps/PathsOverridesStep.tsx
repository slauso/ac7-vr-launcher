import React, { useState } from 'react';
import type { PathOverrides } from '@shared/types';

const entries: Array<{ key: keyof PathOverrides; label: string; kind: 'file' | 'folder' }> = [
  { key: 'steamExePath', label: 'Steam executable (steam.exe)', kind: 'file' },
  { key: 'steamVRPath', label: 'SteamVR folder', kind: 'folder' },
  { key: 'ac7InstallPath', label: 'Ace Combat 7 install folder', kind: 'folder' },
  { key: 'virtualDesktopPath', label: 'Virtual Desktop Streamer executable', kind: 'file' },
  { key: 'uevrInjectorPath', label: 'UEVR injector executable', kind: 'file' },
  { key: 'uevrSettingsPath', label: 'UEVR settings folder (%APPDATA%\\UnrealVRMod)', kind: 'folder' },
  { key: 'ac7ModsPath', label: 'AC7 PAK mods folder', kind: 'folder' },
  { key: 'ac7LoaderPath', label: 'AC7 loader mods folder', kind: 'folder' }
];

export const PathsOverridesStep: React.FC<{
  ac7Path?: string;
  paths: PathOverrides;
  onPathsChange: (paths: PathOverrides) => void;
  onAc7Path: (path?: string) => void;
}> = ({ ac7Path, paths, onPathsChange, onAc7Path }) => {
  const [message, setMessage] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const updatePath = (key: keyof PathOverrides, value: string) => {
    const next = { ...paths, [key]: value || undefined };
    onPathsChange(next);
    if (key === 'ac7InstallPath') onAc7Path(value || ac7Path);
  };

  const browse = async (key: keyof PathOverrides, kind: 'file' | 'folder') => {
    const selected = kind === 'folder'
      ? await window.ac7.browseForFolder()
      : await window.ac7.browseForFile(['exe', 'bat', 'cmd']);
    if (selected) updatePath(key, selected);
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const current = await window.ac7.getSettings();
      await window.ac7.saveSettings({
        ...current,
        paths
      });
      setMessage('Path overrides saved.');
    } catch (err) {
      setMessage(`Failed to save paths: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="step-body">
      <div className="info-box">
        <p>
          Auto-detection is still used by default. Set any path manually here when detection misses your install.
          These overrides are stored in <code>%APPDATA%\ac7-vr-launcher\settings.json</code>.
        </p>
      </div>
      <div className="status-list">
        {entries.map((entry) => (
          <div className="status-row" key={entry.key}>
            <div style={{ flex: 1 }}>
              <strong>{entry.label}</strong>
              <div className="path-row">
                <input
                  value={paths[entry.key] ?? ''}
                  onChange={(event) => updatePath(entry.key, event.target.value)}
                  placeholder={entry.kind === 'folder' ? 'Select folder...' : 'Select file...'}
                />
                <button type="button" onClick={() => void browse(entry.key, entry.kind)}>Browse</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="toolbar">
        <button type="button" disabled={saving} onClick={() => void save()} className="btn-primary">Save Overrides</button>
      </div>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
};
