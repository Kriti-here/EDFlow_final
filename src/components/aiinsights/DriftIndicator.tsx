import React from 'react';

interface DriftIndicatorProps {
  title: string;
  description: string;
  icon: string;
  className?: string;
}

export const DriftIndicator: React.FC<DriftIndicatorProps> = ({
  title,
  description,
  icon,
  className = '',
}) => {
  return (
    <div
      className={`p-space-sm rounded-lg bg-surface-container-low flex items-center gap-space-sm ${className}`}
    >
      <span className={`material-symbols-outlined text-[20px] text-tertiary`}>{icon}</span>
      <div className="flex-1">
        <p className="font-body-sm text-body-sm text-on-surface font-semibold">{title}</p>
        <p className="font-code-sm text-code-sm text-on-surface-variant">{description}</p>
      </div>
    </div>
  );
};

export default DriftIndicator;
