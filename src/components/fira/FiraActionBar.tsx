export type FilterTab = {
  label: string;
  count: number;
  active?: boolean;
  variant?: 'default' | 'error' | 'primary';
  icon?: string;
};

export type FiraActionBarProps = {
  tabs: FilterTab[];
  /** Called with the tab label when a tab is clicked. */
  onSelect?: (label: string) => void;
};

function FiraActionBar({ tabs, onSelect }: FiraActionBarProps) {
  return (
    <div className="flex items-center gap-space-xs overflow-x-auto pb-space-2xs -mx-space-base px-space-base">
      {tabs.map((tab) => (
        <button
          key={tab.label}
          aria-pressed={Boolean(tab.active)}
          className={`px-space-md py-space-xs rounded-full shadow-sm shrink-0 font-label-md text-label-md font-semibold transition-all ${
            tab.active
              ? 'bg-primary text-on-primary'
              : tab.variant === 'error'
              ? 'bg-surface-container-lowest text-error hover:opacity-90 flex items-center gap-1'
              : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
          }`}
          onClick={() => onSelect?.(tab.label)}
          type="button"
        >
          {tab.variant === 'error' && !tab.active && (
            <span className="w-1.5 h-1.5 rounded-full bg-error" />
          )}
          {tab.label} ({tab.count})
        </button>
      ))}
    </div>
  );
}

export default FiraActionBar;
