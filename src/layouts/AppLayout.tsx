import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Header from "../components/Header";
import Sidebar from "../components/Sidebar";

/**
 * Workspace shell: fixed sidebar (slide-over on mobile), sticky header and the
 * routed page content. The routed content is keyed by pathname so the page
 * transition replays on every navigation.
 */
function AppLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen w-full bg-surface text-on-surface font-body-md antialiased">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenNav={() => setNavOpen(true)} />

        <main
          key={location.pathname}
          className="animate-page-enter flex-1 px-margin py-space-lg md:px-margin-md lg:px-margin-lg"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
