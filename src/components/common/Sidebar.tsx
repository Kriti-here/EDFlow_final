import React from 'react';

interface NavItem {
  path: string;
  icon: string;
  label: string;
}

const navItems: NavItem[] = [
  { path: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { path: 'invoices', icon: 'receipt_long', label: 'Invoices' },
  { path: 'fira-documents', icon: 'description', label: 'FIRA Documents' },
  { path: 'matching-center', icon: 'compare_arrows', label: 'Matching Center' },
  { path: 'exceptions-hub', icon: 'warning', label: 'Exceptions Hub' },
  { path: 'purpose-adviser', icon: 'psychology_alt', label: 'Purpose Adviser' },
  { path: 'ai-insights', icon: 'insights', label: 'AI Insights' },
  { path: 'edf-packs', icon: 'inventory_2', label: 'EDF Packs' },
  { path: 'audit-log', icon: 'history', label: 'Audit Log' },
  { path: 'settings', icon: 'settings', label: 'Settings' },
  { path: 'user-guide', icon: 'menu_book', label: 'User Guide' },
];

const Sidebar: React.FC = () => {
  return (
    <div
      className="fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] bg-surface-container-lowest shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1)] -translate-x-full transition-transform duration-200 ease-in-out flex flex-col pt-safe pb-safe"
      id="nav-drawer"
    >
      <div className="h-16 px-space-base flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <div className="w-6 h-6 rounded-xl bg-primary-container flex items-center justify-center text-on-primary font-headline-sm text-headline-sm font-bold">
            E
          </div>
          <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
            Workspace
          </span>
        </div>
        <button
          aria-label="Close Drawer"
          className="w-11 h-11 flex items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"
          onClick={() => {
            const drawer = document.getElementById('nav-drawer');
            if (drawer) {
              drawer.classList.add('-translate-x-full');
            }
          }}
          type="button"
        >
          <span className="material-symbols-outlined text-[22px]">close</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-space-sm py-space-xs flex flex-col gap-space-2xs">
        {navItems.map((item) => (
          <a
            key={item.path}
            className="flex items-center gap-space-md px-space-base h-11 rounded-xl text-on-surface-variant hover:bg-surface-container font-body-md text-body-md"
            data-path={item.path}
            href={`#${item.path}`}
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            <span>{item.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
