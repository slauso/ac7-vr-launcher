import React, { useEffect, useMemo, useState } from 'react';
import type { PathOverrides, ProfileSettings, UEVRSettingItem } from '@shared/types';

export const ProfileConfigStep: React.FC<{ pathOverrides?: PathOverrides }> = ({ pathOverrides }) => {
  const [settings, setSettings] = useState<ProfileSettings>({
    borderlessWindow: true,
    disableMotionBlur: true,
    resolution: '1920x1080',
    headTracking: true,
    useOpenXR: true,
    sequentialRendering: true
  });
  const [friendlySettings, setFriendlySettings] = useState<UEVRSettingItem[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const settingsPath = pathOverrides?.uevrSettingsPath;

  useEffect(() => {
    void window.ac7.getUEVRSettings(settingsPath).then((doc) => setFriendlySettings(doc.items)).catch(() => undefined);
  }, [settingsPath]);

  const updateField = <K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const applyProfile = async () => {
    setError(null);
    try {
      const path = await window.ac7.applyDefaultProfile();
      setMessage(`Default profile applied: ${path}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const applyConfig = async () => {
    setError(null);
    try {
      const path = await window.ac7.applyGameConfig(settings);
      setMessage(`Game config updated: ${path}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const groupedSettings = useMemo(() => {
    const groups = new Map<string, UEVRSettingItem[]>();
    for (const item of friendlySettings) {
      const list = groups.get(item.category) ?? [];
      list.push(item);
      groups.set(item.category, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [friendlySettings]);

  const updateFriendly = (key: string, value: string) => {
    setFriendlySettings((prev) => prev.map((item) => (item.key === key ? { ...item, value } : item)));
  };

  const saveFriendly = async () => {
    setError(null);
    try {
      const savedPath = await window.ac7.saveUEVRSettings(
        friendlySettings.map((item) => ({ key: item.key, value: item.value })),
        settingsPath
      );
      setMessage(`UEVR settings saved: ${savedPath}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="step-body">
      <div className="toggle-grid">
        <label><input type="checkbox" checked={settings.borderlessWindow} onChange={(e) => updateField('borderlessWindow', e.target.checked)} /> Borderless Windowed</label>
        <label><input type="checkbox" checked={settings.disableMotionBlur} onChange={(e) => updateField('disableMotionBlur', e.target.checked)} /> Disable Motion Blur</label>
        <label><input type="checkbox" checked={settings.headTracking} onChange={(e) => updateField('headTracking', e.target.checked)} /> Head Tracking</label>
        <label><input type="checkbox" checked={settings.useOpenXR} onChange={(e) => updateField('useOpenXR', e.target.checked)} /> OpenXR Runtime</label>
        <label><input type="checkbox" checked={settings.sequentialRendering} onChange={(e) => updateField('sequentialRendering', e.target.checked)} /> Synced Sequential Rendering</label>
        <label>
          Resolution
          <select value={settings.resolution} onChange={(e) => updateField('resolution', e.target.value)}>
            <option value="1920x1080">1920x1080</option>
            <option value="2560x1440">2560x1440</option>
            <option value="3840x2160">3840x2160</option>
          </select>
        </label>
      </div>
      <div className="toolbar">
        <button type="button" onClick={applyProfile}>Apply Default Profile</button>
        <button type="button" onClick={() => void window.ac7.importProfile().then((path) => setMessage(path ? `Imported profile from ${path}` : 'Import canceled'))}>Import Profile</button>
        <button type="button" onClick={() => void window.ac7.exportProfile().then((path) => setMessage(path ? `Exported profile to ${path}` : 'Export canceled'))}>Export Profile</button>
        <button type="button" onClick={applyConfig}>Apply Game Config</button>
      </div>
      <div className="info-box">
        <p>
          <strong>UEVR Friendly Mode</strong><br />
          These settings are read from and written to your UEVR settings folder (
          <code>{settingsPath || '%APPDATA%\\UnrealVRMod'}</code>). Use Advanced mode to see raw keys.
        </p>
      </div>
      <div className="toolbar">
        <label className="checkbox-inline">
          <input type="checkbox" checked={advanced} onChange={(event) => setAdvanced(event.target.checked)} />
          Advanced (show raw key names)
        </label>
        <button type="button" onClick={() => void saveFriendly()}>Save UEVR Settings</button>
        <button
          type="button"
          onClick={() => void window.ac7.importUEVRSettings(settingsPath).then((doc) => {
            if (!doc) return setMessage('UEVR settings import canceled');
            setFriendlySettings(doc.items);
            setMessage(`Imported UEVR settings from ${doc.settingsFile}`);
          })}
        >
          Import UEVR Settings
        </button>
        <button
          type="button"
          onClick={() => void window.ac7.exportUEVRSettings(
            friendlySettings.map((item) => ({ key: item.key, value: item.value })),
            settingsPath
          ).then((outputPath) => setMessage(outputPath ? `Exported UEVR settings to ${outputPath}` : 'UEVR export canceled'))}
        >
          Export UEVR Settings
        </button>
      </div>
      <div className="status-list">
        {groupedSettings.map(([category, items]) => (
          <div key={category} className="status-row" style={{ display: 'block' }}>
            <strong>{category}</strong>
            <div className="toggle-grid" style={{ marginTop: 8 }}>
              {items.map((item) => (
                <label key={item.key}>
                  {advanced ? `${item.label} (${item.key})` : item.label}
                  <input value={item.value} onChange={(event) => updateFriendly(item.key, event.target.value)} />
                  <div className="muted" style={{ fontSize: 12 }}>{item.description}</div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="good">{message}</p> : null}
    </div>
  );
};
