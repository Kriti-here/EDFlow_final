import { useEffect, useRef, useState } from "react";

import MaterialIcon from "../landing/MaterialIcon";

/** One inline fragment of an exception's description line. */
export type ExceptionFragment = {
  text: string;
  /** Extra classes for this fragment (emphasis, colour, code styling). */
  className?: string;
};

/** An actionable mismatch waiting on a human decision. */
export type ExceptionItemData = {
  /** Stable identifier used as the React key. */
  id: string;
  /** Invoice reference, e.g. "INV-2024-889". */
  invoice: string;
  /** Remitting bank. */
  counterparty: string;
  /** Ordered fragments that build the discrepancy line. */
  description: ExceptionFragment[];
  /** Supporting note shown above the action. */
  supportNote: string;
  /** Material Symbols glyph shown top-right. */
  icon: string;
  /** Colour class for the trailing icon. */
  iconClass: string;
  /** Action button label. */
  actionLabel: string;
  /** Material Symbols glyph for the action button. */
  actionIcon: string;
  /** Confirmation copy shown once the item is resolved. */
  successMessage: string;
  /** Marks the row as time-critical; enables the live pulse and hover glow. */
  urgent?: boolean;
};

export type OpenExceptionsCardProps = {
  /** Urgency pill label, e.g. "2 Urgent". */
  badge: string;
  /** Explanatory line under the card title. */
  description: string;
  /** Exception queue, highest priority first. */
  items: ExceptionItemData[];
};

/** Delay before an in-flight resolution settles, matching the original fade. */
const RESOLVE_DELAY_MS = 250;

/**
 * A single exception row. Clicking the action fades the row out, then swaps it
 * for a settled confirmation — the mockup's inline `resolveException` script,
 * expressed as React state.
 */
function ExceptionRow({ item }: { item: ExceptionItemData }) {
  const [pending, setPending] = useState(false);
  const [resolved, setResolved] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const resolve = () => {
    if (pending || resolved) return;
    setPending(true);
    timer.current = window.setTimeout(() => {
      setPending(false);
      setResolved(true);
    }, RESOLVE_DELAY_MS);
  };

  const surfaceClass = resolved ? "bg-emerald-50" : "bg-surface-container-low";
  const motionClass = pending ? "scale-[0.98] opacity-50" : "scale-100 opacity-100";
  // Live pulse and hover glow apply only to unresolved, time-critical items.
  const urgentClass = item.urgent && !resolved ? "exception-urgent" : "";

  return (
    <div
      className={`flex flex-col gap-space-xs rounded-[20px] p-space-sm transition-all hover:shadow-2xl hover:-translate-y-1duration-300 card-hover ${surfaceClass} ${motionClass} ${urgentClass}`} 
      aria-live="polite"
    >
      {resolved ? (
        <div className="flex items-center gap-2 py-1 text-emerald-800">
          <MaterialIcon name="check_circle" className="text-[20px] text-emerald-500" />
          <span className="font-body-sm text-body-sm font-medium">{item.successMessage}</span>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-space-xs">
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-space-xs">
                {item.urgent && (
                  <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-error" />
                  </span>
                )}
                <span className="font-code-sm text-code-sm font-bold text-on-surface">
                  {item.invoice}
                </span>
                <span className="rounded bg-surface-container px-1.5 py-0.5 font-label-sm text-label-sm text-on-surface-variant">
                  {item.counterparty}
                </span>
              </div>
              <span className="mt-0.5 font-body-sm text-body-sm text-on-surface">
                {item.description.map((fragment) => (
                  <span key={fragment.text} className={fragment.className}>
                    {fragment.text}
                  </span>
                ))}
              </span>
            </div>
            <MaterialIcon
              name={item.icon}
              className={`shrink-0 text-[18px] ${item.iconClass}`}
            />
          </div>

          <div className="flex items-center justify-between gap-space-xs pt-space-xs mt-space-2xs">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {item.supportNote}
            </span>
            <button
              type="button"
              onClick={resolve}
              disabled={pending}
              className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-space-sm font-label-sm text-label-sm font-semibold text-on-primary shadow-sm transition-transform active:scale-95 disabled:opacity-70"
            >
              <MaterialIcon name={item.actionIcon} className="text-[16px]" />
              {item.actionLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * High-priority exception queue. Resolutions mutate local view state only —
 * no API calls are made in this build.
 */
function OpenExceptionsCard({ badge, description, items }: OpenExceptionsCardProps) {
  return (
    <div className="flex h-full flex-col gap-space-sm rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <MaterialIcon name="report" className="text-[20px] text-error" />
          <span className="font-headline-sm text-headline-sm text-on-surface">
            Exceptions Action Queue
          </span>
        </div>
        <span className="rounded-full bg-error-container px-space-sm py-0.5 font-label-sm text-label-sm font-bold text-on-error-container">
          {badge}
        </span>
      </div>

      <span className="font-body-sm text-body-sm text-on-surface-variant">{description}</span>

      {items.map((item) => (
        <ExceptionRow key={item.id} item={item} />
      ))}
    </div>
  );
}

export default OpenExceptionsCard;
