import { useCountUp } from "../../hooks/useCountUp";
import MaterialIcon from "../landing/MaterialIcon";

export type MatchingStatusCardProps = {
  /** Auto-reconciliation success rate, e.g. "92.8%". */
  matchRate: string;
  /** Headline label, e.g. "Auto Reconciliation". */
  label: string;
  /** Paired shipment ratio, e.g. "39 / 42". */
  value: string;
  /** Caption under the ratio. */
  caption: string;
  /** Note about the remaining items. */
  pendingNote: string;
};

/** Splits a "39 / 42" style ratio into its two numbers. */
function parseRatio(value: string): [number, number] | null {
  const parts = value.split("/").map((part) => Number(part.trim()));
  if (parts.length === 2 && parts.every((part) => Number.isFinite(part))) {
    return [parts[0], parts[1]];
  }
  return null;
}

/**
 * Matching engine status: how many PayPal inflows were auto-paired to FIRA
 * lines. The paired ratio counts up on load. Priority card — completes the
 * Payment → FIRA → Matching story.
 */
function MatchingStatusCard({
  matchRate,
  label,
  value,
  caption,
  pendingNote,
}: MatchingStatusCardProps) {
  const ratio = parseRatio(value);
  const matched = useCountUp(ratio ? ratio[0] : 0, { durationMs: 1100 });
  const total = useCountUp(ratio ? ratio[1] : 0, { durationMs: 1100 });
  const displayValue = ratio ? `${matched} / ${total}` : value;

  return (
    <div className="flex h-full flex-col justify-between rounded-[20px] bg-surface-container-lowest p-space-md transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1 card-hover">
      <div className="mb-space-xs flex items-center justify-between">
        <MaterialIcon name="sync_alt" className="text-[22px] text-primary" />
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 font-label-sm text-label-sm font-bold text-emerald-800">
          {matchRate}
        </span>
      </div>

      <div>
        <span className="block font-label-sm text-label-sm text-on-surface-variant">{label}</span>
        <div className="mt-0.5 font-headline-md text-headline-md font-bold tracking-tight text-on-surface">
          {displayValue}
        </div>
        <div className="font-label-sm text-label-sm text-on-surface-variant">{caption}</div>
      </div>

      <div className="mt-space-xs flex items-center gap-1 font-label-sm text-label-sm font-medium text-secondary">
        <MaterialIcon name="pending_actions" className="text-[14px]" />
        <span>{pendingNote}</span>
      </div>
    </div>
  );
}

export default MatchingStatusCard;
