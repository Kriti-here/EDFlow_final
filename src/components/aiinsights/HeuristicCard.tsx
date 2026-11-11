import React from 'react';
import type { HeuristicItem } from '../../types/aiinsights';

interface HeuristicCardProps {
  item: HeuristicItem;
  className?: string;
}

export const HeuristicCard: React.FC<HeuristicCardProps> = ({ item, className = '' }) => {
  return (
    <div className={`p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-xs ${className}`}>
      <div className="flex items-center justify-between">
        <span className="font-body-md text-body-md font-semibold text-on-surface">
          {item.title}
        </span>
        <span
          className={`px-space-xs py-0.5 rounded-full ${item.statusColor} font-label-sm text-label-sm font-semibold`}
        >
          {item.status}
        </span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        {item.description}
      </p>
      <div className="flex items-center justify-between pt-1">
        {item.trace && (
          <span className="font-code-sm text-code-sm text-on-surface-variant">{item.trace}</span>
        )}
        {item.counterparty && (
          <span className="font-code-sm text-code-sm text-primary font-semibold">
            {item.counterparty}
          </span>
        )}
      </div>
    </div>
  );
};

export default HeuristicCard;
