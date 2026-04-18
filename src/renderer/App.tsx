import React, { useEffect, useMemo, useState } from 'react';
import type { PathOverrides } from '@shared/types';
import { Wizard } from './components/Wizard';
import { ModsLibraryStep } from './steps/ModsLibraryStep';
import { PathsOverridesStep } from './steps/PathsOverridesStep';
import { SystemCheckStep } from './steps/SystemCheckStep';
import { SoftwareDetectStep } from './steps/SoftwareDetectStep';
import { UEVRModStep } from './steps/UEVRModStep';
import { ProfileConfigStep } from './steps/ProfileConfigStep';
import { LaunchStep } from './steps/LaunchStep';
import { SettingsStep } from './steps/SettingsStep';

export const App: React.FC = () => {
  const [ac7Path, setAc7Path] = useState<string | undefined>();
  const [paths, setPaths] = useState<PathOverrides>({});
  const [systemStepReady, setSystemStepReady] = useState(false);

  useEffect(() => {
    void window.ac7.getSettings().then((settings) => {
      setPaths(settings.paths ?? {});
      if (settings.paths?.ac7InstallPath) setAc7Path(settings.paths.ac7InstallPath);
    });
  }, []);

  const steps = useMemo(
    () => [
      {
        title: 'System Check',
        content: <SystemCheckStep onReadinessChange={setSystemStepReady} />,
        canProceed: systemStepReady
      },
      {
        title: 'Paths & Overrides',
        content: <PathsOverridesStep ac7Path={ac7Path} paths={paths} onPathsChange={setPaths} onAc7Path={setAc7Path} />
      },
      {
        title: 'Software Detection',
        content: <SoftwareDetectStep ac7Path={ac7Path} onAc7Path={setAc7Path} pathOverrides={paths} />
      },
      { title: 'Install Mod', content: <UEVRModStep ac7Path={ac7Path} pathOverrides={paths} /> },
      { title: 'Game Settings', content: <ProfileConfigStep pathOverrides={paths} /> },
      { title: 'Mods Library', content: <ModsLibraryStep ac7Path={ac7Path} pathOverrides={paths} /> },
      { title: 'Launch VR', content: <LaunchStep ac7Path={ac7Path} pathOverrides={paths} /> },
      { title: 'Settings & About', content: <SettingsStep /> }
    ],
    [ac7Path, paths, systemStepReady]
  );

  return (
    <div className="app-shell">
      <header className="top-header">
        <h1>AC7 VR Launcher</h1>
        <p>Quest 3 + Virtual Desktop orchestration wizard</p>
      </header>
      <Wizard steps={steps} />
    </div>
  );
};
