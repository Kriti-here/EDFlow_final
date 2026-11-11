import { NavLink } from "react-router-dom";

import MaterialIcon from "./MaterialIcon";

const NAV_ITEMS = [
  { icon: "token", label: "Story", to: "/" },
  { icon: "dashboard", label: "Workspace", to: "/dashboard" },
  { icon: "policy", label: "Screening", to: "/purpose" },
  { icon: "receipt_long", label: "Invoices", to: "/invoices" },
  { icon: "verified", label: "Audit", to: "/audit" },
];

/**
 * Fixed bottom tab bar for the landing shell. Each tab resolves to a real route.
 */
function LandingBottomNav() {
  return (
    <nav className="pb-safe fixed bottom-0 z-50 w-full border-t border-surface-container-high/70 bg-surface/90 shadow-[0_-1px_10px_rgba(15,23,42,0.03)] backdrop-blur-xl lg:hidden">
      <div className="flex h-16 items-center justify-around px-space-xs">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex h-11 min-w-[56px] flex-col items-center justify-center gap-space-2xs transition-colors active:scale-[0.97] ${
                isActive
                  ? "font-semibold text-primary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <MaterialIcon name={item.icon} className="text-[22px]" />
                <span
                  className={`font-label-sm text-label-sm leading-none ${
                    isActive ? "font-bold" : ""
                  }`}
                >
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default LandingBottomNav;
