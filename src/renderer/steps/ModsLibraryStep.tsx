import React, { useEffect, useState } from 'react';
import type { ModRecord, PathOverrides } from '@shared/types';

export const ModsLibraryStep: React.FC<{ ac7Path?: string; pathOverrides: PathOverrides }> = ({
  ac7Path,
  pathOverrides
}) => {
  const [mods, setMods] = useState<ModRecord[]>([]);
  const [message, setMessage] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setMods(await window.ac7.listMods());
  };

  useEffect(() => {
    void refresh();
  }, []);

  const addMod = async () => {
    const sourcePath = await window.ac7.browseForModSource();
    if (!sourcePath) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await window.ac7.addMod({
        sourcePath,
        ac7Path: ac7Path || pathOverrides.ac7InstallPath,
        modsDir: pathOverrides.ac7ModsPath,
        loaderDir: pathOverrides.ac7LoaderPath
      });
      setMods(result.mods);
      setMessage(`Installed mod: ${result.added.name}`);
    } catch (err) {
      setMessage(`Add mod failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (mod: ModRecord) => {
    setBusy(true);
    try {
      const list = await window.ac7.setModEnabled(mod.id, !mod.enabled, ac7Path, pathOverrides.ac7ModsPath, pathOverrides.ac7LoaderPath);
      setMods(list);
    } catch (err) {
      setMessage(`Toggle failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (mod: ModRecord) => {
    setBusy(true);
    try {
      const list = await window.ac7.removeMod(mod.id);
      setMods(list);
    } catch (err) {
      setMessage(`Remove failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const move = async (mod: ModRecord, delta: -1 | 1) => {
    const sorted = [...mods].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((item) => item.id === mod.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= sorted.length) return;
    const [removed] = sorted.splice(index, 1);
    sorted.splice(target, 0, removed);
    const reordered = await window.ac7.reorderMods(sorted.map((item) => item.id));
    setMods(reordered);
  };

  return (
    <div className="step-body">
      <div className="info-box">
        <p>
          Add mods from a folder or zip. Supported types: PAK mods, loader/DLL mods, and config patches.
          Installed mods are tracked in <code>%APPDATA%\ac7-vr-launcher\mods.json</code>.
        </p>
      </div>
      <div className="toolbar">
        <button type="button" className="btn-primary" onClick={() => void addMod()} disabled={busy}>
          + Add Mod / Skin / Patch
        </button>
      </div>
      {message ? <p className="muted">{message}</p> : null}
      <div className="status-list">
        {[...mods].sort((a, b) => a.order - b.order).map((mod) => (
          <div className="status-row" key={mod.id}>
            <div>
              <strong>{mod.name}</strong>
              <div className="muted">{mod.type.toUpperCase()} • {mod.enabled ? 'Enabled' : 'Disabled'} • Order {mod.order}</div>
              <div className="muted" style={{ fontSize: 11 }}>{mod.source}</div>
            </div>
            <div className="status-actions">
              <button type="button" disabled={busy} onClick={() => void move(mod, -1)}>↑</button>
              <button type="button" disabled={busy} onClick={() => void move(mod, 1)}>↓</button>
              <button type="button" disabled={busy} onClick={() => void toggle(mod)}>{mod.enabled ? 'Disable' : 'Enable'}</button>
              <button type="button" className="btn-danger" disabled={busy} onClick={() => void remove(mod)}>Uninstall</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
