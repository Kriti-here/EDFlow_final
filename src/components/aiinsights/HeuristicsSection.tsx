import React from 'react';
import HeuristicCard from './HeuristicCard';
import type { HeuristicItem } from '../../types/aiinsights';

interface HeuristicsSectionProps {
  items: HeuristicItem[];
  title: string;
  subtitle: string;
  className?: string;
}

export const HeuristicsSection: React.FC<HeuristicsSectionProps> = ({
  items,
  title,
  subtitle,
  className = '',
}) => {
  return (
    <div
      className={`p-space-base rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-md ${className}`}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
          {title}
        </h2>
        <span className="font-code-sm text-code-sm text-primary font-bold">{subtitle}</span>
      </div>
      <div className="flex flex-col gap-space-sm">
        {items.map((item) => (
          <HeuristicCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
};

export default HeuristicsSection;
