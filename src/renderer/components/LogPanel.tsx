import React, { useRef } from 'react';

let lineCounter = 0;

export const LogPanel: React.FC<{ lines: string[] }> = ({ lines }) => {
  const ids = useRef<number[]>([]);

  // Grow the ids array to match lines length, assigning a unique id to each new entry
  while (ids.current.length < lines.length) {
    lineCounter += 1;
    ids.current.push(lineCounter);
  }
  // Trim ids if lines were cleared
  if (ids.current.length > lines.length) {
    ids.current = ids.current.slice(-lines.length);
  }

  return (
    <div className="log-panel">
      {lines.length === 0 ? <div className="log-line muted">No logs yet.</div> : null}
      {lines.map((line, index) => (
        <div key={ids.current[index]} className="log-line">{line}</div>
      ))}
    </div>
  );
};
