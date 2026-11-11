import { useCountUp } from "../../hooks/useCountUp";
import MaterialIcon from "../landing/MaterialIcon";

/** One stage of the EDF dossier assembly track. */
export type EdfStage = {
  /** Shipment count for the stage. */
  count: string;
  /** Stage name, e.g. "DGFT Ready". */
  label: string;
  /** Text class used for the count. */
  countClass: string;
};

export type EDFReadinessCardProps = {
  /** Assembled progress label, e.g. "37 / 42 Assembled". */
  assembledLabel: string;
  /** Overall readiness as a percentage (0-100). */
  readinessPercent: number;
  /** Assembly stages rendered as a mini track. */
  stages: EdfStage[];
  /** Label for the batch dispatch action. */
  dispatchLabel: string;
};

/**
 * EDF submission pack readiness and the batch dispatch action. Leads with a
 * counting readiness percentage and an animated completion bar so the final
 * step of the close reads as a headline metric. Priority card.
 */
function EDFReadinessCard({
  assembledLabel,
  readinessPercent,
  stages,
  dispatchLabel,
}: EDFReadinessCardProps) {
  const animatedReadiness = useCountUp(readinessPercent, { durationMs: 1100 });

  return (
    <div className="flex h-full flex-col gap-space-sm rounded-[20px] bg-surface-container-lowest p-space-md transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1 card-hover">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <MaterialIcon name="inventory_2" className="text-[20px] text-primary" />
          <span className="font-headline-sm text-headline-sm text-on-surface">
            EDF Pack Readiness
          </span>
        </div>
        <span className="font-headline-md text-headline-md font-bold leading-none text-primary">
          {animatedReadiness}%
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
          <div
            className="bar-fill h-full rounded-full bg-primary"
            style={{ width: `${readinessPercent}%` }}
          />
        </div>
        <span className="font-label-sm text-label-sm text-on-surface-variant">{assembledLabel}</span>
      </div>

      <div className="grid grid-cols-3 gap-space-xs text-center">
        {stages.map((stage) => (
          <div
            key={stage.label}
            className="flex flex-col items-center rounded-lg bg-surface-container-low p-space-xs"
          >
            <span className={`font-code-sm text-code-sm font-bold ${stage.countClass}`}>
              {stage.count}
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {stage.label}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-lg bg-surface-container py-2 font-label-md text-label-md font-semibold text-primary transition-colors hover:bg-surface-container-high"
      >
        <MaterialIcon name="send" className="text-[18px]" />
        {dispatchLabel}
      </button>
    </div>
  );
}

export default EDFReadinessCard;
