import React, { useEffect, useMemo, useState } from 'react';
import type { ModEntry } from '@shared/types';

const guessAircraft = (mod: ModEntry): string => {
  if (mod.aircraft) return mod.aircraft;
  const match = mod.fileName.match(/(F-\d+[A-Z]?|A-10C|SU-\d+|MIG-\d+)/i);
  return match?.[1]?.toUpperCase() ?? 'Unknown';
};

export const SkinsStep: React.FC = () => {
  const [mods, setMods] = useState<ModEntry[]>([]);
  const [message, setMessage] = useState('');

  const refresh = async () => setMods(await window.ac7.listMods());
  useEffect(() => {
    void refresh();
  }, []);

  const grouped = useMemo(() => {
    const skins = mods.filter((mod) => mod.type === 'skin' || /skin|livery/i.test(mod.fileName));
    return skins.reduce<Record<string, ModEntry[]>>((acc, mod) => {
      const aircraft = guessAircraft(mod);
      acc[aircraft] = [...(acc[aircraft] ?? []), mod];
      return acc;
    }, {});
  }, [mods]);

  const enableExclusive = async (aircraft: string, target: ModEntry) => {
    const group = grouped[aircraft] ?? [];
    await Promise.all(group.filter((mod) => mod.enabled && mod.fileName !== target.fileName).map((mod) => window.ac7.disableMod(mod.fileName)));
    await window.ac7.enableMod(target.fileName);
    setMessage(`Enabled ${target.fileName} for ${aircraft}. Other skins for this aircraft were disabled.`);
    await refresh();
  };

  return (
    <div className="step-body">
      {Object.keys(grouped).length === 0 ? <p className="muted">No skin mods detected yet.</p> : null}
      {Object.entries(grouped).map(([aircraft, skins]) => (
        <div key={aircraft} className="status-row">
          <div>
            <strong>{aircraft}</strong>
            <div className="muted">{skins.length} skin(s)</div>
            <div className="toggle-grid">
              {skins.map((skin) => (
                <div key={skin.fullPath}>
                  <span>{skin.fileName}</span>
                  {skin.thumbnailPath ? <div><img src={`file://${skin.thumbnailPath}`} alt={`${aircraft} skin preview: ${skin.fileName}`} style={{ width: 96, borderRadius: 6 }} /></div> : null}
                </div>
              ))}
            </div>
          </div>
          <div className="status-actions">
            {skins.map((skin) => (
              <button key={skin.fullPath} type="button" onClick={() => void (skin.enabled ? window.ac7.disableMod(skin.fileName).then(refresh) : enableExclusive(aircraft, skin))}>
                {skin.enabled ? `Disable ${skin.fileName}` : `Enable ${skin.fileName}`}
              </button>
            ))}
          </div>
        </div>
      ))}
      {message ? <p className="good">{message}</p> : null}
    </div>
  );
};
