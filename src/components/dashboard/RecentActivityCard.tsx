import MaterialIcon from "../landing/MaterialIcon";

/** A currency figure paired with its denomination. */
export type MoneyLine = {
  /** Formatted amount, e.g. "$940k". */
  amount: string;
  /** Currency code, e.g. "USD". */
  currency: string;
};

export type RecentActivityCardProps = {
  /** Rail badge, e.g. "Swift GPI". */
  badge: string;
  /** Headline label, e.g. "Nostro Inflow". */
  label: string;
  /** Primary currency received. */
  primary: MoneyLine;
  /** Secondary currency received. */
  secondary: MoneyLine;
  /** Clearing-time footnote. */
  footnote: string;
};

/**
 * Most recent Nostro settlement stream: what landed in the AD-I account and how
 * fast it cleared. The payment leg that opens the EDFlow pipeline.
 */
function RecentActivityCard({
  badge,
  label,
  primary,
  secondary,
  footnote,
}: RecentActivityCardProps) {
  return (
    <div className="flex h-full flex-col justify-between rounded-[20px] bg-surface-container-lowest p-space-md shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 card-hover">
      <div className="mb-space-xs flex items-center justify-between">
        <MaterialIcon name="currency_exchange" className="text-[22px] text-secondary" />
        <span className="font-label-sm text-label-sm font-semibold text-secondary">{badge}</span>
      </div>

      <div>
        <span className="block font-label-sm text-label-sm text-on-surface-variant">{label}</span>
        <div className="mt-0.5 font-headline-sm text-headline-sm font-bold tracking-tight text-on-surface">
          {primary.amount}{" "}
          <span className="font-code-sm text-code-sm font-normal text-on-surface-variant">
            {primary.currency}
          </span>
        </div>
        <div className="font-code-sm text-code-sm font-semibold text-on-surface-variant">
          {secondary.amount}{" "}
          <span className="font-label-sm text-label-sm font-normal text-on-surface-variant">
            {secondary.currency}
          </span>
        </div>
      </div>

      <div className="mt-space-xs flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
        <MaterialIcon name="schedule" className="text-[14px] text-emerald-500" />
        <span>{footnote}</span>
      </div>
    </div>
  );
}

export default RecentActivityCard;
