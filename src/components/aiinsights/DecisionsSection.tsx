import React, { useState } from 'react';
import FilterTabs from './FilterTabs';
import DecisionCard from './DecisionCard';
import type { DecisionRecord, FilterTab } from '../../types/aiinsights';

interface DecisionsSectionProps {
  records: DecisionRecord[];
  tabs: FilterTab[];
  title: string;
  subtitle: string;
  className?: string;
}

export const DecisionsSection: React.FC<DecisionsSectionProps> = ({
  records,
  tabs,
  title,
  subtitle,
  className = '',
}) => {
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const filteredRecords = activeFilter === 'all'
    ? records
    : records.filter((record) => record.status === activeFilter);

  return (
    <div
      className={`p-space-base rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-md ${className}`}
    >
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
            {title}
          </h2>
          <span className="font-code-sm text-code-sm text-on-surface-variant">
            {records.length} Total
          </span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{subtitle}</p>
      </div>

      {/* Filter Tabs */}
      <FilterTabs tabs={tabs} onFilterChange={setActiveFilter} />

      {/* Decision Records List */}
      <div className="flex flex-col gap-space-sm">
        {filteredRecords.map((record) => (
          <DecisionCard key={record.id} decision={record} />
        ))}
      </div>
    </div>
  );
};

export default DecisionsSection;
