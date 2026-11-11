export type NavItem = {
  /** Label shown in the sidebar and header. */
  label: string;
  /** Route path owned by the workspace layout. */
  path: string;
  /** Material Symbols glyph name. */
  icon: string;
  /** One-line description used by the page shell. */
  description: string;
};

/**
 * Single source of truth for workspace navigation, shared by the sidebar,
 * header title and the page shells so no route is ever orphaned.
 */
export const WORKSPACE_NAV: NavItem[] = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: "dashboard",
    description: "Month-end close overview for your export receivables.",
  },
  {
    label: "Invoices",
    path: "/invoices",
    icon: "receipt_long",
    description: "Create and send export invoices through PayPal Invoicing.",
  },
  {
    label: "FIRA Documents",
    path: "/fira",
    icon: "description",
    description: "Upload and parse weekly bank FIRA certificates.",
  },
  {
    label: "Matching Center",
    path: "/matching",
    icon: "hub",
    description: "Match FIRA lines to invoices and confirm the results.",
  },
  {
    label: "Exceptions Hub",
    path: "/exceptions",
    icon: "rule",
    description: "Review flagged mismatches and resolve exceptions.",
  },
  {
    label: "Purpose Adviser",
    path: "/purpose",
    icon: "policy",
    description: "Recommend and verify RBI purpose codes.",
  },
  {
    label: "AI Insights",
    path: "/ai-insights",
    icon: "bolt",
    description: "Human-approved AI proposals and suggestions.",
  },
  {
    label: "EDF Packs",
    path: "/edf-packs",
    icon: "inventory_2",
    description: "Generate, validate and export EDF dossiers.",
  },
  {
    label: "Audit Log",
    path: "/audit",
    icon: "verified",
    description: "Hash-chained history of every action in the workspace.",
  },
  {
    label: "User Guide",
    path: "/guide",
    icon: "menu_book",
    description: "How to run the month-end close in EDFlow.",
  },
  {
    label: "Settings",
    path: "/settings",
    icon: "settings",
    description: "Exporter profile, defaults and preferences.",
  },
];

/**
 * Resolve a workspace nav item by its route path.
 * Throws when the path is not registered so page shells never render blank titles.
 */
export function getNavItem(path: string): NavItem {
  const item = WORKSPACE_NAV.find((nav) => nav.path === path);

  if (!item) {
    throw new Error(`Unknown workspace route: ${path}`);
  }

  return item;
}
