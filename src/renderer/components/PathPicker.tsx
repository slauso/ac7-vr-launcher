import React from 'react';

export const PathPicker: React.FC<{
  label: string;
  value?: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => {
  const browse = async () => {
    const selected = await window.ac7.browseForFolder();
    if (selected) onChange(selected);
  };

  return (
    <div className="path-picker">
      <label>{label}</label>
      <div className="path-row">
        <input value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder="Select folder..." />
        <button type="button" onClick={browse}>Browse</button>
      </div>
    </div>
  );
};
