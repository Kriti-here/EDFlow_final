/**
 * Inline error for a single dashboard widget.
 *
 * A section that failed to load shows this in its own slot so the rest of the
 * page (whose requests succeeded) stays visible, instead of one failed request
 * blanking the whole screen.
 */
type WidgetErrorProps = {
  /** Name of the section that failed, e.g. "Match confidence metrics". */
  title: string;
  /** Readable reason from the API layer (see services/api.ts). */
  message: string;
  className?: string;
};

function WidgetError({ title, message, className = '' }: WidgetErrorProps) {
  return (
    <div
      className={`flex items-start gap-space-xs rounded-xl bg-error-container px-space-md py-space-sm text-on-error-container ${className}`}
      role="alert"
    >
      <span className="material-symbols-outlined text-[18px] text-error shrink-0">error</span>
      <div className="min-w-0">
        <p className="font-label-sm text-label-sm font-semibold">{title}</p>
        <p className="font-body-sm text-body-sm break-words">{message}</p>
      </div>
    </div>
  );
}

export default WidgetError;
