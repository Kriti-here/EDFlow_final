import { Link, useLocation } from "react-router-dom";

import { WORKSPACE_NAV } from "../config/navigation";
import { useTheme } from "../hooks/useTheme";
import MaterialIcon from "./landing/MaterialIcon";

type HeaderProps = {
  /** Opens the mobile navigation slide-over. */
  onOpenNav: () => void;
};

/**
 * Workspace top bar: mobile nav trigger, the current module title resolved from
 * the route, the theme switch and a link back to the landing page.
 */
function Header({ onOpenNav }: HeaderProps) {
  const location = useLocation();
  const current = WORKSPACE_NAV.find((item) => item.path === location.pathname);
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <header className="sticky top-0 z-30 border-b border-surface-container-high/70 bg-surface/90 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-space-sm px-margin md:px-margin-md lg:px-margin-lg">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={onOpenNav}
          className="-ml-1.5 flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant transition-all hover:bg-surface-container hover:text-on-surface active:scale-95 lg:hidden"
        >
          <MaterialIcon name="menu" className="text-[22px]" />
        </button>

        <div className="flex min-w-0 flex-col">
          <span className="font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant">
            Workspace
          </span>
          <h1 className="truncate font-headline-sm text-headline-sm font-bold text-on-surface">
            {current?.label ?? "EDFlow"}
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            aria-pressed={isDark}
            title={isDark ? "Switch to light theme" : "Switch to dark theme"}
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant transition-all hover:bg-surface-container hover:text-on-surface active:scale-95"
          >
            <MaterialIcon name={isDark ? "light_mode" : "dark_mode"} className="text-[20px]" />
          </button>

          <Link
            to="/"
            className="hidden items-center gap-1.5 rounded-full border border-surface-container-high bg-surface-container-lowest px-3 py-1.5 font-label-md text-label-md font-semibold text-on-surface-variant transition-all hover:text-on-surface active:scale-95 sm:inline-flex"
          >
            <MaterialIcon name="home" className="text-[16px]" />
            <span>Landing</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export default Header;
