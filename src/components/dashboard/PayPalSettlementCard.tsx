import { useCountUp } from "../../hooks/useCountUp";
import MaterialIcon from "../landing/MaterialIcon";

export type PayPalSettlementCardProps = {
  /** PayPal collections received this cycle. */
  collectionsReceived: number;
  /** Settlements processed to the linked bank account. */
  settlementsProcessed: number;
  /** Settlement health as a percentage (0-100). */
  healthPercent: number;
  /** Health caption, e.g. "On track for month-end close". */
  healthLabel: string;
  /** Settled volume label, e.g. "$1,284,300". */
  settledVolume: string;
};

/**
 * PayPal settlement status — collections received, settlements processed and
 * overall settlement health. Hackathon highlight: keeps PayPal visible in the
 * first scan of the dashboard. Counters animate up on load.
 */
function PayPalSettlementCard({
  collectionsReceived,
  settlementsProcessed,
  healthPercent,
  healthLabel,
  settledVolume,
}: PayPalSettlementCardProps) {
  const collections = useCountUp(collectionsReceived, { durationMs: 1100 });
  const settlements = useCountUp(settlementsProcessed, { durationMs: 1100 });
  const health = useCountUp(healthPercent, { durationMs: 1100 });

  return (
    <div className="flex h-full flex-col gap-space-sm rounded-[20] bg-surface-container-lowest p-space-md shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 card-hover">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <MaterialIcon name="payments" className="text-[20px] text-primary" />
          <span className="font-headline-sm text-headline-sm text-on-surface">
            PayPal Settlement Status
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-space-sm py-0.5 font-label-sm text-label-sm font-bold text-emerald-800 ">
          <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Live
        </span>
      </div>

      <div className="grid grid-cols-2 gap-space-xs">
        <div className="flex flex-col rounded-lg bg-surface-container-low p-space-xs">
          <span className="font-code-sm text-code-sm font-bold text-on-surface">{collections}</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            Collections Received
          </span>
        </div>
        <div className="flex flex-col rounded-lg bg-surface-container-low p-space-xs">
          <span className="font-code-sm text-code-sm font-bold text-on-surface">{settlements}</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            Settlements Processed
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between font-label-sm text-label-sm">
          <span className="text-on-surface-variant">Settlement Health</span>
          <span className="font-code-sm text-code-sm font-semibold text-emerald-800">{health}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
          <div
            className="bar-fill h-full rounded-full bg-emerald-500"
            style={{ width: `${healthPercent}%` }}
          />
        </div>
        <span className="font-label-sm text-label-sm text-on-surface-variant">{healthLabel}</span>
      </div>

      <div className="mt-auto flex items-center gap-1.5 font-label-sm text-label-sm font-medium text-secondary">
        <MaterialIcon name="account_balance" className="text-[14px]" />
        <span>{settledVolume} settled to bank</span>
      </div>
    </div>
  );
}

export default PayPalSettlementCard;
