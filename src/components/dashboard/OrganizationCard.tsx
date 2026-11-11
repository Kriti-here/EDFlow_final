import MaterialIcon from "../landing/MaterialIcon";

/** Live payment-gateway / regulator connectivity badge. */
export type GatewayTelemetry = {
  /** Short source label, e.g. "RBI EDPMS". */
  label: string;
  /** Current status value, e.g. "Connected • 0.4s". */
  value: string;
};

export type OrganizationCardProps = {
  /** Registered exporter name. */
  name: string;
  /** Tooltip for the verified-exporter badge. */
  verifiedTitle: string;
  /** DGFT IEC and AD code line. */
  identifiers: string;
  /** Current reporting period pill. */
  period: string;
  /** Connectivity badges rendered in the telemetry strip. */
  telemetry: GatewayTelemetry[];
};

/**
 * Exporter identity, regulatory identifiers and gateway credential status.
 * Secondary card — sits below the operational priority zone.
 */
function OrganizationCard({
  name,
  verifiedTitle,
  identifiers,
  period,
  telemetry,
}: OrganizationCardProps) {
  return (
    <div className="relative flex h-full flex-col justify-between gap-space-sm overflow-hidden rounded-[20px] bg-surface-container-lowest p-space-md transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 card-hover">
      <div className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 rounded-full bg-primary/5" />

      <div className="relative flex items-start justify-between gap-space-sm">
        <div className="flex min-w-0 items-center gap-space-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-primary">
            <MaterialIcon name="corporate_fare" className="text-[24px]" />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-space-xs">
              <span className="truncate font-headline-sm text-headline-sm text-on-surface">
                {name}
              </span>
              <span title={verifiedTitle} className="shrink-0">
                <MaterialIcon name="verified" className="text-[16px] text-secondary" />
              </span>
            </div>
            <span className="truncate font-code-sm text-code-sm text-on-surface-variant">
              {identifiers}
            </span>
          </div>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-container px-space-sm py-space-2xs font-label-sm text-label-sm text-primary">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          {period}
        </span>
      </div>

      <div className="relative grid grid-cols-2 gap-space-xs pt-space-xs">
        {telemetry.map((badge) => (
          <div
            key={badge.label}
            className="flex min-w-0 items-center gap-space-xs rounded-lg bg-surface-container-low px-space-sm py-space-xs"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            <div className="flex min-w-0 flex-col">
              <span className="font-label-sm text-label-sm leading-none text-on-surface-variant">
                {badge.label}
              </span>
              <span className="truncate font-code-sm text-code-sm font-semibold text-on-surface">
                {badge.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default OrganizationCard;
