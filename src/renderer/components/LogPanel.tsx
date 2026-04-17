import React from 'react';

export const LogPanel: React.FC<{ lines: string[] }> = ({ lines }) => {
  return (
    <div className="log-panel">
      {lines.length === 0 ? <div className="log-line muted">No logs yet.</div> : null}
      {lines.map((line, index) => (
        <div key={`${index}-${line}`} className="log-line">{line}</div>
      ))}
    </div>
  );
};
