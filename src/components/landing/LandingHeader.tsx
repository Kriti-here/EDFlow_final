import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import MaterialIcon from "./MaterialIcon";

const BRANDMARK_SRC =
  "https://lh3.googleusercontent.com/aida/ALJJyrDB9uJEaP73RhyUkcbZBUt_OT5IzdojMPtmF_Q8Xwilr9QGyA5GjNSFdyRjVpatBSN_dC9hhaYl41spxV8YpRaTsxC0X8C6VAAE7oMvCDLPhj-vB1gOBekLco_XJlwR1SHoAeAM7-NABn--WZkW4t47StpWZcWCAuQut6GPTgCACGzaVU60zWwG72-RlHVuTLv2xtR-ewIKcyu-RAFtweLZr1kBYzlE13EMc63bnTYx6g";

type DrawerItem = {
  /** In-page anchor (`#section`) or workspace route (`/guide`). */
  href: string;
  icon: string;
  label: string;
  /** Right-aligned meta shown on the row. */
  right: ReactNode;
};

const DRAWER_ITEMS: DrawerItem[] = [
  {
    href: "#hero",
    icon: "layers",
    label: "Features",
    right: <span className="font-mono text-[11px] text-on-surface-variant">Overview</span>,
  },
  {
    href: "#workflow",
    icon: "account_tree",
    label: "Workflow",
    right: (
      <span className="rounded-full bg-tertiary-fixed px-2 py-0.5 font-bold uppercase text-on-tertiary-fixed text-[10px]">
        Pipeline
      </span>
    ),
  },
  {
    href: "#quick-start",
    icon: "speed",
    label: "Quick Start",
    right: <span className="font-mono text-[11px] text-on-surface-variant">&lt; 10s</span>,
  },
  {
    href: "/guide",
    icon: "menu_book",
    label: "User Guide",
    right: (
      <MaterialIcon name="arrow_outward" className="text-[16px] text-on-surface-variant" />
    ),
  },
];

const ROW_CLASS =
  "flex items-center justify-between px-space-md py-2.5 rounded-lg text-on-surface hover:bg-surface-container font-label-md active:scale-[0.97] transition-all";

/**
 * Fixed top bar with brandmark, quick actions and a state-driven mobile drawer.
 * The mockup's inline `<script>` menu toggle is replaced by React state; every
 * menu row resolves to a real anchor or workspace route.
 */
function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="pt-safe fixed top-0 z-50 w-full border-b border-surface-container-high/70 bg-surface/90 shadow-[0_1px_10px_rgba(15,23,42,0.03)] backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-space-sm px-margin">
        <div className="flex min-w-0 items-center gap-space-sm">
          <button
            aria-expanded={menuOpen}
            aria-label="Toggle Navigation Menu"
            className="-ml-1.5 flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant transition-all hover:bg-surface-container hover:text-on-surface active:scale-95"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MaterialIcon name="menu" className="text-[22px]" />
          </button>
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              alt="EDFlow Brandmark"
              className="h-8 w-8 shrink-0 rounded-lg object-contain shadow-sm ring-1 ring-primary/10"
              src={BRANDMARK_SRC}
            />
            <div className="flex min-w-0 flex-col">
              <span className="font-headline-sm text-headline-sm font-bold leading-none tracking-tight text-on-surface">
                EDFlow
              </span>
              <span className="truncate pt-0.5 font-label-sm text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/90">
                Export Compliance Intelligence
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            aria-label="Toggle Dark or Light Theme"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant transition-all hover:bg-surface-container hover:text-on-surface active:scale-95"
          >
            <MaterialIcon name="dark_mode" className="text-[19px]" />
          </button>
          <Link
            to="/dashboard"
            className="hidden items-center gap-1.5 rounded-full border border-primary-container/20 bg-primary-container/10 px-3 py-1.5 font-label-md text-label-md font-semibold text-primary-container transition-all active:scale-95 sm:inline-flex"
          >
            <span className="text-[13px]">🚀</span>
            <span>Dashboard</span>
          </Link>
          <Link
            to="/settings"
            aria-label="Open Settings"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:bg-primary/20 active:scale-95"
          >
            <MaterialIcon name="person" className="text-[18px]" />
          </Link>
        </div>
      </div>

      {/* Hamburger Drawer / Dropdown Menu */}
      <div
        className={`${
          menuOpen ? "flex" : "hidden"
        } absolute left-0 top-16 z-50 w-full flex-col gap-1 border-b border-surface-container-high bg-surface-container-lowest/98 p-space-md shadow-xl backdrop-blur-2xl transition-all duration-200`}
      >
        {DRAWER_ITEMS.map((item) => {
          const content = (
            <>
              <div className="flex items-center gap-space-sm">
                <MaterialIcon name={item.icon} className="text-[20px] text-primary" />
                <span className="font-semibold">{item.label}</span>
              </div>
              {item.right}
            </>
          );

          return item.href.startsWith("#") ? (
            <a key={item.label} href={item.href} onClick={closeMenu} className={ROW_CLASS}>
              {content}
            </a>
          ) : (
            <Link key={item.label} to={item.href} onClick={closeMenu} className={ROW_CLASS}>
              {content}
            </Link>
          );
        })}
        <div className="mt-1 border-t border-surface-container-high/60 pt-2">
          <Link
            to="/dashboard"
            onClick={closeMenu}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-label-md font-semibold text-on-primary shadow-sm transition-all active:scale-95"
          >
            <span>🚀 Enter Workspace</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export default LandingHeader;
