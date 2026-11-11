import React from 'react';

interface NavItem {
  path: string;
  icon: string;
  label: string;
}

const navItems: NavItem[] = [
  { path: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { path: 'invoices', icon: 'receipt_long', label: 'Invoices' },
  { path: 'matching-center', icon: 'compare_arrows', label: 'Matching' },
  { path: 'exceptions-hub', icon: 'warning', label: 'Exceptions' },
  { path: 'edf-packs', icon: 'inventory_2', label: 'Packs' },
];

const BottomNav: React.FC = () => {
  return (
    <nav className="fixed bottom-0 w-full z-50 pb-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]" data-active-classes="text-primary font-bold">
      <div className="flex justify-around items-center h-16 px-space-xs">
        {navItems.map((item) => (
          <a
            key={item.path}
            className="flex flex-col items-center justify-center min-w-[56px] h-12 text-on-surface-variant hover:text-on-surface transition-colors"
            data-path={item.path}
            href={`#${item.path}`}
          >
            <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
            <span className="font-label-sm text-label-sm">{item.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;
