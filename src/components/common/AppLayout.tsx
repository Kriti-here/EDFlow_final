import React, { type ReactNode } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <Sidebar />
      <main className="flex flex-col relative w-full pt-16 pb-24 bg-surface">
        {children}
      </main>
      <BottomNav />
    </div>
  );
};

export default AppLayout;
