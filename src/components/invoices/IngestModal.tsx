import { useEffect, useRef } from "react";
import MaterialIcon from "../landing/MaterialIcon";

type IngestModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onNotify: (message: string) => void;
};

function IngestModal({ isOpen, onClose, onNotify }: IngestModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousFocus = document.activeElement;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    onClose();
    onNotify(
      `${file.name} was selected locally. Invoice processing is not connected.`,
    );
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImportPreview = (systemName: string) => {
    onClose();
    onNotify(`${systemName} import is unavailable in this simulated preview.`);
  };

  return (
    <div
      className="invoice-modal-backdrop fixed inset-0 z-[60] flex items-end justify-center bg-inverse-surface/40 p-0 backdrop-blur-sm sm:items-center sm:p-space-base"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-describedby="ingest-modal-description"
        aria-labelledby="ingest-modal-title"
        aria-modal="true"
        className="invoice-modal-panel flex w-full max-w-lg flex-col gap-space-base rounded-t-2xl bg-surface-container-lowest p-space-base shadow-2xl sm:rounded-2xl"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-space-sm">
          <div className="flex min-w-0 items-center gap-space-xs">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
              <MaterialIcon name="upload_file" className="text-[20px]" />
            </div>
            <div className="min-w-0">
              <h2
                className="font-headline-sm text-headline-sm font-bold text-on-surface"
                id="ingest-modal-title"
              >
                Ingest Commercial Invoice
              </h2>
              <p
                className="font-body-sm text-body-sm text-on-surface-variant"
                id="ingest-modal-description"
              >
                Select a local file or preview an ERP import
              </p>
            </div>
          </div>
          <button
            aria-label="Close dialog"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <MaterialIcon name="close" className="text-[20px]" />
          </button>
        </div>

        <input
          accept=".pdf,.json,.xml"
          className="sr-only"
          onChange={(event) => handleFile(event.currentTarget.files?.[0])}
          ref={fileInputRef}
          type="file"
        />
        <button
          className="flex w-full flex-col items-center justify-center rounded-xl bg-surface-container-low p-space-lg text-center transition-colors hover:bg-surface-container"
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <MaterialIcon
            name="cloud_upload"
            className="mb-1 text-[36px] text-primary"
          />
          <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Click to select export invoice
          </span>
          <span className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
            PDF, JSON, XML · Max 25 MB · Processing not connected
          </span>
        </button>

        <div className="flex flex-col gap-space-xs">
          <span className="font-label-sm text-label-sm font-semibold text-on-surface">
            ERP import preview
          </span>
          <div className="grid grid-cols-1 gap-space-xs sm:grid-cols-2">
            <button
              className="flex min-w-0 items-center gap-space-xs rounded-lg bg-surface-container p-space-sm text-left transition-colors hover:bg-surface-container-high"
              onClick={() => handleImportPreview("NetSuite")}
              type="button"
            >
              <MaterialIcon
                name="database"
                className="text-[20px] text-secondary"
              />
              <span className="flex min-w-0 flex-col">
                <span className="font-label-md text-label-md font-bold text-on-surface">
                  NetSuite
                </span>
                <span className="truncate font-label-sm text-label-sm text-on-surface-variant">
                  Pull Open AR
                </span>
              </span>
            </button>
            <button
              className="flex min-w-0 items-center gap-space-xs rounded-lg bg-surface-container p-space-sm text-left transition-colors hover:bg-surface-container-high"
              onClick={() => handleImportPreview("QuickBooks")}
              type="button"
            >
              <MaterialIcon
                name="account_balance"
                className="text-[20px] text-primary"
              />
              <span className="flex min-w-0 flex-col">
                <span className="font-label-md text-label-md font-bold text-on-surface">
                  QuickBooks
                </span>
                <span className="truncate font-label-sm text-label-sm text-on-surface-variant">
                  Scan Invoices
                </span>
              </span>
            </button>
          </div>
        </div>
        <div className="flex justify-end pt-space-xs">
          <button
            className="rounded-lg px-space-base py-2 font-label-md text-label-md font-semibold text-on-surface-variant hover:bg-surface-container"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

export default IngestModal;
