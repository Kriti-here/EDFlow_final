import type { ReactNode } from "react";
import MaterialIcon from "./MaterialIcon";

export type WorkflowStepData = {
  /** Material Symbols glyph for the icon tile. */
  icon: string;
  /** Card title. */
  title: string;
  /** Muted description line. */
  subtitle: string;
  /** Optional small monospace badge next to the title. */
  badge?: string;
  /** Classes for the badge (colour + weight). */
  badgeClass?: string;
  /** Classes for the icon tile. */
  iconBoxClass: string;
  /** Full card styling (background, border, hover). */
  cardClass: string;
  /** Optional title weight overrides. */
  titleClass?: string;
  /** Optional subtitle colour overrides. */
  subtitleClass?: string;
  /** Right-hand element (status pill or icon). */
  trailing: ReactNode;
};

/** Downward connector drawn between two pipeline stages, with a flowing pulse. */
export function WorkflowConnector() {
  return (
    <div className="relative z-10 -my-1 flex h-4 justify-center">
      <div className="relative h-full w-0.5 overflow-hidden rounded-full bg-primary/15">
        <span className="animate-connector-flow absolute inset-x-0 top-0 h-2 bg-gradient-to-b from-transparent via-primary to-transparent" />
      </div>
      <div className="absolute left-1/2 top-1/2 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-surface-container-lowest text-primary ring-2 ring-primary/20">
        <MaterialIcon name="arrow_downward" className="text-[11px]" />
      </div>
    </div>
  );
}

export type WorkflowNodeData = {
  /** Material Symbols glyph for the icon tile. */
  icon: string;
  /** Node label. */
  title: string;
  /** Muted description line. */
  subtitle: string;
  /** Small monospace badge under the node. */
  badge: string;
  /** Classes for the icon tile (colour). */
  tone: string;
  /** Optional badge colour override. */
  badgeClass?: string;
  /** Emphasise the reconciliation engine node with a soft pulse. */
  highlight?: boolean;
};

/** Rightward connector drawn between two desktop pipeline nodes, with a flowing pulse. */
export function WorkflowConnectorHorizontal() {
  return (
    <div className="relative z-10 flex h-12 min-w-[2rem] flex-1 items-center px-1">
      <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-primary/15">
        <span className="animate-connector-flow-x absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent" />
      </div>
      <div className="absolute left-1/2 top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-surface-container-lowest text-primary ring-2 ring-primary/20">
        <MaterialIcon name="arrow_forward" className="text-[12px]" />
      </div>
    </div>
  );
}

/**
 * Compact node used by the desktop horizontal pipeline stepper. Same visual
 * language as the mobile card (tile + label + badge) but laid out as a column.
 */
export function WorkflowNode({ node }: { node: WorkflowNodeData }) {
  const {
    icon,
    title,
    subtitle,
    badge,
    tone,
    badgeClass = "bg-surface-container text-on-surface-variant",
    highlight = false,
  } = node;

  return (
    <div className="group flex w-32 shrink-0 flex-col items-center text-center">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-105 ${
          highlight ? "animate-node-pulse" : ""
        } ${tone}`}
      >
        <MaterialIcon name={icon} className="text-[22px]" />
      </div>
      <span
        className={`mt-2.5 font-label-md text-[13px] leading-tight ${
          highlight ? "font-bold text-primary" : "font-semibold text-on-surface"
        }`}
      >
        {title}
      </span>
      <span className="mt-1 font-body-sm text-[11px] leading-snug text-on-surface-variant">
        {subtitle}
      </span>
      <span
        className={`mt-1.5 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${badgeClass}`}
      >
        {badge}
      </span>
    </div>
  );
}

/**
 * A single stage card in the Workflow Pipeline diagram.
 */
function WorkflowStep({ step }: { step: WorkflowStepData }) {
  const {
    icon,
    title,
    subtitle,
    badge,
    badgeClass = "bg-surface-container text-on-surface-variant font-medium",
    iconBoxClass,
    cardClass,
    titleClass = "",
    subtitleClass = "text-on-surface-variant",
    trailing,
  } = step;

  return (
    <div
      className={`card-hover flex items-center justify-between rounded-xl p-3.5 ${cardClass}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBoxClass}`}
        >
          <MaterialIcon name={icon} className="text-[19px]" />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`font-label-md text-label-md font-semibold ${titleClass}`}>
              {title}
            </span>
            {badge && (
              <span
                className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${badgeClass}`}
              >
                {badge}
              </span>
            )}
          </div>
          <span className={`font-body-sm text-[12px] truncate ${subtitleClass}`}>
            {subtitle}
          </span>
        </div>
      </div>
      {trailing}
    </div>
  );
}

export default WorkflowStep;
