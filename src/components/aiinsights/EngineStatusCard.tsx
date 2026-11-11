import React from 'react';
import type { EngineStatus } from '../../types/aiinsights';

interface EngineStatusCardProps {
  data: EngineStatus;
  className?: string;
}

export const EngineStatusCard: React.FC<EngineStatusCardProps> = ({ data, className = '' }) => {
  return (
    <div
      className={`mt-space-xs p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-xs shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-primary text-[18px]">
            {data.icon}
          </span>
          <span className="font-label-md text-label-md text-on-surface font-semibold">
            {data.title}
          </span>
        </div>
        <span
          className={`px-space-xs py-0.5 rounded-full ${data.uptimeColor} font-label-sm text-label-sm font-semibold flex items-center gap-1`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
          {data.uptime}
        </span>
      </div>
      <p className="font-code-sm text-code-sm text-on-surface-variant">{data.description}</p>
    </div>
  );
};

export default EngineStatusCard;
