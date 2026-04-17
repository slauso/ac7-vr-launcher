import React from 'react';

export const ProgressBar: React.FC<{ value: number }> = ({ value }) => {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="progress-wrap">
      <div className="progress-fill" style={{ width: `${clamped}%` }} />
      <span>{clamped}%</span>
    </div>
  );
};
