import { Link } from "react-router-dom";

import HeroCompliancePanel from "./HeroCompliancePanel";
import HeroPipeline from "./HeroPipeline";
import HeroWorkflowPanel from "./HeroWorkflowPanel";
import MaterialIcon from "./MaterialIcon";

/**
 * Hero section: ambient glow, flowing SVG connection lines, headline and CTAs.
 * From `lg` the hero becomes a three-column grid — workflow visualisation on the
 * left, the centred headline, and the EDF Ready panel on the right — so the
 * desktop view uses the available width without unbalancing the centre.
 */
function HeroSection() {
  return (
    <section
      id="hero"
      className="relative flex w-full flex-col items-center overflow-hidden px-margin pb-space-lg pt-space-xl lg:pb-space-md"
    >
      {/* Soft pulsing linear & radial ambient glow */}
      <div className="animate-ambient-pulse pointer-events-none absolute -top-10 left-1/2 -z-10 h-72 w-80 -translate-x-1/2 rounded-full bg-gradient-to-b from-primary/20 via-primary-container/15 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-28 -z-10 h-48 w-[340px] -translate-x-1/2 rounded-full bg-secondary-container/20 blur-3xl" />

      {/* Flowing SVG connection lines */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center opacity-75">
        <svg
          className="h-full w-full max-w-md"
          fill="none"
          viewBox="0 0 380 430"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="fintechFlow1" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#57dffe" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#006e4b" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          <path
            d="M40 70 C 130 110, 70 210, 190 230 S 290 320, 340 370"
            stroke="url(#fintechFlow1)"
            strokeDasharray="5 5"
            strokeWidth={1.75}
            style={{ animation: "flowPulse 4s linear infinite" }}
          />
          <path
            d="M340 80 C 260 130, 290 220, 190 240 S 110 320, 40 380"
            opacity={0.3}
            stroke="#4f46e5"
            strokeDasharray="4 4"
            strokeWidth={1.25}
          />
          <circle cx="190" cy="235" fill="#4f46e5" opacity={0.08} r={85} />
        </svg>
      </div>

      {/* Floating micro-workflow nodes */}
      <div className="animate-drift-a pointer-events-none absolute left-4 top-24 z-0 hidden items-center gap-1.5 rounded-full border border-primary/20 bg-surface-container-lowest/90 px-2.5 py-1 shadow-sm backdrop-blur-md sm:flex">
        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-500" />
        <span className="font-mono text-[11px] font-medium text-on-surface-variant">
          SWIFT MT103 Nostro Sync
        </span>
      </div>
      <div className="animate-drift-b pointer-events-none absolute right-4 top-36 z-0 hidden items-center gap-1.5 rounded-full border border-primary/20 bg-surface-container-lowest/90 px-2.5 py-1 shadow-sm backdrop-blur-md sm:flex">
        <MaterialIcon name="verified" className="text-[13px] text-primary" />
        <span className="font-mono text-[11px] font-medium text-on-surface-variant">
          EDF Dossier Ready
        </span>
      </div>

      {/* Hero grid: panels flank the centred content from `lg` */}
      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-space-xl lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)_minmax(0,1fr)] lg:items-center lg:gap-space-lg">
        <HeroWorkflowPanel />

        <div className="flex flex-col items-center text-center">
          {/* Category pill badge */}
          <div className="animate-enter-up mb-space-base inline-flex items-center gap-space-xs rounded-full border border-primary-container/20 bg-surface-container-high/90 px-3 py-1 font-label-sm text-[11px] text-primary shadow-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            <span className="font-semibold tracking-wider">
              FINTECH &amp; EXPORT COMPLIANCE
            </span>
          </div>

          {/* Centered headline */}
          <h1
            className="animate-enter-up max-w-md font-headline-xl-mobile text-headline-xl-mobile font-extrabold leading-[1.18] tracking-tight text-on-surface lg:max-w-lg lg:text-headline-xl"
            style={{ animationDelay: "80ms" }}
          >
            Automate Export Compliance.{" "}
            <span className="bg-gradient-to-r from-primary via-primary-container to-indigo-600 bg-clip-text text-transparent">
              From Invoice to EDF Pack.
            </span>
          </h1>

          <p
            className="animate-enter-up mb-space-lg mt-space-sm max-w-sm font-body-md text-body-md leading-relaxed text-on-surface-variant"
            style={{ animationDelay: "160ms" }}
          >
            Connect invoices, payments, FIRA certificates, reconciliation workflows,
            exception management and EDF preparation in one platform.
          </p>

          {/* Buttons (Enter Workspace dominant) */}
          <div
            className="animate-enter-up mb-space-lg flex w-full max-w-xs flex-col items-stretch gap-2.5 sm:flex-row sm:items-center"
            style={{ animationDelay: "240ms" }}
          >
            <Link
              to="/dashboard"
              className="group relative flex items-center justify-center gap-space-xs overflow-hidden rounded-xl bg-indigo-600 px-space-lg py-3 text-center font-headline-sm text-headline-sm font-semibold text-on-primary shadow-[0_4px_16px_rgba(79,70,229,0.32)] transition-all hover:bg-indigo-700 hover:shadow-[0_6px_20px_rgba(79,70,229,0.4)] active:scale-[0.98]"
            >
              <span className="absolute inset-0 h-full w-full -translate-x-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 ease-out group-hover:translate-x-full" />
              <span className="relative flex items-center gap-1.5">
                <span>🚀 Enter Workspace</span>
              </span>
            </Link>
            <a
              href="#quick-start"
              className="flex items-center justify-center gap-space-xs rounded-xl border border-surface-container-highest bg-surface-container-lowest px-space-lg py-3 text-center font-label-md text-label-md font-semibold text-on-surface shadow-sm transition-all hover:bg-surface-container active:scale-[0.98]"
            >
              <span>📖 Quick Start Guide</span>
            </a>
          </div>

          {/* Scroll indicator */}
          <a
            href="#workflow"
            className="animate-enter-up group inline-flex items-center gap-1 pt-space-xs font-label-md text-on-surface-variant transition-colors hover:text-primary"
            style={{ animationDelay: "320ms" }}
          >
            <span className="transition-transform group-hover:translate-y-0.5">
              ↓ See How It Works
            </span>
          </a>
        </div>

        <HeroCompliancePanel />
      </div>

      <HeroPipeline />
    </section>
  );
}

export default HeroSection;
