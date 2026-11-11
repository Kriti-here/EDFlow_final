import MaterialIcon from "./MaterialIcon";

const STAGES = [
  {
    icon: "receipt",
    label: "Invoice",
    meta: "#INV-8821",
    tone: "bg-primary-fixed/80 text-primary",
  },
  {
    icon: "account_balance",
    label: "Payment",
    meta: "MT103 Nostro",
    tone: "bg-secondary-fixed/80 text-secondary",
  },
  {
    icon: "verified_user",
    label: "FIRA",
    meta: "Linked",
    tone: "bg-surface-container-highest text-primary",
  },
  {
    icon: "inventory_2",
    label: "EDF Pack",
    meta: "Ready",
    tone: "bg-emerald-100 text-emerald-800",
  },
];

/**
 * Desktop-only hero panel: a compact visualisation of the close pipeline that
 * fills the left column of the hero grid. Hidden below `lg` so the hero stays
 * clean on mobile. The inner card carries a slow idle float.
 */
function HeroWorkflowPanel() {
  return (
    <div
      className="animate-enter-up hidden w-full max-w-xs justify-self-end lg:block"
      style={{ animationDelay: "120ms" }}
    >
      <div className="animate-float-slow flex w-full flex-col gap-space-sm rounded-2xl border border-surface-container-high/80 bg-surface-container-lowest/90 p-space-md shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-surface-container-high/70 pb-2">
          <span className="font-label-sm text-[11px] font-bold uppercase tracking-wider text-primary">
            Close Pipeline
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            live
          </span>
        </div>

        <div className="relative flex flex-col">
          {STAGES.map((stage, index) => (
            <div key={stage.label}>
              <div className="card-hover flex items-center gap-2.5 rounded-xl border border-surface-container-high/70 bg-surface-container-lowest p-2.5">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${stage.tone}`}
                >
                  <MaterialIcon name={stage.icon} className="text-[17px]" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-label-md text-[12px] font-semibold text-on-surface">
                    {stage.label}
                  </span>
                  <span className="truncate font-mono text-[10px] text-on-surface-variant">
                    {stage.meta}
                  </span>
                </span>
                <MaterialIcon
                  name="check"
                  className="ml-auto text-[16px] text-emerald-600"
                />
              </div>

              {index < STAGES.length - 1 && (
                <div className="relative mx-auto h-4 w-0.5 overflow-hidden rounded-full bg-primary/15">
                  <span className="animate-connector-flow absolute inset-x-0 top-0 h-2 bg-gradient-to-b from-transparent via-primary to-transparent" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default HeroWorkflowPanel;
