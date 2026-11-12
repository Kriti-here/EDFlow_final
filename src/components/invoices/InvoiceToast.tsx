import MaterialIcon from "../landing/MaterialIcon";

type InvoiceToastProps = {
  message: string | null;
  /** `error` repaints the toast so failures are not shown as a success. */
  tone?: "success" | "error";
  onDismiss: () => void;
};

function InvoiceToast({ message, tone = "success", onDismiss }: InvoiceToastProps) {
  if (!message) return null;

  const isError = tone === "error";
  const containerClass = isError
    ? "bg-error-container text-on-error-container"
    : "bg-primary text-on-primary";

  return (
    <div
      aria-live="polite"
      className={`invoice-toast flex items-center justify-between gap-space-sm rounded-xl p-space-sm shadow-lg ${containerClass}`}
      role="status"
    >
      <div className="flex min-w-0 items-center gap-space-xs">
        <MaterialIcon
          name={isError ? "error" : "verified"}
          className="text-[18px]"
        />
        <span className="min-w-0 break-words font-body-sm text-body-sm">
          {message}
        </span>
      </div>
      <button
        aria-label="Dismiss notification"
        className={`shrink-0 ${isError ? "text-on-error-container/80 hover:text-on-error-container" : "text-on-primary/80 hover:text-on-primary"}`}
        onClick={onDismiss}
        type="button"
      >
        <MaterialIcon name="close" className="text-[16px]" />
      </button>
    </div>
  );
}

export default InvoiceToast;
