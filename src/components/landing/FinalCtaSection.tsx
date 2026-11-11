import { Link } from "react-router-dom";

import Reveal from "../Reveal";

/**
 * Final CTA section — a compact compliance gauge plus the closing call to action.
 */
function FinalCtaSection() {
  return (
    <section
      id="final-cta"
      className="flex w-full flex-col px-margin pb-space-xl lg:pb-space-lg"
    >
      <Reveal>
        {/* Streamlined compliance gauge */}
        <div className="relative mb-space-md flex flex-col gap-2.5 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 p-3.5 text-slate-100 shadow-md">
          <div className="z-10 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span className="font-mono text-[11px] font-semibold uppercase text-emerald-400">
                Compliance Gauge
              </span>
            </div>
            <span className="font-mono text-[10px] text-slate-400">Node: prod-live</span>
          </div>
          <div className="z-10 flex items-end justify-between">
            <div>
              <span className="font-label-sm text-[11px] text-slate-400">
                Reconciliation Health
              </span>
              <div className="font-headline-lg-mobile text-[22px] font-bold leading-tight text-white">
                98.4%
              </div>
            </div>
            <div className="flex flex-col items-end text-right">
              <span className="font-mono text-[11px] font-medium text-emerald-400">
                142 Invoices Cleared
              </span>
              <span className="font-label-sm text-[11px] text-slate-400">
                0 Audit Delays
              </span>
            </div>
          </div>
          <div className="z-10 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
              style={{ width: "98.4%" }}
            />
          </div>
        </div>
      </Reveal>

      <Reveal delay={80}>
        {/* Final CTA card with soft ambient glow */}
        <div className="card-hover relative flex flex-col items-center gap-space-sm overflow-hidden rounded-2xl border border-surface-container-high/80 bg-surface-container-lowest p-space-lg text-center shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/10 blur-2xl" />
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-extrabold tracking-tight text-on-surface">
            Ready to see EDFlow in action?
          </h2>
          <p className="max-w-xs font-body-sm text-body-sm leading-relaxed text-on-surface-variant">
            Experience automated export matching, bank FIRA synchronization, and
            instantaneous EDF dossier filings.
          </p>
          <div className="mt-1 flex w-full max-w-xs flex-col items-stretch gap-2.5 sm:flex-row sm:items-center">
            <Link
              to="/dashboard"
              className="flex items-center justify-center gap-space-xs rounded-xl bg-indigo-600 px-space-lg py-3 text-center font-headline-sm text-headline-sm font-semibold text-on-primary shadow-[0_4px_14px_rgba(79,70,229,0.3)] transition-all hover:bg-indigo-700 active:scale-[0.98]"
            >
              <span>🚀 Enter Workspace</span>
            </Link>
            <Link
              to="/guide"
              className="flex items-center justify-center gap-space-xs rounded-xl border border-surface-container-highest bg-surface-container-low px-space-lg py-3 text-center font-label-md text-label-md font-semibold text-on-surface transition-all hover:bg-surface-container active:scale-[0.98]"
            >
              <span>📖 View User Guide</span>
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export default FinalCtaSection;
