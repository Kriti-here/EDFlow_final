import { Link } from "react-router-dom";

import MaterialIcon from "../components/landing/MaterialIcon";
import Reveal from "../components/Reveal";
import { getNavItem } from "../config/navigation";

const { description } = getNavItem("/guide");

type GuideStep = {
  /** Stable key, also used as the anchor id. */
  id: string;
  /** Two-digit ordinal rendered in the step badge. */
  ordinal: string;
  title: string;
  /** Workspace route this step happens on. */
  route: string;
  icon: string;
  /** One-line purpose of the module. */
  summary: string;
  /** What the operator clicks or uploads. */
  youDo: string[];
  /** What the backend actually does with it. */
  edflowDoes: string;
};

/**
 * The month-end close in the order it is actually run: the eight workspace
 * modules plus the remittance ledger, which is surfaced on the Dashboard today.
 * Every step links to a live route so this page can never point at a screen
 * that does not exist.
 */
const STEPS: GuideStep[] = [
  {
    id: "dashboard",
    ordinal: "01",
    title: "Dashboard",
    route: "/dashboard",
    icon: "dashboard",
    summary: "See where the month stands before touching anything.",
    youDo: [
      "Open Dashboard first: it reads invoices, the payment ledger, matches, exceptions and the latest audit entry in one pass.",
      "Check which figures are flagged as simulated before quoting them to anyone — FX markup is labelled when it does not come from PayPal.",
    ],
    edflowDoes:
      "Aggregates the real API responses. It never caches a number it cannot re-derive, and it shows a retry action instead of a stale figure if a call fails.",
  },
  {
    id: "invoices",
    ordinal: "02",
    title: "Invoice Management",
    route: "/invoices",
    icon: "receipt_long",
    summary: "Raise export invoices through PayPal Invoicing v2.",
    youDo: [
      "Create an invoice with the buyer, line items, currency and due date.",
      "Send it once you have checked the details. Sending is the only step that emails the buyer.",
    ],
    edflowDoes:
      "Calls PayPal Invoicing v2 with an idempotency key, then records the invoice locally so a retry cannot duplicate it. Invoice status moves DRAFT → SENT → PAID.",
  },
  {
    id: "fira",
    ordinal: "03",
    title: "FIRA Document Processing",
    route: "/fira",
    icon: "description",
    summary: "Upload the weekly bank FIRA certificate and read it in.",
    youDo: [
      "Download the FIRA PDF from your bank and upload it here.",
      "Open the parsed lines and fix anything the reader could not confirm.",
    ],
    edflowDoes:
      "Extracts the lines from the PDF, then verifies each one against the invoices and ledger. Lines land as verified, needs_review or failed — nothing is assumed correct.",
  },
  {
    id: "matching",
    ordinal: "04",
    title: "Payment Matching & Reconciliation",
    route: "/matching",
    icon: "hub",
    summary: "Tie FIRA lines to the payments that settled them.",
    youDo: [
      "Confirm the suggested matches and re-run matching after adding invoices or syncing payments.",
      "Treat a match with variance as a real difference, not a rounding artefact.",
    ],
    edflowDoes:
      "Matches deterministically on amount, currency, date window and reference. Each result is matched, matched_with_variance, duplicate, exception or needs_review.",
  },
  {
    id: "ledger",
    ordinal: "05",
    title: "Remittance & Transaction Ledger",
    route: "/dashboard",
    icon: "account_balance_wallet",
    summary: "The record of what PayPal actually settled, net of fees.",
    youDo: [
      "Sync payments from the Invoices screen after a buyer pays, then confirm the new rows.",
      "Use the net amount (after PayPal fee) as the value received — gross is shown separately.",
    ],
    edflowDoes:
      "Reads captured payments from PayPal, stores the fee and net amount per transaction and exposes them at GET /ledger. The figures reach the UI through the Dashboard; there is no separate ledger screen yet.",
  },
  {
    id: "exceptions",
    ordinal: "06",
    title: "Exception Management",
    route: "/exceptions",
    icon: "rule",
    summary: "Work the mismatches the engine found, worst first.",
    youDo: [
      "Clear critical exceptions before high ones. Acknowledge what you are still investigating, resolve what you have fixed.",
      "Dismiss only with a reason — a dismissal is recorded against your name in the audit log.",
    ],
    edflowDoes:
      "Derives exceptions from the data and moves them through open → acknowledged → resolved / dismissed. Resolving an exception is an audited event, not a delete.",
  },
  {
    id: "purpose",
    ordinal: "07",
    title: "Purpose Code Adviser",
    route: "/purpose",
    icon: "policy",
    summary: "Pick the RBI purpose code your bank expects on the EDF.",
    youDo: [
      "Run the adviser for a month, then review each proposal and accept or reject it.",
      "Read the source and last-verified date on a rule before relying on it in a filing.",
    ],
    edflowDoes:
      "Scores candidate purpose codes from rules/india_export.yaml via a deterministic engine. When AI is enabled it only proposes; the accept or reject decision is yours and is written to the audit log.",
  },
  {
    id: "edf",
    ordinal: "08",
    title: "EDF Pack Preparation",
    route: "/edf-packs",
    icon: "inventory_2",
    summary: "Assemble the monthly EDF worksheet for your bank or CA.",
    youDo: [
      "Generate the pack for the month, then Re-run checks and fix every blocking failure.",
      "Approve and seal the pack once it is clean, and download JSON, CSV or PDF from the approved pack.",
    ],
    edflowDoes:
      "Builds the worksheet, validates it deterministically, and freezes a SHA-256 snapshot hash on approval. Revoke and regenerate if the source data changes.",
  },
  {
    id: "audit",
    ordinal: "09",
    title: "Audit Log",
    route: "/audit",
    icon: "verified",
    summary: "Prove what was done, in what order, by whom.",
    youDo: [
      "Check the log before you hand a pack to your CA — it is the evidence trail behind every figure.",
    ],
    edflowDoes:
      "Appends hash-chained entries for every state-changing action. Editing history would break the chain, so entries are added, never rewritten.",
  },
];

