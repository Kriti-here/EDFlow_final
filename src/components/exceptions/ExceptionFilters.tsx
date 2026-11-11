import { useState } from 'react';
import type { FilterPill } from '../../types/exceptions';

interface ExceptionFiltersProps {
  filters: FilterPill[];
  onFilterChange: (category: string) => void;
}

function ExceptionFilters({ filters, onFilterChange }: ExceptionFiltersProps) {
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const handleFilterClick = (category: string) => {
    setActiveFilter(category);
    onFilterChange(category);
  };

  return (
    <section className="flex flex-col gap-space-sm">
      {/* Search Input */}
      <div className="relative w-full">
        <span className="material-symbols-outlined absolute left-space-md top-1/2 -translate-y-1/2 text-outline text-[20px]">
          search
        </span>
        <input
          className="w-full h-11 pl-11 pr-space-md rounded-xl bg-surface-container-lowest text-on-surface placeholder:text-outline text-body-sm font-body-sm focus:outline-none focus:bg-surface-container-low transition-all shadow-sm"
          placeholder="Search exception ID, invoice, buyer, or UTR..."
          type="text"
        />
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-space-xs overflow-x-auto pb-1 no-scrollbar text-nowrap">
        {filters.map((filter) => (
          <button
            key={filter.category}
            onClick={() => handleFilterClick(filter.category)}
            className={`filter-pill px-space-md py-1.5 rounded-full text-label-md font-label-md ${
              activeFilter === filter.category
                ? 'bg-primary text-on-primary font-semibold shadow-sm transition-all'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container transition-all'
            }`}
          >
            {filter.label} ({filter.count})
          </button>
        ))}

        <div className="h-4 w-px bg-surface-variant mx-1" />

        <button className="px-space-sm py-1.5 rounded-full text-label-md font-label-md bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container transition-all flex items-center gap-1">
          <span>Severity</span>
          <span className="material-symbols-outlined text-[16px]">arrow_drop_down</span>
        </button>

        <button className="px-space-sm py-1.5 rounded-full text-label-md font-label-md bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container transition-all flex items-center gap-1">
          <span>Client</span>
          <span className="material-symbols-outlined text-[16px]">arrow_drop_down</span>
        </button>
      </div>
    </section>
  );
}

export default ExceptionFilters;
