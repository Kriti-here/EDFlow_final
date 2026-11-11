import React from 'react';
import ProgressBar from './ProgressBar';
import type { ConfidenceBar } from '../../types/aiinsights';

interface ConfidenceDistributionProps {
  bars: ConfidenceBar[];
  title: string;
  subtitle: string;
  icon: string;
  className?: string;
}

export const ConfidenceDistribution: React.FC<ConfidenceDistributionProps> = ({
  bars,
  title,
  subtitle,
  icon,
  className = '',
}) => {
  return (
    <div
      className={`p-space-base rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-md ${className}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
            {title}
          </h2>
          <p className="font-code-sm text-code-sm text-on-surface-variant">{subtitle}</p>
        </div>
        <span className={`material-symbols-outlined text-[20px] text-tertiary`}>{icon}</span>
      </div>

      {/* Progress Bars */}
      <div className="flex flex-col gap-space-sm">
        {bars.map((bar) => (
          <ProgressBar key={bar.id} data={bar} />
        ))}
      </div>
    </div>
  );
};

export default ConfidenceDistribution;
