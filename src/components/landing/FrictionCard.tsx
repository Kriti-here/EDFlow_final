import MaterialIcon from "./MaterialIcon";

export type FrictionTone = "error" | "amber";

type FrictionCardProps = {
  /** Material Symbols glyph for the card. */
  icon: string;
  /** Primary (bold) label. */
  title: string;
  /** Secondary muted description. */
  subtitle: string;
  /** Short uppercase status word shown on the right. */
  status: string;
  /** Colour family for the card. */
  tone: FrictionTone;
};

const TONE: Record<
  FrictionTone,
  { border: string; iconBox: string; dot: string; status: string }
> = {
  error: {
    border: "border-red-200 hover:border-red-300",
    iconBox: "bg-red-50 text-error border-red-100",
    dot: "bg-error",
    status: "text-error",
  },
  amber: {
    border: "border-amber-200 hover:border-amber-300",
    iconBox: "bg-amber-50 text-amber-700 border-amber-100",
    dot: "bg-amber-500",
    status: "text-amber-700",
  },
};

/**
 * A single "disconnected system" card used in the What We Discovered section.
 */
function FrictionCard({ icon, title, subtitle, status, tone }: FrictionCardProps) {
  const palette = TONE[tone];

  return (
    <div
      className={`card-hover flex items-center justify-between rounded-xl border border-dashed bg-surface-container-lowest p-3.5 shadow-sm ${palette.border}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-9 h-9 rounded-lg ${palette.iconBox} flex items-center justify-center shrink-0 border`}
        >
          <MaterialIcon name={icon} className="text-[19px]" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-label-md text-[13px] text-on-surface font-semibold truncate">
            {title}
          </span>
          <span className="font-body-sm text-[12px] text-on-surface-variant truncate">
            {subtitle}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 pl-2">
        <span className={`w-1.5 h-1.5 rounded-full ${palette.dot}`} />
        <span
          className={`text-[10px] font-mono uppercase ${palette.status} font-semibold hidden xs:inline`}
        >
          {status}
        </span>
      </div>
    </div>
  );
}

export default FrictionCard;
