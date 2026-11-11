import type { InvoiceFilter, InvoiceFilterOption } from "./types";

type FilterPillsProps = {
  filters: InvoiceFilterOption[];
  selected: InvoiceFilter;
  onSelect: (filter: InvoiceFilter) => void;
};

function FilterPills({ filters, selected, onSelect }: FilterPillsProps) {
  return (
    <nav aria-label="Filter invoices" className="flex w-full gap-space-xs overflow-x-auto pb-space-2xs">
      {filters.map((filter) => {
        const isSelected = selected === filter.value;

        return (
          <button
            aria-pressed={isSelected}
            className={`whitespace-nowrap rounded-full px-space-md py-1.5 font-label-sm text-label-sm shadow-sm transition-all ${
              isSelected
                ? "bg-primary font-bold text-on-primary"
                : "bg-surface-container-lowest text-on-surface-variant hover:text-on-surface"
            }`}
            key={filter.value}
            onClick={() => onSelect(filter.value)}
            type="button"
          >
            {filter.label} ({filter.count})
          </button>
        );
      })}
    </nav>
  );
}

export default FilterPills;
