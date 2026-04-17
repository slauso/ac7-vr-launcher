import React from 'react';

export const StepIndicator: React.FC<{
  total: number;
  current: number;
  titles: string[];
  onSelect: (index: number) => void;
}> = ({ total, current, titles, onSelect }) => {
  return (
    <div className="step-indicator">
      {Array.from({ length: total }).map((_, index) => (
        <button
          key={titles[index]}
          type="button"
          className={`step-pill ${index === current ? 'active' : ''}`}
          onClick={() => onSelect(index)}
        >
          {index + 1}. {titles[index]}
        </button>
      ))}
    </div>
  );
};
