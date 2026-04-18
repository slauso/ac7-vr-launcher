import React, { useEffect, useMemo, useState } from 'react';
import type { CameraPreset, CameraMode } from '@shared/types';

const MODES: Array<{ mode: CameraMode; label: string }> = [
  { mode: 'inside-cockpit', label: 'Inside cockpit' },
  { mode: 'outside-chase', label: 'Outside / chase' },
  { mode: 'free-cinematic', label: 'Free / cinematic' }
];

const slider = (
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (next: number) => void
) => (
  <label>
    {label}: {value}
    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </label>
);

export const CameraStep: React.FC = () => {
  const [presets, setPresets] = useState<CameraPreset[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<CameraPreset | null>(null);
  const [message, setMessage] = useState<string>('');

  const refresh = async () => {
    const loaded = await window.ac7.getCameraPresets();
    setPresets(loaded);
    if (!selectedId && loaded[0]) {
      setSelectedId(loaded[0].id);
      setDraft(loaded[0]);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const found = presets.find((item) => item.id === selectedId) ?? null;
    setDraft(found ? { ...found } : null);
  }, [presets, selectedId]);

  const selectedModeLabel = useMemo(
    () => MODES.find((item) => item.mode === draft?.mode)?.label ?? '-',
    [draft?.mode]
  );

  if (!draft) return <p className="muted">No camera presets yet.</p>;

  return (
    <div className="step-body">
      <div className="toolbar">
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select>
        {MODES.map((option) => (
          <button key={option.mode} type="button" onClick={() => setDraft((prev) => (prev ? { ...prev, mode: option.mode, name: option.label } : prev))}>
            {option.label}
          </button>
        ))}
        <button
          type="button"
          className="btn-primary"
          onClick={() => void window.ac7.setCameraPreset(draft).then(() => {
            setMessage('Camera preset saved.');
            return refresh();
          })}
        >
          Save preset
        </button>
      </div>

      <div className="info-box"><p>Mode: <strong>{selectedModeLabel}</strong></p></div>
      <div className="toggle-grid">
        {slider('FOV', draft.fov, 40, 140, 1, (fov) => setDraft((prev) => (prev ? { ...prev, fov } : prev)))}
        {slider('Offset X', draft.offsetX, -10, 10, 0.1, (offsetX) => setDraft((prev) => (prev ? { ...prev, offsetX } : prev)))}
        {slider('Offset Y', draft.offsetY, -10, 10, 0.1, (offsetY) => setDraft((prev) => (prev ? { ...prev, offsetY } : prev)))}
        {slider('Offset Z', draft.offsetZ, -10, 10, 0.1, (offsetZ) => setDraft((prev) => (prev ? { ...prev, offsetZ } : prev)))}
        {slider('Pitch', draft.pitch, -180, 180, 1, (pitch) => setDraft((prev) => (prev ? { ...prev, pitch } : prev)))}
        {slider('Yaw', draft.yaw, -180, 180, 1, (yaw) => setDraft((prev) => (prev ? { ...prev, yaw } : prev)))}
        {slider('Roll', draft.roll, -180, 180, 1, (roll) => setDraft((prev) => (prev ? { ...prev, roll } : prev)))}
      </div>
      {message ? <p className="good">{message}</p> : null}
    </div>
  );
};
