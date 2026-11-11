import { Link, NavLink } from "react-router-dom";

import { WORKSPACE_NAV } from "../config/navigation";
import MaterialIcon from "./landing/MaterialIcon";

type SidebarProps = {
  /** Controls the mobile slide-over. */
  open: boolean;
  /** Closes the mobile slide-over after a navigation. */
  onClose: () => void;
};

/**
 * Workspace sidebar. Fixed slide-over on mobile, persistent column from `lg`.
 * Every entry is a `NavLink` so the active route is always highlighted.
 */
function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {open && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-surface-container-high/80 bg-surface-container-lowest transition-transform duration-300 ease-out ${
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        } lg:sticky lg:top-0 lg:bottom-auto lg:h-screen lg:translate-x-0`}
      >
        <Link
          to="/"
          onClick={onClose}
          className="flex items-center gap-2.5 border-b border-surface-container-high/70 px-margin py-space-md"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary font-headline-sm text-headline-sm font-bold shadow-sm">
            E
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-headline-sm text-headline-sm font-bold tracking-tight text-on-surface">
              EDFlow
            </span>
            <span className="pt-0.5 font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant">
              Export Compliance
            </span>
          </span>
        </Link>

        <nav className="flex-1 overflow-y-auto px-space-sm py-space-md">
          <ul className="flex flex-col gap-1">
            {WORKSPACE_NAV.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-2.5 rounded-lg px-space-sm py-2 font-label-md text-label-md transition-colors duration-200 active:scale-[0.98] ${
                      isActive
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        aria-hidden="true"
                        className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary transition-all duration-200 ease-out ${
                          isActive ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
                        }`}
                      />
                      <MaterialIcon
                        name={item.icon}
                        className={`inline-block text-[19px] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-110 ${
                          isActive ? "text-primary" : ""
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-surface-container-high/70 p-space-sm">
          <Link
            to="/"
            onClick={onClose}
            className="flex items-center gap-2 rounded-lg px-space-sm py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <MaterialIcon name="home" className="text-[18px]" />
            <span>Back to Landing</span>
          </Link>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
