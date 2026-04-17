import React, { useEffect, useState } from 'react';
import type { AppSettings } from '@shared/types';

export const SettingsStep: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'dark-blue',
    autoUpdateUEVR: true,
    minimizeToTray: false
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    void window.ac7.getSettings().then(setSettings).catch(() => undefined);
  }, []);

  const save = async () => {
    await window.ac7.saveSettings(settings);
    setMessage('Settings saved');
  };

  return (
    <div className="step-body">
      <div className="toggle-grid">
        <label>
          Theme
          <select value={settings.theme} onChange={(e) => setSettings((prev) => ({ ...prev, theme: e.target.value as AppSettings['theme'] }))}>
            <option value="dark">Dark</option>
            <option value="dark-blue">Dark Blue</option>
          </select>
        </label>
        <label><input type="checkbox" checked={settings.autoUpdateUEVR} onChange={(e) => setSettings((prev) => ({ ...prev, autoUpdateUEVR: e.target.checked }))} /> Auto-update UEVR on launch</label>
        <label><input type="checkbox" checked={settings.minimizeToTray} onChange={(e) => setSettings((prev) => ({ ...prev, minimizeToTray: e.target.checked }))} /> Minimize to tray</label>
      </div>
      <div className="toolbar">
        <button type="button" onClick={save}>Save Settings</button>
        <button type="button" onClick={() => void window.ac7.openExternal('https://github.com/praydog/UEVR')}>UEVR GitHub</button>
        <button type="button" onClick={() => void window.ac7.openExternal('https://discord.gg/flat2vr')}>Flat2VR Discord</button>
        <button type="button" onClick={() => void window.ac7.openExternal('https://www.vrdesktop.net/')}>Virtual Desktop</button>
      </div>
      <p className="muted">App version: 1.0.0</p>
      {message ? <p className="good">{message}</p> : null}
    </div>
  );
};
