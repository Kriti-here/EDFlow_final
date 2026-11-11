// src/components/common/AppShell.tsx
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface AppShellProps {
  children: ReactNode;
  activePath: string;
}

export default function AppShell({ children, activePath }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased flex flex-col min-h-screen relative">
      {/* Top Header */}
      <header className="fixed top-0 w-full z-50 pt-safe bg-surface/85 backdrop-blur-xl border-b border-surface-container shadow-[0_1px_8px_rgba(0,0,0,0.02)]">
        <div className="h-16 px-space-base flex items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-sm">
            <button 
              onClick={() => setDrawerOpen(true)}
              className="w-11 h-11 flex items-center justify-center rounded-xl text-on-surface hover:bg-surface-container-high transition-colors"
              type="button"
              aria-label="Open Navigation Menu"
            >
              <span className="material-symbols-outlined text-[24px]">menu</span>
            </button>
            <div className="flex items-center gap-space-xs">
              <div className="w-7 h-7 rounded-xl bg-primary-container flex items-center justify-center text-on-primary font-headline-sm font-bold">E</div>
              <span className="font-headline-sm text-on-surface tracking-tight font-bold">EDFlow</span>
            </div>
          </div>
          <div className="flex items-center gap-space-xs">
            <div className="hidden sm:flex items-center gap-1.5 px-space-sm py-space-xs rounded-full bg-[#ECFDF5] text-[#065F46] font-label-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
              <span>COMPLIANT</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-[14px]">
              <span className="material-symbols-outlined text-[18px]">person</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-y-0 left-0 w-72 bg-surface-container-lowest shadow-2xl flex flex-col pt-safe pb-safe" onClick={e => e.stopPropagation()}>
            <div className="h-16 px-space-base flex items-center justify-between border-b border-surface-container">
              <span className="font-headline-sm font-bold text-on-surface">Workspace Menu</span>
              <button onClick={() => setDrawerOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-surface-container">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-space-sm flex flex-col gap-1">
              <Link to="/dashboard" className={`flex items-center gap-space-md px-space-base h-11 rounded-xl transition-colors ${activePath === 'dashboard' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                <span className="material-symbols-outlined">dashboard</span><span>Dashboard</span>
              </Link>
              <Link to="/invoices" className={`flex items-center gap-space-md px-space-base h-11 rounded-xl transition-colors ${activePath === 'invoices' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                <span className="material-symbols-outlined">receipt_long</span><span>Invoices</span>
              </Link>
              <Link to="/fira" className={`flex items-center gap-space-md px-space-base h-11 rounded-xl transition-colors ${activePath === 'fira' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                <span className="material-symbols-outlined">description</span><span>FIRA Documents</span>
              </Link>
              <Link to="/exceptions" className={`flex items-center gap-space-md px-space-base h-11 rounded-xl transition-colors ${activePath === 'exceptions' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                <span className="material-symbols-outlined">warning</span><span>Exceptions Hub</span>
              </Link>
              <Link to="/purpose" className={`flex items-center gap-space-md px-space-base h-11 rounded-xl transition-colors ${activePath === 'purpose' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                <span className="material-symbols-outlined">psychology_alt</span><span>Purpose Adviser</span>
              </Link>
              <Link to="/insights" className={`flex items-center gap-space-md px-space-base h-11 rounded-xl transition-colors ${activePath === 'insights' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                <span className="material-symbols-outlined">insights</span><span>AI Insights</span>
              </Link>
              <Link to="/edf-packs" className={`flex items-center gap-space-md px-space-base h-11 rounded-xl transition-colors ${activePath === 'edf-packs' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                <span className="material-symbols-outlined">inventory_2</span><span>EDF Packs</span>
              </Link>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content View */}
      <main className="flex-1 flex flex-col relative w-full pt-16 pb-24 bg-surface">
        {children}
      </main>
    </div>
  );
}