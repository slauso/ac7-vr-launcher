import React, { useState } from 'react';
import { StepIndicator } from './StepIndicator';

interface WizardStep {
  title: string;
  content: React.ReactNode;
  canProceed?: boolean;
}

export const Wizard: React.FC<{ steps: WizardStep[] }> = ({ steps }) => {
  const [index, setIndex] = useState(0);
  const canProceed = steps[index].canProceed ?? true;

  return (
    <div className="wizard">
      <StepIndicator total={steps.length} current={index} titles={steps.map((s) => s.title)} onSelect={setIndex} />
      <section className="wizard-card">
        <h2>{steps[index].title}</h2>
        {steps[index].content}
      </section>
      <footer className="wizard-nav">
        <button type="button" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>
          Back
        </button>
        <button
          type="button"
          onClick={() => setIndex((value) => Math.min(steps.length - 1, value + 1))}
          disabled={index === steps.length - 1 || !canProceed}
        >
          Next
        </button>
      </footer>
    </div>
  );
};
