import React, { useMemo, useState } from 'react';

export const LogPanel: React.FC<{ lines: string[] }> = ({ lines }) => {
  const [filter, setFilter] = useState<'all' | 'errors' | 'launch' | 'injector'>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return lines;
    if (filter === 'errors') return lines.filter((line) => /\berr(or)?\b/i.test(line));
    if (filter === 'launch') return lines.filter((line) => line.includes('[launch:'));
    return lines.filter((line) => /uevr|inject/i.test(line));
  }, [filter, lines]);

  const copy = async () => {
    const text = filtered.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // best effort
    }
  };

  return (
    <>
      <div className="toolbar">
        <label>
          Logs filter
          <select value={filter} onChange={(event) => setFilter(event.target.value as 'all' | 'errors' | 'launch' | 'injector')}>
            <option value="all">All</option>
            <option value="errors">Errors</option>
            <option value="launch">Launch events</option>
            <option value="injector">UEVR / injector</option>
          </select>
        </label>
        <button type="button" onClick={() => void copy()}>Copy logs</button>
        <button type="button" onClick={() => void window.ac7.exportLogs(filtered)}>Export logs</button>
      </div>
      <div className="log-panel">
        {filtered.length === 0 ? <div className="log-line muted">No logs for current filter.</div> : null}
        {filtered.map((line, index) => (
          <div key={`${filter}-${index}`} className="log-line">{line}</div>
        ))}
      </div>
    </>
  );
};
