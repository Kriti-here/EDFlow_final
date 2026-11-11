type LedgerMetricsProps = {
  receivables: string;
  fiscalPeriod: string;
  invoiceCount: number;
  compliantPercent: number;
  matchedCount: number;
  pendingCount: number;
  attentionCount: number;
};

function LedgerMetrics({
  receivables,
  fiscalPeriod,
  invoiceCount,
  compliantPercent,
  matchedCount,
  pendingCount,
  attentionCount,
}: LedgerMetricsProps) {
  const total = matchedCount + pendingCount + attentionCount;

  return (
    <section
      aria-labelledby="ledger-position-title"
      className="flex w-full flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-base shadow-sm sm:p-space-lg"
    >
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-xs">
          <span
            aria-hidden="true"
            className="h-2 w-2 animate-pulse rounded-full bg-tertiary-container"
          />
          <h2
            id="ledger-position-title"
            className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-on-surface-variant"
          >
            Ledger Position
          </h2>
        </div>
        <div className="flex items-center gap-space-sm">
          <span className="rounded-full bg-primary-fixed px-space-sm py-space-2xs font-label-sm text-label-sm font-bold text-on-primary-fixed-variant">
            SIMULATED DATA
          </span>
          <span className="font-code-sm text-code-sm text-on-surface-variant">
            {fiscalPeriod}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-space-2xs">
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          Total Export Receivables
        </span>
        <div className="flex flex-wrap items-baseline gap-space-xs">
          <span className="font-headline-xl-mobile text-headline-xl-mobile font-bold tracking-tight text-on-surface sm:text-headline-xl">
            {receivables}
          </span>
          <span className="font-code-sm text-code-sm font-semibold text-tertiary-container">
            USD
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-space-xs">
        <div
          aria-label={`${matchedCount} matched, ${pendingCount} pending wire, ${attentionCount} needing attention`}
          className="flex h-2 w-full overflow-hidden rounded-full bg-surface-container-high"
          role="img"
        >
          <span
            className="h-full bg-tertiary-container transition-all duration-500"
            style={{ width: `${(matchedCount / total) * 100}%` }}
            title={`Fully matched (${matchedCount})`}
          />
          <span
            className="h-full bg-secondary-container transition-all duration-500"
            style={{ width: `${(pendingCount / total) * 100}%` }}
            title={`Awaiting wire (${pendingCount})`}
          />
          <span
            className="h-full bg-error transition-all duration-500"
            style={{ width: `${(attentionCount / total) * 100}%` }}
            title={`Attention needed (${attentionCount})`}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-space-sm gap-y-space-2xs pt-space-2xs font-label-sm text-label-sm text-on-surface-variant">
          <span className="font-semibold text-on-surface">
            {invoiceCount} Invoices Recorded
          </span>
          <span className="font-medium text-tertiary-container">
            {compliantPercent}% Compliant Flow
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-space-xs pt-space-xs">
        <MetricPill count={matchedCount} label="Matched" tone="text-tertiary-container" />
        <MetricPill count={pendingCount} label="Pending Wire" tone="text-secondary" />
        <MetricPill count={attentionCount} label="Attention" tone="text-error" />
      </div>
    </section>
  );
}

type MetricPillProps = {
  count: number;
  label: string;
  tone: string;
};

function MetricPill({ count, label, tone }: MetricPillProps) {
  return (
    <div className="flex min-w-0 flex-col items-center rounded-lg bg-surface-container-low p-space-xs text-center">
      <span className={`font-headline-sm text-headline-sm font-bold ${tone}`}>
        {count}
      </span>
      <span className="line-clamp-1 font-label-sm text-label-sm text-on-surface-variant">
        {label}
      </span>
    </div>
  );
}

export default LedgerMetrics;
