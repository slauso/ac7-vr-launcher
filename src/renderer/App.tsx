import React, { useMemo, useState } from 'react';
import { Wizard } from './components/Wizard';
import { SystemCheckStep } from './steps/SystemCheckStep';
import { SoftwareDetectStep } from './steps/SoftwareDetectStep';
import { UEVRModStep } from './steps/UEVRModStep';
import { ProfileConfigStep } from './steps/ProfileConfigStep';
import { LaunchStep } from './steps/LaunchStep';
import { SettingsStep } from './steps/SettingsStep';

export const App: React.FC = () => {
  const [ac7Path, setAc7Path] = useState<string | undefined>();
  const [systemStepReady, setSystemStepReady] = useState(false);

  const steps = useMemo(
    () => [
      {
        title: 'System Check',
        content: <SystemCheckStep onReadinessChange={setSystemStepReady} />,
        canProceed: systemStepReady
      },
      { title: 'Software Detection', content: <SoftwareDetectStep ac7Path={ac7Path} onAc7Path={setAc7Path} /> },
      { title: 'Install Mod', content: <UEVRModStep ac7Path={ac7Path} /> },
      { title: 'Game Settings', content: <ProfileConfigStep /> },
      { title: 'Launch VR', content: <LaunchStep ac7Path={ac7Path} /> },
      { title: 'Settings & About', content: <SettingsStep /> }
    ],
    [ac7Path, systemStepReady]
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
