import Reveal from "../Reveal";
import MaterialIcon from "./MaterialIcon";
import QuickStartStep from "./QuickStartStep";

const STEPS = [
  "Create Invoice",
  "Upload FIRA",
  "Run Matching",
  "Resolve Exceptions",
  "Generate EDF Pack",
];

/**
 * Quick Start section — a five-node flow showing the EDFlow speed run.
 */
function QuickStartSection() {
  return (
    <section
      id="quick-start"
      className="flex w-full flex-col px-margin py-space-xl lg:py-space-lg"
    >
      <Reveal>
        <div className="card-hover p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm border border-surface-container-high/80 flex flex-col gap-space-sm relative overflow-hidden">
          <div className="flex items-center justify-between pb-space-xs border-b border-surface-container-high/70">
            <div>
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold">
                Speed Run (&lt;10s)
              </span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                Learn EDFlow in Under 2 Minutes
              </h2>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <MaterialIcon name="bolt" className="text-[20px]" />
            </div>
          </div>

          {/* Mobile / tablet: vertical flow with spine connector */}
          <div className="relative flex flex-col gap-3.5 mt-2 pl-2 lg:hidden">
            <div className="absolute left-[19px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-primary via-primary-container to-emerald-500 -z-0" />
            {STEPS.map((label, index) => (
              <Reveal key={label} delay={120 + index * 70}>
                <QuickStartStep
                  index={index + 1}
                  label={label}
                  isFinal={index === STEPS.length - 1}
                />
              </Reveal>
            ))}
          </div>

          {/* Desktop: horizontal 1 → 2 → 3 → 4 → 5 timeline */}
          <div className="relative mt-4 hidden items-start justify-between lg:flex">
            <div className="absolute left-[10%] right-[10%] top-3 h-0.5 bg-gradient-to-r from-primary via-primary-container to-emerald-500 -z-0" />
            {STEPS.map((label, index) => (
              <Reveal key={label} className="flex-1" delay={index * 70}>
                <QuickStartStep
                  index={index + 1}
                  label={label}
                  isFinal={index === STEPS.length - 1}
                  orientation="horizontal"
                />
              </Reveal>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export default QuickStartSection;
