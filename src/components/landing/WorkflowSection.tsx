import { Fragment } from "react";
import Reveal from "../Reveal";
import type { WorkflowNodeData, WorkflowStepData } from "./WorkflowStep";
import WorkflowStep, {
  WorkflowConnector,
  WorkflowConnectorHorizontal,
  WorkflowNode,
} from "./WorkflowStep";
import MaterialIcon from "./MaterialIcon";
import SectionHeading from "./SectionHeading";

const STEPS: WorkflowStepData[] = [
  {
    icon: "receipt",
    title: "Invoice",
    badge: "#INV-8821",
    subtitle: "Commercial bill data extracted",
    iconBoxClass: "bg-primary-fixed/80 text-primary",
    cardClass:
      "bg-surface-container-lowest text-on-surface shadow-sm border border-surface-container-high/80 hover:border-primary/40",
    trailing: (
      <span className="px-2 py-0.5 rounded-md bg-surface-container-high text-primary font-mono text-[11px] font-bold shrink-0">
        USD
      </span>
    ),
  },
  {
    icon: "account_balance",
    title: "Payment",
    badge: "MT103 Nostro",
    subtitle: "Inward swift wire credited",
    iconBoxClass: "bg-secondary-fixed/80 text-secondary",
    cardClass:
      "bg-surface-container-lowest text-on-surface shadow-sm border border-surface-container-high/80 hover:border-secondary/40",
    trailing: (
      <span className="font-label-sm text-[11px] text-secondary font-bold shrink-0 px-2 py-0.5 rounded bg-secondary-fixed/30">
        Cleared
      </span>
    ),
  },
  {
    icon: "verified_user",
    title: "FIRA",
    badge: "e-Signed",
    subtitle: "Bank remittance certificate parsed",
    iconBoxClass: "bg-surface-container-highest text-primary",
    cardClass:
      "bg-surface-container-lowest text-on-surface shadow-sm border border-surface-container-high/80 hover:border-primary/40",
    trailing: (
      <MaterialIcon name="task_alt" className="text-emerald-600 text-[18px] shrink-0" />
    ),
  },
  {
    icon: "hub",
    title: "Matching",
    badge: "99.4% Acc.",
    subtitle: "Tolerance & invoice reconciliation",
    iconBoxClass: "bg-white/15 backdrop-blur-sm text-white",
    cardClass:
      "bg-gradient-to-r from-primary to-primary-container text-on-primary shadow-md ring-1 ring-primary/30",
    titleClass: "font-bold",
    badgeClass: "bg-white/20 text-white font-bold",
    subtitleClass: "text-on-primary-container",
    trailing: <MaterialIcon name="bolt" className="text-white text-[18px]" />,
  },
  {
    icon: "fact_check",
    title: "Purpose Code Review",
    badge: "P0802",
    subtitle: "DGFT & RBI trade classification verified",
    iconBoxClass: "bg-surface-container-high text-primary",
    cardClass:
      "bg-surface-container-lowest text-on-surface shadow-sm border border-surface-container-high/80 hover:border-primary/40",
    badgeClass: "bg-surface-container text-on-surface font-bold",
    trailing: (
      <MaterialIcon name="checklist" className="text-secondary text-[18px]" />
    ),
  },
  {
    icon: "rule",
    title: "Exception Resolution",
    subtitle: "Auto-resolved bank fee gap",
    iconBoxClass: "bg-secondary-fixed/50 text-secondary",
    cardClass:
      "bg-surface-container-lowest text-on-surface shadow-sm border border-surface-container-high/80 hover:border-secondary/40",
    trailing: (
      <span className="px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface font-mono text-[10px] font-semibold shrink-0">
        Auto-Resolved
      </span>
    ),
  },
  {
    icon: "inventory_2",
    title: "EDF Pack",
    badge: "Verified",
    subtitle: "Cryptographic DGFT dossier",
    iconBoxClass: "bg-emerald-100 text-emerald-800",
    cardClass:
      "bg-surface-container-lowest text-on-surface shadow-sm border-l-4 border-indigo-600 border-t border-r border-b border-surface-container-high/80",
    titleClass: "font-bold",
    badgeClass: "bg-emerald-50 text-emerald-700 font-bold border border-emerald-200",
    trailing: <MaterialIcon name="download" className="text-primary text-[20px]" />,
  },
];

const DESKTOP_NODES: WorkflowNodeData[] = [
  {
    icon: "receipt",
    title: "Invoice",
    subtitle: "Commercial bill data extracted",
    badge: "#INV-8821",
    tone: "bg-primary-fixed/80 text-primary",
  },
  {
    icon: "account_balance",
    title: "Payment",
    subtitle: "Inward swift wire credited",
    badge: "MT103 Nostro",
    tone: "bg-secondary-fixed/80 text-secondary",
  },
  {
    icon: "verified_user",
    title: "FIRA",
    subtitle: "Bank remittance certificate parsed",
    badge: "e-Signed",
    tone: "bg-surface-container-highest text-primary",
  },
  {
    icon: "hub",
    title: "Matching",
    subtitle: "Tolerance & invoice reconciliation",
    badge: "99.4% Acc.",
    tone: "bg-gradient-to-br from-primary to-primary-container text-white",
    badgeClass: "bg-primary-fixed/70 text-primary",
    highlight: true,
  },
  {
    icon: "fact_check",
    title: "Purpose Review",
    subtitle: "DGFT & RBI trade classification verified",
    badge: "P0802",
    tone: "bg-surface-container-high text-primary",
  },
  {
    icon: "inventory_2",
    title: "EDF Pack",
    subtitle: "Cryptographic DGFT dossier",
    badge: "Verified",
    tone: "bg-emerald-100 text-emerald-800",
    badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
];

/**
 * Workflow Pipeline section — a vertical stack of stage cards on mobile and a
 * single horizontal, equally-spaced stepper from `lg` so the desktop view uses
 * the available width instead of consuming vertical space.
 */
function WorkflowSection() {
  return (
    <section
      id="workflow"
      className="flex w-full flex-col px-margin pb-space-2xl pt-space-xs lg:pb-space-lg lg:pt-0"
    >
      <div className="mb-space-md flex items-center justify-between">
        <SectionHeading eyebrow="Interactive Architecture" title="Workflow Pipeline" />
        <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-label-sm text-[11px] font-semibold text-emerald-700 shadow-sm">
          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-600" />
          Live Engine
        </span>
      </div>

      {/* Mobile / tablet: vertical pipeline */}
      <div className="relative flex flex-col gap-2 lg:hidden">
        {STEPS.map((step, index) => (
          <Fragment key={step.title}>
            <Reveal delay={index * 60}>
              <WorkflowStep step={step} />
            </Reveal>
            {index < STEPS.length - 1 && <WorkflowConnector />}
          </Fragment>
        ))}
      </div>

      {/* Desktop: horizontal stepper */}
      <Reveal className="hidden lg:block">
        <div className="mx-auto flex w-full max-w-5xl items-start justify-between">
          {DESKTOP_NODES.map((node, index) => (
            <Fragment key={node.title}>
              <WorkflowNode node={node} />
              {index < DESKTOP_NODES.length - 1 && <WorkflowConnectorHorizontal />}
            </Fragment>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

export default WorkflowSection;