/** The two guarantees the whole product is built around. */
const LIMITS = [
  {
    icon: "gavel",
    title: "EDFlow never files anything",
    body: "It prepares a worksheet for your bank or CA. It does not submit to a bank, DGFT or the RBI — no filing endpoint exists.",
  },
  {
    icon: "pan_tool",
    title: "EDFlow never moves money on its own",
    body: "Creating, sending, capturing or refunding a payment only happens from an explicit click by you, and every such call is written to the audit log.",
  },
];

/** Prerequisites that must be true before the close produces anything useful. */
const PREREQUISITES = [
  {
    label: "Exporter profile completed",
    detail:
      "Legal name, PAN, GSTIN, AD code and AD bank details. Without these every EDF pack is blocked on exporter identity validation.",
    route: "/settings",
    routeLabel: "Open Settings",
  },
  {
    label: "PayPal sandbox credentials configured",
    detail:
      "Client id and secret are read from the backend environment only, never from the browser. This build talks to the PayPal sandbox.",
    route: "/ai-insights",
    routeLabel: "Check configuration",
  },
  {
    label: "This month's FIRA PDF on hand",
    detail:
      "Download it from your bank's portal. FIRA is the bank's certificate of the inward remittance and is the anchor for matching.",
    route: "/fira",
    routeLabel: "Upload FIRA",
  },
];

/** Lifecycle vocabulary, grouped by the module where the user meets it. */
const STATUSES = [
  {
    module: "Invoice",
    values: "DRAFT · SENT · PAID",
    note: "Set by the PayPal Invoicing lifecycle.",
  },
  {
    module: "FIRA line",
    values: "verified · needs_review · failed",
    note: "A line starts at needs_review until it is confirmed.",
  },
  {
    module: "Match",
    values: "matched · matched_with_variance · duplicate · exception · needs_review",
    note: "matched_with_variance means the amounts genuinely differ.",
  },
  {
    module: "Exception",
    values: "open · acknowledged · resolved · dismissed",
    note: "Resolved and dismissed carry your name into the audit log.",
  },
  {
    module: "Purpose proposal",
    values: "proposed · accepted · rejected · superseded",
    note: "superseded means a newer run replaced it.",
  },
  {
    module: "EDF pack",
    values: "draft · approved (shown as ready) · exported · void (shown as revoked)",
    note: "approved and exported are terminal — revoke before regenerating.",
  },
];

const CARD =
  "rounded-2xl border border-surface-container-high/80 bg-surface-container-lowest p-space-lg shadow-sm";

/**
 * Operator handbook for the month-end close. Static by design: a guide that
 * depends on live data stops being a guide the moment the data is empty. Every
 * route it links to is asserted through the shared navigation config.
 */
