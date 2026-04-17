import React, { useMemo, useState } from 'react';
import type { DependencyCheckResult } from '@shared/types';
import { StatusBadge } from '../components/StatusBadge';

export const SystemCheckStep: React.FC<{
  onReadinessChange?: (ready: boolean) => void;
}> = ({ onReadinessChange }) => {
  const [result, setResult] = useState<DependencyCheckResult | null>(null);
  const [override, setOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    setError(null);
    try {
      setResult(await window.ac7.checkDependencies());
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const allPassed = useMemo(
    () => (result ? result.items.every((item) => item.status === 'ok') : false),
    [result]
  );
  const isReady = allPassed || override;

  React.useEffect(() => {
    onReadinessChange?.(isReady);
  }, [isReady, onReadinessChange]);

  return (
    <div className="step-body">
      <div className="toolbar">
        <button type="button" onClick={check}>Run System Check</button>
        <label className="checkbox-inline">
          <input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} />
          Allow override
        </label>
        <span className={isReady ? 'good' : 'bad'}>
          {isReady ? 'Ready to continue' : 'Resolve errors or enable override'}
        </span>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="status-list">
        {result?.items.map((item) => (
          <div key={item.id} className="status-row">
            <div>
              <strong>{item.label}</strong>
              {item.details ? <div className="muted">{item.details}</div> : null}
            </div>
            <div className="status-actions">
              <StatusBadge status={item.status} />
              {item.actionUrl ? (
                <button type="button" onClick={() => void window.ac7.openExternal(item.actionUrl!)}>
                  {item.actionLabel ?? 'Open'}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
