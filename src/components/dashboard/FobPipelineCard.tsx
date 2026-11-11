import MaterialIcon from "../landing/MaterialIcon";

/** A status slice of the FOB pipeline, used for the bar segment and its legend. */
export type FobSegment = {
  /** Legend label, e.g. "28 Settled". */
  label: string;
  /** Segment width as a percentage (0-100). */
  percent: number;
  /** Background class for the bar segment. */
  barClass: string;
  /** Background class for the legend dot. */
  dotClass: string;
  /** Text class for the legend label. */
  labelClass: string;
};

/** Quick filter chip above the pipeline table. */
export type FobFilter = {
  label: string;
  /** Marks the currently selected chip. */
  active?: boolean;
};

export type FobPipelineCardProps = {
  /** Eyebrow above the total, e.g. "Total FOB Invoiced". */
  eyebrow: string;
  /** Aggregate FOB value, e.g. "$1,482,900". */
  total: string;
  /** Shipment count shown next to the total. */
  shipmentCount: string;
  /** CTA label for the inflow ingestion action. */
  ingestLabel: string;
  /** Settled / in-transit / overdue split. */
  segments: FobSegment[];
  /** Scenario filter chips. */
  filters: FobFilter[];
};

/**
 * Invoices FOB pipeline: aggregate value, settlement split and scenario filters.
 */
function FobPipelineCard({
  eyebrow,
  total,
  shipmentCount,
  ingestLabel,
  segments,
  filters,
}: FobPipelineCardProps) {
  return (
    <div className="flex h-full flex-col gap-space-md rounded-[20px] bg-surface-container-lowest p-space-md transition-all duration-300 shadow-lg card-hover hover:shadow-2xl hover:-translate-y-1">
      <div className="flex items-center justify-between gap-space-sm">
        <div className="flex min-w-0 flex-col">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
            {eyebrow}
          </span>
          <span className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface">
            {total}
            <span className="font-label-md text-label-md font-normal text-on-surface-variant">
              {" / "}
              {shipmentCount}
            </span>
          </span>
        </div>
        <button
          type="button"
          className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-primary px-space-sm font-label-md text-label-md font-semibold text-on-primary shadow-sm transition-all active:scale-95"
        >
          <MaterialIcon name="add_circle" className="text-[18px]" />
          {ingestLabel}
        </button>
      </div>

      <div className="flex flex-col gap-space-xs">
        <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-container">
          {segments.map((segment) => (
            <div
              key={segment.label}
              title={segment.label}
              className={`h-full transition-all ${segment.barClass}`}
              style={{ width: `${segment.percent}%` }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-space-2xs font-label-sm text-label-sm">
          {segments.map((segment) => (
            <div key={segment.label} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${segment.dotClass}`} />
              <span className={segment.labelClass}>{segment.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-space-xs overflow-x-auto pt-space-2xs pb-space-2xs">
        {filters.map((filter) => (
          <button
            key={filter.label}
            type="button"
            className={`shrink-0 rounded-full px-space-sm py-1 font-label-sm text-label-sm ${
              filter.active
                ? "bg-surface-container-high font-semibold text-on-surface"
                : "bg-surface-container text-on-surface-variant transition-colors hover:text-on-surface"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default FobPipelineCard;
