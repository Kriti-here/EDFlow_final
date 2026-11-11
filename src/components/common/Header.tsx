import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="fixed top-0 w-full z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="h-16 px-space-base flex items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <button
            aria-label="Open Workspace Menu"
            className="w-11 h-11 flex items-center justify-center rounded-xl text-on-surface hover:bg-surface-container-high transition-colors"
            onClick={() => {
              const drawer = document.getElementById('nav-drawer');
              if (drawer) {
                drawer.classList.toggle('-translate-x-full');
              }
            }}
            type="button"
          >
            <span className="material-symbols-outlined text-[24px]">menu</span>
          </button>
          <div className="flex items-center gap-space-xs">
            <div className="w-7 h-7 rounded-xl bg-primary-container flex items-center justify-center text-on-primary font-headline-sm text-headline-sm font-bold">
              E
            </div>
            <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight font-bold">
              EDFlow
            </span>
          </div>
        </div>
        <div className="flex items-center gap-space-xs">
          <div className="hidden sm:flex items-center gap-1.5 px-space-sm py-space-xs rounded-full bg-[#ECFDF5] text-[#065F46] font-label-sm text-label-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
            <span>COMPLIANT</span>
          </div>
          <button
            aria-label="Notifications"
            className="w-11 h-11 flex items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined text-[22px]">notifications</span>
          </button>
          <button
            aria-label="Toggle Theme"
            className="w-11 h-11 flex items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high transition-colors"
            onClick={() => document.documentElement.classList.toggle('dark')}
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">contrast</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center ml-space-xs">
            <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
