import { useEffect, useId, useRef, useState } from "react";
import MaterialIcon from "../landing/MaterialIcon";
import { errorMessage } from "../../services/api";
import { createInvoice, type BackendInvoice, type InvoiceInput } from "../../services/invoicesService";
import { fetchRules, type PurposeCodeRule } from "../../services/rulesService";

// Source of truth: backend/app/services/invoice_service.py ALLOWED_CURRENCIES.
// The backend rejects anything else with a 422, which is surfaced inline.
const CURRENCIES = ["USD", "EUR", "GBP", "AUD", "CAD", "SGD"];

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

type FormState = {
  client_name: string;
  client_email: string;
  client_country: string;
  currency: string;
  amount: string;
  purpose_code: string;
  contract_ref: string;
  service_description: string;
  issue_date: string;
  due_date: string;
};

const EMPTY_FORM: FormState = {
  client_name: "",
  client_email: "",
  client_country: "",
  currency: "USD",
  amount: "",
  purpose_code: "",
  contract_ref: "",
  service_description: "",
  issue_date: "",
  due_date: "",
};

const inputClass =
  "h-10 w-full rounded-lg bg-surface-container-low px-space-sm font-body-sm text-body-sm text-on-surface shadow-sm placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass =
  "font-label-sm text-label-sm font-semibold text-on-surface-variant";

type NewInvoiceModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the backend confirms the new invoice. */
  onCreated: (invoice: BackendInvoice) => void;
};

function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.client_name.trim()) errors.client_name = "Client name is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.client_email.trim()))
    errors.client_email = "A valid client email is required.";
  if (!AMOUNT_PATTERN.test(form.amount.trim()) || Number(form.amount) <= 0)
    errors.amount = "Enter an amount like 1250.00 (max 2 decimals).";
  if (form.due_date && form.issue_date && form.due_date < form.issue_date)
    errors.due_date = "Due date cannot be before the issue date.";
  return errors;
}

/** Create-invoice dialog. Writes to `POST /invoices` — database only, no PayPal call. */
function NewInvoiceModal({ isOpen, onClose, onCreated }: NewInvoiceModalProps) {
  const fieldId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [purposeCodes, setPurposeCodes] = useState<PurposeCodeRule[]>([]);

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

  // Reset the form each time the dialog opens, and load the real purpose codes.
  useEffect(() => {
    if (!isOpen) return;
    setForm(EMPTY_FORM);
    setErrors({});
    setFailure(null);
    setSaving(false);
    let cancelled = false;
    fetchRules()
      .then((rules) => {
        if (!cancelled) setPurposeCodes(rules.purpose_codes);
      })
      .catch(() => {
        if (!cancelled) setPurposeCodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const update = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    const found = validate(form);
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) return;

    const body: InvoiceInput = {
      client_name: form.client_name.trim(),
      client_email: form.client_email.trim(),
      client_country: form.client_country.trim() || null,
      currency: form.currency,
      amount: form.amount.trim(),
      service_description: form.service_description.trim(),
      contract_ref: form.contract_ref.trim() || null,
      purpose_code: form.purpose_code.trim().toUpperCase() || null,
      issue_date: form.issue_date || null,
      due_date: form.due_date || null,
    };

    setSaving(true);
    try {
      const created = await createInvoice(body);
      onCreated(created);
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <span className="font-label-sm text-label-sm text-error">{errors[key]}</span>
    ) : null;

  return (
    <div
      className="invoice-modal-backdrop fixed inset-0 z-[60] flex items-end justify-center bg-inverse-surface/40 p-0 backdrop-blur-sm sm:items-center sm:p-space-base"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-describedby={`${fieldId}-description`}
        aria-labelledby={`${fieldId}-title`}
        aria-modal="true"
        className="invoice-modal-panel flex max-h-[90vh] w-full max-w-2xl flex-col gap-space-base overflow-y-auto rounded-t-2xl bg-surface-container-lowest p-space-base shadow-2xl sm:rounded-2xl"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-space-sm">
          <div className="flex min-w-0 items-center gap-space-xs">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
              <MaterialIcon name="receipt_long" className="text-[20px]" />
            </div>
            <div className="min-w-0">
              <h2
                className="font-headline-sm text-headline-sm font-bold text-on-surface"
                id={`${fieldId}-title`}
              >
                New Export Invoice
              </h2>
              <p
                className="font-body-sm text-body-sm text-on-surface-variant"
                id={`${fieldId}-description`}
              >
                Saved to the ledger as a draft. Sending is a separate action.
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

        {failure && (
          <p className="flex items-center gap-2 rounded-lg bg-error-container px-space-sm py-space-xs font-body-sm text-body-sm text-on-error-container">
            <MaterialIcon name="error" className="text-[18px]" />
            {failure}
          </p>
        )}

        <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Client name *</span>
            <input
              className={inputClass}
              onChange={(e) => update("client_name", e.target.value)}
              placeholder="TechGlobal Corp"
              value={form.client_name}
            />
            {fieldError("client_name")}
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Client email *</span>
            <input
              className={inputClass}
              onChange={(e) => update("client_email", e.target.value)}
              placeholder="payments@client.com"
              type="email"
              value={form.client_email}
            />
            {fieldError("client_email")}
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Client country</span>
            <input
              className={inputClass}
              onChange={(e) => update("client_country", e.target.value)}
              placeholder="United States"
              value={form.client_country}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Currency *</span>
            <select
              className={inputClass}
              onChange={(e) => update("currency", e.target.value)}
              value={form.currency}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Amount *</span>
            <input
              className={inputClass}
              inputMode="decimal"
              onChange={(e) => update("amount", e.target.value)}
              placeholder="42500.00"
              value={form.amount}
            />
            {fieldError("amount")}
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Purpose code</span>
            <input
              className={inputClass}
              list={`${fieldId}-purpose-codes`}
              onChange={(e) => update("purpose_code", e.target.value)}
              placeholder="P0802"
              value={form.purpose_code}
            />
            <datalist id={`${fieldId}-purpose-codes`}>
              {purposeCodes.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.description ?? entry.code}
                  {entry.verified ? "" : " (unverified)"}
                </option>
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Contract reference</span>
            <input
              className={inputClass}
              onChange={(e) => update("contract_ref", e.target.value)}
              placeholder="MSA-2025-04"
              value={form.contract_ref}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Service description</span>
            <input
              className={inputClass}
              onChange={(e) => update("service_description", e.target.value)}
              placeholder="Software consultancy — November sprint"
              value={form.service_description}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Issue date</span>
            <input
              className={inputClass}
              onChange={(e) => update("issue_date", e.target.value)}
              type="date"
              value={form.issue_date}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Due date</span>
            <input
              className={inputClass}
              onChange={(e) => update("due_date", e.target.value)}
              type="date"
              value={form.due_date}
            />
            {fieldError("due_date")}
          </label>
        </div>

        <div className="flex justify-end gap-space-xs pt-space-xs">
          <button
            className="rounded-lg px-space-base py-2 font-label-md text-label-md font-semibold text-on-surface-variant hover:bg-surface-container"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="flex items-center gap-2 rounded-lg bg-primary px-space-base py-2 font-label-md text-label-md font-semibold text-on-primary transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
            onClick={submit}
            type="button"
          >
            {saving && (
              <MaterialIcon name="progress_activity" className="animate-spin text-[18px]" />
            )}
            {saving ? "Saving…" : "Create Invoice"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default NewInvoiceModal;
