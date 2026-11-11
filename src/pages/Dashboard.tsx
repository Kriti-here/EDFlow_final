import {
  type AuditActivityCardProps,
  AuditActivityCard,
  type ComplianceHealthCardProps,
  ComplianceHealthCard,
  type EDFReadinessCardProps,
  EDFReadinessCard,
  type FobPipelineCardProps,
  FobPipelineCard,
  type MatchingStatusCardProps,
  MatchingStatusCard,
  type OpenExceptionsCardProps,
  OpenExceptionsCard,
  type OrganizationCardProps,
  OrganizationCard,
  type PayPalSettlementCardProps,
  PayPalSettlementCard,
  type RecentActivityCardProps,
  RecentActivityCard,
} from "../components/dashboard";
import Reveal from "../components/Reveal";

/*
 * Placeholder data for the month-end close overview. Everything below is
 * declared here so the render is purely presentational — these constants are
 * replaced by API responses in a later step.
 */

const ORGANIZATION: OrganizationCardProps = {
  name: "Acme Global Exports Ltd.",
  verifiedTitle: "Verified Exporter",
  identifiers: "DGFT IEC #0482910 • AD-Cat-I #039201",
  period: "Q3 FY24-25",
  telemetry: [
    { label: "RBI EDPMS", value: "Connected • 0.4s" },
    { label: "AD-I Inflow Stream", value: "Live Realtime" },
  ],
};

const COMPLIANCE: ComplianceHealthCardProps = {
  score: "94.8",
  scoreLabel: "Audit Ready",
  deltaLabel: "+3.2% vs Q2",
  metrics: [
    { label: "FIRA Bank Match", value: "98.0%", percent: 98, barClass: "bg-primary" },
    {
      label: "RBI Purpose Code Precision",
      value: "92.0%",
      percent: 92,
      barClass: "bg-tertiary-container",
    },
    {
      label: "Nostro <14d Realisation",
      value: "95.0%",
      percent: 95,
      barClass: "bg-secondary",
    },
  ],
};

const MATCHING: MatchingStatusCardProps = {
  matchRate: "92.8%",
  label: "Auto Reconciliation",
  value: "39 / 42",
  caption: "Paired to e-FIRA",
  pendingNote: "3 pending review",
};

const PAYPAL: PayPalSettlementCardProps = {
  collectionsReceived: 38,
  settlementsProcessed: 34,
  healthPercent: 96,
  healthLabel: "On track for month-end close",
  settledVolume: "$1,284,300",
};

const EDF_READINESS: EDFReadinessCardProps = {
  assembledLabel: "37 / 42 Assembled",
  readinessPercent: 88,
  stages: [
    { count: "37", label: "DGFT Ready", countClass: "text-emerald-500" },
    { count: "3", label: "Drafting", countClass: "text-secondary" },
    { count: "2", label: "Flagged", countClass: "text-error" },
  ],
  dispatchLabel: "Dispatch Ready Batch to ICEGATE (37)",
};

const EXCEPTIONS: OpenExceptionsCardProps = {
  badge: "2 Urgent",
  description:
    "Actionable items delaying Nostro reconciliation before RBI 21-day EDPMS trigger.",
  items: [
    {
      id: "exc-inv-2024-889",
      invoice: "INV-2024-889",
      counterparty: "Citibank NA",
      urgent: true,
      description: [
        { text: "Discrepancy: " },
        { text: "-$35.00", className: "font-semibold text-error" },
        { text: " Swift Wire Intermediary Deduct" },
      ],
      supportNote: "Tolerance auto-policy applicable",
      icon: "help_outline",
      iconClass: "text-secondary",
      actionLabel: "Auto-adjust Fee",
      actionIcon: "done",
      successMessage: "Deduction settled via bank charge ledger.",
    },
    {
      id: "exc-inv-2024-912",
      invoice: "INV-2024-912",
      counterparty: "Standard Chartered",
      urgent: true,
      description: [
        { text: "RBI Purpose Code Conflict: " },
        { text: "P0803", className: "font-code-sm text-code-sm font-semibold" },
        { text: " vs " },
        { text: "P0802", className: "font-code-sm text-code-sm font-semibold text-primary" },
        { text: " (Software R&D)" },
      ],
      supportNote: "AI confidence 97.4% on contract text",
      icon: "psychology",
      iconClass: "text-primary",
      actionLabel: "Accept AI: P0802",
      actionIcon: "auto_awesome",
      successMessage: "Accepted AI Purpose Code P0802.",
    },
  ],
};

