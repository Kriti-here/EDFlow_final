import React, { useState } from 'react';
import type { FilterTab, DecisionStatus } from '../../types/aiinsights';

interface FilterTabsProps {
  tabs: FilterTab[];
  onFilterChange?: (filter: DecisionStatus) => void;
  className?: string;
}

export const FilterTabs: React.FC<FilterTabsProps> = ({
  tabs,
  onFilterChange,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<DecisionStatus>('all');

  const handleTabClick = (tab: FilterTab) => {
    setActiveTab(tab.id);
    if (onFilterChange) {
      onFilterChange(tab.id);
    }
  };

  return (
    <div className={`flex items-center gap-space-xs overflow-x-auto pb-1 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn px-space-sm py-1 rounded-full font-label-sm text-label-sm font-semibold whitespace-nowrap transition-colors ${
            activeTab === tab.id
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
          }`}
          onClick={() => handleTabClick(tab)}
          type="button"
          data-filter={tab.id}
        >
          {tab.label} ({tab.count})
        </button>
      ))}
    </div>
  );
};

export default FilterTabs;
