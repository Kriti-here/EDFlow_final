import Reveal from "../Reveal";
import type { FrictionTone } from "./FrictionCard";
import FrictionCard from "./FrictionCard";
import MaterialIcon from "./MaterialIcon";
import SectionHeading from "./SectionHeading";

const CARDS: {
  icon: string;
  title: string;
  subtitle: string;
  status: string;
  tone: FrictionTone;
}[] = [
  {
    icon: "description",
    title: "Invoice Data Lives Separately",
    subtitle: "Siloed ERP bills & commercial declarations",
    status: "Disconnected",
    tone: "error",
  },
  {
    icon: "account_balance",
    title: "Payment Data Lives Separately",
    subtitle: "SWIFT MT103 Nostro credits in bank portals",
    status: "Isolated",
    tone: "amber",
  },
  {
    icon: "history_edu",
    title: "FIRA Records Live Separately",
    subtitle: "Isolated regulatory bank remittance advices",
    status: "Unlinked",
    tone: "error",
  },
];

/**
 * "What We Discovered" section — the three fragmented systems and the unification note.
 */
function DiscoveredSection() {
  return (
    <section
      id="discovered"
      className="w-full px-margin py-space-xl flex flex-col bg-surface-container-low/70 border-y border-surface-container-high/60"
    >
      <div className="mb-space-md">
        <SectionHeading
          eyebrow="The Friction"
          title="What We Discovered"
          eyebrowClass="text-error"
          showDot
          description="Exporters manually connect these disconnected systems every month."
        />
      </div>

      <div className="relative grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card, index) => (
          <Reveal key={card.title} delay={index * 80}>
            <FrictionCard {...card} />
          </Reveal>
        ))}

        {/* Unification connector bracket — spans the full grid width */}
        <Reveal className="sm:col-span-2 lg:col-span-3" delay={CARDS.length * 80}>
          <div className="mt-1 flex items-center justify-center gap-2 rounded-lg border border-primary/15 bg-primary-fixed/20 px-3 py-2 text-center">
            <MaterialIcon name="sync_alt" className="text-primary text-[16px]" />
            <span className="font-label-sm text-[11px] text-primary font-semibold">
              EDFlow unifies all three into one real-time pipeline
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default DiscoveredSection;
