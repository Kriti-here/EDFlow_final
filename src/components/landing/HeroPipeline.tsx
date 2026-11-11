import { motion, useReducedMotion, type Variants } from "framer-motion";

import MaterialIcon from "./MaterialIcon";

type PipelineStage = {
  /** Material Symbols glyph for the icon tile. */
  icon: string;
  /** Stage label shown in the card. */
  label: string;
  /** Muted monospace line under the label. */
  meta: string;
  /** Icon-tile colour classes (matches the rest of the landing tokens). */
  tone: string;
};

const STAGES: PipelineStage[] = [
  {
    icon: "payments",
    label: "PayPal Payment",
    meta: "Capture + fee",
    tone: "bg-secondary-fixed/80 text-secondary",
  },
  {
    icon: "description",
    label: "FIRA PDF",
    meta: "Weekly AD sheet",
    tone: "bg-surface-container-highest text-primary",
  },
  {
    icon: "rule",
    label: "Matching",
    meta: "Line ↔ invoice",
    tone: "bg-primary-fixed/80 text-primary",
  },
  {
    icon: "inventory_2",
    label: "EDF Pack",
    meta: "Ready to file",
    tone: "bg-emerald-100 text-emerald-800",
  },
];

/**
 * Lightweight hero pipeline: PayPal Payment → FIRA PDF → Matching → EDF Pack.
 *
 * Framer Motion only (no GSAP). Animation is limited to opacity and transform so
 * it stays on the compositor, and the whole thing settles to a static strip when
 * the user prefers reduced motion.
 */
function HeroPipeline() {
  const reduceMotion = useReducedMotion();

  const container: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduceMotion ? 0 : 0.12,
        delayChildren: reduceMotion ? 0 : 0.1,
      },
    },
  };

  const item: Variants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 14 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: reduceMotion ? 0 : 0.45, ease: "easeOut" },
    },
  };

  return (
    <motion.div
      aria-label="EDFlow pipeline: PayPal payment to EDF pack"
      className="mx-auto mt-space-lg w-full max-w-3xl rounded-2xl border border-surface-container-high/80 bg-surface-container-lowest/90 p-space-md shadow-sm backdrop-blur-sm"
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.4 }}
    >
      <div className="mb-space-sm flex items-center justify-between">
        <span className="font-label-sm text-[11px] font-bold uppercase tracking-wider text-primary">
          Close Pipeline
        </span>
        <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          live
        </span>
      </div>

      <ol className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:gap-2">
        {STAGES.map((stage, index) => (
          <li
            key={stage.label}
            className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2"
          >
            <motion.div
              variants={item}
              className="card-hover flex min-w-[6.5rem] flex-1 items-center gap-2 rounded-xl border border-surface-container-high/70 bg-surface-container-lowest p-2 sm:p-2.5"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${stage.tone}`}
              >
                <MaterialIcon name={stage.icon} className="text-[17px]" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-label-md text-[12px] font-semibold text-on-surface">
                  {stage.label}
                </span>
                <span className="truncate font-mono text-[10px] text-on-surface-variant">
                  {stage.meta}
                </span>
              </span>
            </motion.div>

            {index < STAGES.length - 1 && (
              <motion.div
                variants={item}
                className="relative h-0.5 w-6 shrink-0 overflow-hidden rounded-full bg-primary/15 sm:w-8"
              >
                {!reduceMotion && (
                  <motion.span
                    className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent"
                    animate={{ x: ["-100%", "300%"] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.8,
                      ease: "linear",
                      delay: index * 0.35,
                    }}
                  />
                )}
              </motion.div>
            )}
          </li>
        ))}
      </ol>
    </motion.div>
  );
}

export default HeroPipeline;
