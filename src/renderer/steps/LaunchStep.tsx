import React, { useEffect, useState } from 'react';
import type { LaunchStepStatus, PathOverrides, PreflightResult } from '@shared/types';
import { FixItButton } from '../components/FixItButton';
import { LogPanel } from '../components/LogPanel';
import { StatusBadge } from '../components/StatusBadge';

export const LaunchStep: React.FC<{ ac7Path?: string; pathOverrides?: PathOverrides }> = ({ ac7Path, pathOverrides }) => {
  const [steps, setSteps] = useState<Record<string, LaunchStepStatus>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LaunchStepStatus | null>(null);
  const [fixMessage, setFixMessage] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);

  useEffect(() => {
    const offUpdate = window.ac7.onLaunchUpdate((step) => {
      if (step.id === 'error') {
        setError(step);
      } else {
        setSteps((prev) => ({ ...prev, [step.id]: step }));
        // Promote any error-flavored step update into the banner too so the
        // user sees the Fix it button without scrolling.
        if (step.status === 'error') setError(step);
      }
    });
    const offLog = window.ac7.onLog((line) => setLogs((prev) => [...prev.slice(-299), line]));
    return () => {
      offUpdate();
      offLog();
    };
  }, []);

  /** Kick off a launch, optionally with the extra-warmup flag. */
  const runLaunch = async (extraWarmup = false) => {
    setBusy(true);
    setError(null);
    setFixMessage(null);
    setLogs([]);
    setSteps({});
    setPreflight(null);
    try {
      // Pre-flight re-verify so regressions (VD closed, UEVR deleted, VC++
      // gone) surface up-front instead of mid-flight.
      const check = await window.ac7.preflightCheck(ac7Path, pathOverrides);
      if (!check.ok) {
        setPreflight(check);
        setBusy(false);
        return;
      }
      await window.ac7.launchVR(ac7Path, { extraWarmup, overrides: pathOverrides });
    } catch (err) {
      // The main-process `launch:update` with id='error' already carries
      // the code + fixAction, so we only need a fallback string here.
      if (!error) setError({ id: 'error', label: 'Launch failed', status: 'error', message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const abort = async () => {
    await window.ac7.abortLaunch();
    setBusy(false);
  };

  const questStep = steps['quest'];

  return (
    <div className="step-body">
      <div className="info-box">
        <p>
          Clicking <strong>Launch VR</strong> will: start Virtual Desktop Streamer if needed, launch
          Ace Combat 7, wait ~25s for the game to fully load, then trigger the elevated UEVR
          injector with <code>--attach=Ace7Game-Win64-Shipping.exe</code> so it auto-injects with{' '}
          <strong>no UAC prompt and no manual click</strong> (assuming you accepted the one-time UAC
          during Install &amp; Configure that registered the elevated scheduled task). If the task
          isn&apos;t registered yet, Windows will show a UAC prompt this once — accept it, and then
          re-run Install &amp; Configure to skip it next time. Once injected, put on your{' '}
          <strong>Quest 3</strong> and open the <strong>Virtual Desktop</strong> app on the headset
          to connect.
        </p>
      </div>
      <div className="toolbar">
        <button type="button" disabled={busy} onClick={() => void runLaunch(false)} className="btn-primary">
          🚀 Launch VR
        </button>
        <button type="button" onClick={() => void abort()}>Stop / Abort</button>
      </div>

      {preflight && !preflight.ok ? (
        <div className="preflight-warning">
          <strong>⚠ Pre-flight check found issues</strong>
          <p className="muted">Fix these first — otherwise launching will likely fail partway through.</p>
          <div className="status-list">
            {preflight.issues.map((item) => (
              <div key={item.id} className="status-row">
                <div>
                  <strong>{item.label}</strong>
                  {item.code ? <span className="error-code"> [{item.code}]</span> : null}
                  {item.details ? <div className="muted">{item.details}</div> : null}
                </div>
                <div className="status-actions">
                  <StatusBadge status={item.status} />
                  {item.fixAction ? (
                    <FixItButton
                      action={item.fixAction}
                      label={item.fixActionLabel}
                      ac7Path={ac7Path}
                      onDone={(ok, msg) => {
                        setFixMessage(msg);
                         if (ok) void window.ac7.preflightCheck(ac7Path, pathOverrides).then(setPreflight);
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="launch-error">
          <p className="error">
            ⚠ {error.message}
            {error.code ? <span className="error-code"> [{error.code}]</span> : null}
          </p>
          {error.fixAction ? (
            <FixItButton
              action={error.fixAction}
              label={error.fixActionLabel}
              ac7Path={ac7Path}
              onRetryWithWarmup={() => void runLaunch(true)}
              onDone={(ok, msg) => setFixMessage(msg)}
            />
          ) : null}
        </div>
      ) : null}
      {fixMessage ? <p className="muted">{fixMessage}</p> : null}

      {questStep ? (
        <div className="quest-hint">
          🥽 <strong>{questStep.label}</strong> — {questStep.message}
        </div>
      ) : null}
      <div className="status-list">
        {Object.values(steps)
          .filter((s) => s.id !== 'quest' && s.id !== 'error')
          .map((step) => (
            <div key={step.id} className="status-row">
              <div>
                <strong>{step.label}</strong>
                {step.code ? <span className="error-code"> [{step.code}]</span> : null}
                {step.message ? <div className="muted">{step.message}</div> : null}
              </div>
              <div className="status-actions">
                <StatusBadge status={step.status} />
                {step.status === 'error' && step.fixAction ? (
                  <FixItButton
                    action={step.fixAction}
                    label={step.fixActionLabel}
                    ac7Path={ac7Path}
                    onRetryWithWarmup={() => void runLaunch(true)}
                    onDone={(ok, msg) => setFixMessage(msg)}
                  />
                ) : null}
              </div>
            </div>
          ))}
      </div>
      <LogPanel lines={logs} />
    </div>
  );
};
