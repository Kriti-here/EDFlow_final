import React from 'react';
import type { ConfidenceBar } from '../../types/aiinsights';

interface ProgressBarProps {
  data: ConfidenceBar;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ data, className = '' }) => {
  return (
    <div className={className}>
      <div className="flex justify-between font-label-sm text-label-sm mb-1">
        <span className="text-on-surface font-semibold">{data.label}</span>
        <span className="font-code-sm text-code-sm text-on-surface font-bold">
          {data.description}
        </span>
      </div>
      <div className="w-full h-2.5 rounded-full bg-surface-container-high overflow-hidden">
        <div
          className={`h-full ${data.color} rounded-full`}
          style={{ width: `${data.percentage}%` }}
        ></div>
      </div>
    </div>
  );
};

export default ProgressBar;
