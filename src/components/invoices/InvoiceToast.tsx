import MaterialIcon from "../landing/MaterialIcon";

type InvoiceToastProps = {
  message: string | null;
  onDismiss: () => void;
};

function InvoiceToast({ message, onDismiss }: InvoiceToastProps) {
  if (!message) return null;

  return (
    <div
      aria-live="polite"
      className="invoice-toast flex items-center justify-between gap-space-sm rounded-xl bg-primary p-space-sm text-on-primary shadow-lg"
      role="status"
    >
      <div className="flex min-w-0 items-center gap-space-xs">
        <MaterialIcon name="verified" className="text-[18px]" />
        <span className="truncate font-body-sm text-body-sm">{message}</span>
      </div>
      <button
        aria-label="Dismiss notification"
        className="shrink-0 text-on-primary/80 hover:text-on-primary"
        onClick={onDismiss}
        type="button"
      >
        <MaterialIcon name="close" className="text-[16px]" />
      </button>
    </div>
  );
}

export default InvoiceToast;
