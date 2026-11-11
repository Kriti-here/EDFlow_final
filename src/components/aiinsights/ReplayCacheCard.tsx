import React from 'react';
import type { ReplayCache } from '../../types/aiinsights';

interface ReplayCacheCardProps {
  data: ReplayCache;
  className?: string;
}

export const ReplayCacheCard: React.FC<ReplayCacheCardProps> = ({ data, className = '' }) => {
  return (
    <div
      className={`p-space-md rounded-xl bg-primary-container text-on-primary shadow-sm flex flex-col gap-space-xs relative overflow-hidden ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-[20px] text-on-primary">
            {data.icon}
          </span>
          <span className="font-label-md text-label-md font-semibold tracking-wide uppercase">
            {data.title}
          </span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-surface-container-lowest/20 font-code-sm text-code-sm font-bold">
          {data.status}
        </span>
      </div>
      <p className="font-body-sm text-body-sm text-on-primary-container">{data.description}</p>
      <div className="flex items-center gap-2 pt-1 font-code-sm text-code-sm text-on-primary/80 truncate">
        <span className="material-symbols-outlined text-[14px]">lock_reset</span>
        <span className="truncate">
          Merkle Seed: {data.merkleSeed} ({data.blockNumber})
        </span>
      </div>
    </div>
  );
};

export default ReplayCacheCard;
