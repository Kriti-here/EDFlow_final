import type { FilterPill } from '../../types/exceptions';

interface ExceptionFiltersProps {
  filters: FilterPill[];
  /** Currently selected filter pill category ('all' means no category filter). */
  activeCategory: string;
  onFilterChange: (category: string) => void;
  /** Free-text search, controlled by the page. */
  query: string;
  onQueryChange: (value: string) => void;
  /** Client-side severity filter ('all' means every severity). */
  severity: string;
  onSeverityChange: (value: string) => void;
  /** Client-side buyer filter ('all' means every buyer). */
  client: string;
  onClientChange: (value: string) => void;
  /** Buyer names present on the loaded exceptions. */
  clients: string[];
}

const SEVERITIES = ['critical', 'high', 'medium', 'low'];

/** Small pill-shaped native select, styled to match the filter row. */
function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative flex items-center">
      <select
        aria-label={label}
        className="appearance-none h-[30px] pl-space-sm pr-7 rounded-full text-label-md font-label-md bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="material-symbols-outlined pointer-events-none absolute right-1 text-[16px] text-on-surface-variant">
        arrow_drop_down
      </span>
    </div>
  );
}

function ExceptionFilters({
  filters,
  activeCategory,
  onFilterChange,
  query,
  onQueryChange,
  severity,
  onSeverityChange,
  client,
  onClientChange,
  clients,
}: ExceptionFiltersProps) {
  return (
    <section className="flex flex-col gap-space-sm">
      {/* Search Input */}
      <div className="relative w-full">
        <span className="material-symbols-outlined absolute left-space-md top-1/2 -translate-y-1/2 text-outline text-[20px]">
          search
        </span>
        <input
          className="w-full h-11 pl-11 pr-space-md rounded-xl bg-surface-container-lowest text-on-surface placeholder:text-outline text-body-sm font-body-sm focus:outline-none focus:bg-surface-container-low transition-all shadow-sm"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search exception ID, invoice, buyer, or UTR..."
          type="text"
          value={query}
        />
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-space-xs overflow-x-auto pb-1 no-scrollbar text-nowrap">
        {filters.map((filter) => (
          <button
            key={filter.category}
            onClick={() => onFilterChange(filter.category)}
            aria-pressed={activeCategory === filter.category}
            className={`filter-pill px-space-md py-1.5 rounded-full text-label-md font-label-md ${
              activeCategory === filter.category
                ? 'bg-primary text-on-primary font-semibold shadow-sm transition-all'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container transition-all'
            }`}
            type="button"
          >
            {filter.label} ({filter.count})
          </button>
        ))}

        <div className="h-4 w-px bg-surface-variant mx-1" />

        <FilterSelect
          label="Filter by severity"
          value={severity}
          onChange={onSeverityChange}
          options={[
            { value: 'all', label: 'Severity' },
            ...SEVERITIES.map((value) => ({ value, label: value.toUpperCase() })),
          ]}
        />

        <FilterSelect
          label="Filter by client"
          value={client}
          onChange={onClientChange}
          options={[
            { value: 'all', label: 'Client' },
            ...clients.map((name) => ({ value: name, label: name })),
          ]}
        />
      </div>
    </section>
  );
}

export default ExceptionFilters;
