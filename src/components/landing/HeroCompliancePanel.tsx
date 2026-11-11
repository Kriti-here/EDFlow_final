import MaterialIcon from "./MaterialIcon";

const CHECKS = [
  { label: "FIRA reconciled", value: "Weekly", icon: "task_alt" },
  { label: "Purpose code", value: "P0802", icon: "checklist" },
  { label: "Audit chain", value: "Intact", icon: "verified" },
];

/**
 * Desktop-only hero panel: the EDF Ready / compliance status summary that fills
 * the right column of the hero grid. Hidden below `lg` so the hero stays clean
 * on mobile. The inner card floats slowly, phase-offset from the left panel.
 */
function HeroCompliancePanel() {
  return (
    <div
      className="animate-enter-up hidden w-full max-w-xs justify-self-start lg:block"
      style={{ animationDelay: "200ms" }}
    >
      <div
        className="animate-float-slow flex w-full flex-col gap-space-sm rounded-2xl border border-surface-container-high/80 bg-surface-container-lowest/90 p-space-md shadow-sm backdrop-blur-sm"
        style={{ animationDelay: "1.2s" }}
      >
        <div className="flex items-center justify-between">
          <span className="font-label-sm text-[11px] font-bold uppercase tracking-wider text-primary">
            EDF Ready
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700">
            Compliant
          </span>
        </div>

        <div className="flex items-end gap-2">
          <span className="font-headline-lg text-[34px] font-extrabold leading-none text-on-surface">
            98.4%
          </span>
          <span className="pb-1 font-label-sm text-[11px] text-on-surface-variant">
            Reconciliation health
          </span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
          <div className="h-full w-[98.4%] rounded-full bg-gradient-to-r from-primary to-emerald-500" />
        </div>

        <ul className="flex flex-col gap-1.5 pt-1">
          {CHECKS.map((check) => (
            <li
              key={check.label}
              className="flex items-center gap-2 rounded-lg border border-surface-container-high/70 bg-surface-container-low px-2.5 py-1.5"
            >
              <MaterialIcon
                name={check.icon}
                className="text-[16px] text-emerald-600"
              />
              <span className="font-label-md text-[12px] font-medium text-on-surface">
                {check.label}
              </span>
              <span className="ml-auto font-mono text-[10px] font-semibold text-on-surface-variant">
                {check.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default HeroCompliancePanel;