const FOB_PIPELINE: FobPipelineCardProps = {
  eyebrow: "Total FOB Invoiced",
  total: "$1,482,900",
  shipmentCount: "42 Shipments",
  ingestLabel: "Ingest Inflow",
  segments: [
    {
      label: "28 Settled",
      percent: 66.6,
      barClass: "bg-emerald-500 rounded-l-full",
      dotClass: "bg-emerald-500",
      labelClass: "text-on-surface-variant",
    },
    {
      label: "11 In Transit",
      percent: 26.2,
      barClass: "bg-secondary",
      dotClass: "bg-secondary",
      labelClass: "text-on-surface-variant",
    },
    {
      label: "3 Overdue",
      percent: 7.2,
      barClass: "bg-error rounded-r-full",
      dotClass: "bg-error",
      labelClass: "text-error font-medium",
    },
  ],
  filters: [
    { label: "All (42)", active: true },
    { label: "LC Backed (29)" },
    { label: "Open Account (13)" },
    { label: "SEZ Units (8)" },
  ],
};

const RECENT_ACTIVITY: RecentActivityCardProps = {
  badge: "Swift GPI",
  label: "Nostro Inflow",
  primary: { amount: "$940k", currency: "USD" },
  secondary: { amount: "€320k", currency: "EUR" },
  footnote: "Avg. 4h 12m clear",
};

const AUDIT: AuditActivityCardProps = {
  blockLabel: "BLOCK #829,104",
  rootHash: "0x7f9a...3e41b7",
  witness: "Witness: HSBC AD-Cat-I Validator",
  verifiedLabel: "Verified",
  detail: "EDF-2024-1189 anchored to EDPMS • Timestamp:",
  timestamp: "14:32:08 UTC",
};

/** Per-card entrance delay so the grid staggers in on load. */
const STAGGER_MS = 60;

/**
 * Month-end close dashboard. Composes the payment → FIRA → matching →
 * compliance → EDF pack story from standalone cards. Compliance Health leads
 * as the full-width hero KPI; every card rises and fades in on load.
 */
function Dashboard() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 lg:px-6 animate-page-enter">
      <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight text-on-surface md:text-headline-lg">
        Dashboard
      </h1>

      {/* Hero KPI Zone */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Compliance Health - Main Hero Card */}
        <Reveal className="lg:col-span-12">
          <ComplianceHealthCard {...COMPLIANCE} />
        </Reveal>

        {/* KPI Row */}
        <Reveal delay={STAGGER_MS} className="lg:col-span-4">
          <MatchingStatusCard {...MATCHING} />
        </Reveal>

        <Reveal delay={STAGGER_MS * 2} className="lg:col-span-4">
          <EDFReadinessCard {...EDF_READINESS} />
        </Reveal>

        <Reveal delay={STAGGER_MS * 3} className="lg:col-span-4">
          <PayPalSettlementCard {...PAYPAL} />
        </Reveal>

        {/* Important Action Area */}
        <Reveal delay={STAGGER_MS * 4} className="lg:col-span-12">
          <OpenExceptionsCard {...EXCEPTIONS} />
        </Reveal>
      </div>

      {/* Operations Area */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Reveal>
          <OrganizationCard {...ORGANIZATION} />
        </Reveal>

        <Reveal delay={STAGGER_MS}>
          <FobPipelineCard {...FOB_PIPELINE} />
        </Reveal>

        <Reveal delay={STAGGER_MS * 2}>
          <RecentActivityCard {...RECENT_ACTIVITY} />
        </Reveal>

        <Reveal delay={STAGGER_MS * 3}>
          <AuditActivityCard {...AUDIT} />
        </Reveal>
      </div>
    </div>
  );
}

export default Dashboard;