function UserGuide() {
  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-space-lg">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight text-on-surface md:text-headline-lg">
          User Guide
        </h1>
        <p className="mt-1 max-w-3xl font-body-md text-body-md text-on-surface-variant">
          {description} Work top to bottom: each module feeds the next, and the
          EDF pack at the end is only as trustworthy as the steps before it.
        </p>
      </div>

      <Reveal className={`${CARD} mb-space-lg`}>
        <p className="font-body-md text-body-md text-on-surface">
          EDFlow is a preparation tool for Indian service exporters paid through
          PayPal. It raises the invoice, records what PayPal actually settled,
          reads the bank&apos;s FIRA certificate, matches the two, flags what does
          not add up, and assembles the monthly EDF worksheet — and then stops
          there.
        </p>
        <div className="mt-space-md grid gap-space-md sm:grid-cols-2">
          {LIMITS.map((limit) => (
            <div
              key={limit.title}
              className="rounded-xl border border-primary-container/20 bg-primary-container/5 p-space-md"
            >
              <div className="flex items-center gap-space-xs">
                <MaterialIcon name={limit.icon} className="text-[20px] text-primary" />
                <h2 className="font-label-md text-label-md font-semibold text-on-surface">
                  {limit.title}
                </h2>
              </div>
              <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                {limit.body}
              </p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal className={`${CARD} mb-space-lg`} delay={40}>
        <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
          Before you start
        </h2>
        <ul className="mt-space-sm flex flex-col gap-space-sm">
          {PREREQUISITES.map((item) => (
            <li key={item.label} className="flex gap-space-sm">
              <MaterialIcon
                name="check_circle"
                className="mt-0.5 shrink-0 text-[18px] text-primary"
              />
              <div className="min-w-0">
                <p className="font-label-md text-label-md font-semibold text-on-surface">
                  {item.label}
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {item.detail}
                </p>
                <Link
                  to={item.route}
                  className="mt-1 inline-flex items-center gap-1 font-label-sm text-label-sm font-semibold text-primary hover:underline"
                >
                  {item.routeLabel}
                  <MaterialIcon name="arrow_forward" className="text-[14px]" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </Reveal>

      <h2 className="mb-space-sm font-headline-sm text-headline-sm font-bold text-on-surface">
        The month-end close, step by step
      </h2>

      <ol className="flex flex-col gap-space-md">
        {STEPS.map((step, index) => (
          <Reveal key={step.id} delay={Math.min(index, 4) * 40}>
            <li id={step.id} className={CARD}>
              <div className="flex flex-wrap items-start gap-space-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-label-md text-label-md font-bold text-primary">
                  {step.ordinal}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-space-xs">
                    <MaterialIcon
                      name={step.icon}
                      className="text-[20px] text-on-surface-variant"
                    />
                    <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                      {step.title}
                    </h3>
                  </div>
                  <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
                    {step.summary}
                  </p>
                </div>
                <Link
                  to={step.route}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-surface-container-high bg-surface-container-low px-3 py-1.5 font-label-sm text-label-sm font-semibold text-on-surface-variant transition-all hover:text-on-surface active:scale-95"
                >
                  Open module
                  <MaterialIcon name="arrow_outward" className="text-[14px]" />
                </Link>
              </div>

              <div className="mt-space-md grid gap-space-md md:grid-cols-2">
                <div>
                  <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                    What you do
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {step.youDo.map((line) => (
                      <li key={line} className="flex gap-2 font-body-sm text-body-sm text-on-surface">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                        <span className="min-w-0">{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl bg-surface-container-low p-space-md">
                  <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                    What EDFlow does
                  </p>
                  <p className="mt-1.5 font-body-sm text-body-sm text-on-surface">
                    {step.edflowDoes}
                  </p>
                </div>
              </div>
            </li>
          </Reveal>
        ))}
      </ol>

      <Reveal className={`${CARD} mt-space-lg`} delay={40}>
        <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
          What the statuses mean
        </h2>
        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
          These are the words you will see across the workspace. They are stored
          by the backend, not invented by the interface.
        </p>
        <div className="mt-space-sm overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-surface-container-high">
                <th className="py-2 pr-space-md font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                  Module
                </th>
                <th className="py-2 pr-space-md font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                  Values
                </th>
                <th className="py-2 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {STATUSES.map((row) => (
                <tr key={row.module} className="border-b border-surface-container-high/60">
                  <td className="py-2 pr-space-md align-top font-label-md text-label-md font-semibold text-on-surface">
                    {row.module}
                  </td>
                  <td className="py-2 pr-space-md align-top font-code-sm text-code-sm text-on-surface">
                    {row.values}
                  </td>
                  <td className="py-2 align-top font-body-sm text-body-sm text-on-surface-variant">
                    {row.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>

      <Reveal className={`${CARD} mt-space-lg`} delay={40}>
        <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
          When something looks wrong
        </h2>
        <ul className="mt-space-sm flex flex-col gap-space-sm">
          <li className="font-body-sm text-body-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">
              A screen shows a connection error rather than data.
            </span>{" "}
            The interface could not reach the backend. Use the Retry action on
            the card; if it still fails, check that the API server is running and
            that the frontend is pointed at it.
          </li>
          <li className="font-body-sm text-body-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">
              An EDF pack will not approve.
            </span>{" "}
            Approval is blocked while any blocking check fails — most often a
            missing exporter profile. Open the pack, read the blocking failures,
            fix them, then Re-run checks.
          </li>
          <li className="font-body-sm text-body-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">
              A number is marked simulated.
            </span>{" "}
            It did not come from PayPal. This happens when PayPal returns no
            conversion detail for the payment, so FX has to be sourced
            elsewhere. Do not treat a simulated figure as a settled amount.
          </li>
          <li className="font-body-sm text-body-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">
              A regulation looks out of date.
            </span>{" "}
            Thresholds, deadlines and purpose codes live in the rules file with
            a source and a last-verified date. Anything still marked unverified
            is shown as unverified in the interface.
          </li>
        </ul>
      </Reveal>
    </section>
  );
}

export default UserGuide;
