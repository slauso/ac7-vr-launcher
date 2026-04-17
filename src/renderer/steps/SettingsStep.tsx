import React, { useEffect, useState } from 'react';
import type { AppSettings } from '@shared/types';

export const SettingsStep: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'dark-blue',
    autoUpdateUEVR: true,
    minimizeToTray: false
  });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    void window.ac7.getSettings().then(setSettings).catch(() => undefined);
  }, []);

  const save = async () => {
    await window.ac7.saveSettings(settings);
    setMessage('Settings saved');
  };

  /**
   * Build the sanitized diagnostic bundle and copy it to the clipboard.
   * The main process already writes to the Electron clipboard; we also try
   * the web Clipboard API as a fallback for older platforms.
   */
  const copyDiagnostics = async () => {
    setBusy(true);
    setMessage('');
    try {
      const report = await window.ac7.buildDiagnosticsReport();
      try {
        await navigator.clipboard.writeText(report);
      } catch {
        // Main process already copied — ignore.
      }
      setMessage('Diagnostic report copied to clipboard — paste it anywhere to share.');
    } catch (err) {
      setMessage(`Failed to build diagnostics: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  /**
   * "Reset everything": a single destructive action that removes the
   * launcher-managed UEVR folder, the deployed AC7 profile, and restores
   * any GameUserSettings.ini backup. Game saves are in a separate directory
   * and are NOT touched.
   */
  const resetEverything = async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await window.ac7.resetEverything();
      const parts = [
        result.restoredIni ? 'restored backup' : null,
        result.removedUevr ? 'removed UEVR' : null,
        result.removedProfile ? 'removed profile' : null,
        result.removedInjectorTask ? 'removed injector task' : null
      ].filter(Boolean);
      setMessage(
        parts.length > 0
          ? `Reset complete (${parts.join(', ')}). Your game saves were NOT touched.`
          : 'Nothing to reset — the launcher has not made any changes yet.'
      );
    } catch (err) {
      setMessage(`Reset failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
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

      <div className="info-box">
        <p>
          <strong>Troubleshooting</strong><br />
          Stuck on an error? <em>Copy diagnostic report</em> puts a sanitized summary
          (OS, GPU, UEVR version, last 200 log lines — no personal paths) on your
          clipboard so you can paste it into a support thread. <em>Reset everything</em>
          undoes every change the launcher has made so you can start from scratch.
        </p>
      </div>
      <div className="toolbar">
        <button type="button" disabled={busy} onClick={() => void copyDiagnostics()}>
          📋 Copy diagnostic report
        </button>
        {confirmReset ? (
          <>
            <button type="button" className="btn-danger" disabled={busy} onClick={() => void resetEverything()}>
              Yes, reset everything
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
            <span className="muted">This will undo the launcher's changes. Your game saves are not touched.</span>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => setConfirmReset(true)}>
            ♻ Reset everything
          </button>
        )}
      </div>

      <p className="muted">App version: 1.0.0</p>
      {message ? <p className="good">{message}</p> : null}
    </div>
  );
};
