type QuickStartStepProps = {
  /** 1-based step number rendered inside the node. */
  index: number;
  /** Step label. */
  label: string;
  /** Highlight the final "Generate EDF Pack" step. */
  isFinal?: boolean;
  /**
   * Layout direction. `vertical` stacks the node beside the label (mobile);
   * `horizontal` centres the node above the label (desktop timeline).
   */
  orientation?: "vertical" | "horizontal";
};

/**
 * A numbered node on the Quick Start flow. Shares the same circle + label
 * styling in both orientations so the visual design stays identical.
 */
function QuickStartStep({
  index,
  label,
  isFinal = false,
  orientation = "vertical",
}: QuickStartStepProps) {
  const circle = (
    <span
      className={`w-6 h-6 rounded-full ${
        isFinal ? "bg-emerald-600 text-white" : "bg-primary text-on-primary"
      } font-mono text-[11px] flex items-center justify-center font-bold ring-4 ring-surface-container-lowest shrink-0 shadow-sm`}
    >
      {index}
    </span>
  );

  const text = (
    <span
      className={`font-label-md text-label-md ${
        isFinal
          ? "text-on-surface font-bold text-emerald-800"
          : "text-on-surface font-semibold"
      }`}
    >
      {label}
    </span>
  );

  if (orientation === "horizontal") {
    return (
      <div className="relative z-10 flex flex-col items-center gap-2 text-center">
        {circle}
        {text}
      </div>
    );
  }

  return (
    <div className="relative z-10 flex items-center gap-3">
      {circle}
      {text}
    </div>
  );
}

export default QuickStartStep;
