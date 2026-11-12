import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ErpBanner,
  FilterPills,
  IngestModal,
  InvoiceTable,
  InvoiceToast,
  LedgerMetrics,
  NewInvoiceModal,
} from "../components/invoices";
import type {
  InvoiceFilter,
  InvoiceFilterOption,
  InvoiceRecord,
} from "../components/invoices";
import MaterialIcon from "../components/landing/MaterialIcon";
import { getNavItem } from "../config/navigation";
import { errorMessage } from "../services/api";
import {
  dominantCurrency,
  formatMoney,
  parseMoney,
} from "../services/dashboardService";
import {
  createPayLink,
  fetchInvoices,
  sendInvoice,
  type BackendInvoice,
} from "../services/invoicesService";

const { description } = getNavItem("/invoices");

const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  JPY: "¥",
};

const BUCKET: Record<string, InvoiceRecord["status"]> = {
  PAID: "matched",
  SENT: "pending",
  DRAFT: "draft",
};

/** Collapse a backend status (DRAFT / SENT / PAID) into a UI bucket. */
function bucket(status: string | null): InvoiceRecord["status"] {
  return BUCKET[(status ?? "").toUpperCase()] ?? "draft";
}

function humanDate(iso: string | null): string {
  if (!iso) return "—";
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Indian financial-year quarter of the most recent invoice, e.g. "FY 25-26 Q3". */
function fiscalPeriodOf(dates: string[]): string {
  const parsedDates = dates
    .map((value) => new Date(`${value}T00:00:00`))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  const latest = parsedDates[0] ?? new Date();
  const month = latest.getMonth() + 1;
  const startYear = month >= 4 ? latest.getFullYear() : latest.getFullYear() - 1;
  const quarter = Math.floor((((month - 4) + 12) % 12) / 3) + 1;
  const short = (year: number) => String(year % 100).padStart(2, "0");
  return `FY ${short(startYear)}-${short(startYear + 1)} Q${quarter}`;
}

const STATUS_BADGE = {
  matched: { label: "Paid", tone: "success" as const },
  pending: { label: "Awaiting Payment", tone: "info" as const },
  draft: { label: "Draft", tone: "neutral" as const },
  exception: { label: "Exception", tone: "warning" as const },
};

const STATUS_ACTION = {
  matched: { action: "View Ledger", actionIcon: "receipt_long", actionTone: "link" as const },
  pending: { action: "Payment Link", actionIcon: "link", actionTone: "secondary" as const },
  draft: { action: "Send Invoice", actionIcon: "send", actionTone: "primary" as const },
  exception: { action: "Review", actionIcon: "tune", actionTone: "secondary" as const },
};

/** Map one backend invoice onto the table's presentation record. */
function toRecord(invoice: BackendInvoice): InvoiceRecord {
  const status = bucket(invoice.status);
  const symbol = SYMBOLS[invoice.currency] ?? "";
  return {
    id: invoice.number,
    buyer: invoice.client,
    country: invoice.client_country ?? "—",
    amount: `${symbol}${formatMoney(parseMoney(invoice.amount))}`,
    currency: invoice.currency,
    status,
    badge: STATUS_BADGE[status].label,
    badgeTone: STATUS_BADGE[status].tone,
    searchText: [
      invoice.number,
      invoice.client,
      invoice.contract_ref,
      invoice.purpose_code,
      invoice.service_description,
    ]
      .filter(Boolean)
      .join(" "),
    detail: {
      kind: "record",
      serviceDescription: invoice.service_description,
      purposeCode: invoice.purpose_code,
      purposeVerified: invoice.purpose_code_verified,
      contractRef: invoice.contract_ref,
      issued: humanDate(invoice.issue_date),
      due: humanDate(invoice.due_date),
      edfDue: invoice.edf_due_date ? humanDate(invoice.edf_due_date) : null,
      edfDaysRemaining: invoice.edf_days_remaining,
      paypalInvoiceUrl: invoice.paypal_invoice_url,
    },
    ...STATUS_ACTION[status],
  };
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-space-xs rounded-xl bg-surface-container-lowest p-space-xl shadow-sm">
      <MaterialIcon
        name="progress_activity"
        className="animate-spin text-[28px] text-primary"
      />
      <span className="font-body-sm text-body-sm text-on-surface-variant">
        Loading invoices from the ledger…
      </span>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-space-sm rounded-xl bg-error-container p-space-xl text-center shadow-sm">
      <MaterialIcon name="cloud_off" className="text-[28px] text-error" />
      <p className="max-w-lg font-body-sm text-body-sm text-on-error-container">
        {message}
      </p>
      <button
        className="rounded-lg bg-primary px-space-base py-space-xs font-label-sm text-label-sm font-semibold text-on-primary"
        onClick={onRetry}
        type="button"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-surface-container-lowest p-space-xl text-center shadow-sm">
      <div className="mb-space-sm flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
        <MaterialIcon name="receipt_long" className="text-[28px]" />
      </div>
      <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
        No invoices yet
      </h3>
      <p className="mt-1 max-w-sm font-body-sm text-body-sm text-on-surface-variant">
        Create your first export invoice to start the FIRA → matching → EDF
        workflow, or ingest a commercial invoice from a file.
      </p>
      <button
        className="mt-space-base flex items-center gap-2 rounded-lg bg-primary px-space-base py-space-xs font-label-sm text-label-sm font-semibold text-on-primary"
        onClick={onCreate}
        type="button"
      >
        <MaterialIcon name="add" className="text-[18px]" />
        New Invoice
      </button>
    </div>
  );
}

function InvoicesPage() {
  const [invoices, setInvoices] = useState<BackendInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [ingestOpen, setIngestOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "error">("success");
  const toastTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
      }
    },
    [],
  );

  const notify = useCallback(
    (message: string, tone: "success" | "error" = "success") => {
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
      }
      setToastTone(tone);
      setToastMessage(message);
      toastTimer.current = window.setTimeout(() => {
        setToastMessage(null);
        toastTimer.current = null;
      }, 6000);
    },
    [],
  );

  const dismissToast = useCallback(() => {
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    setToastMessage(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setInvoices(await fetchInvoices());
    } catch (err) {
      setInvoices([]);
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const records = useMemo(() => invoices.map(toRecord), [invoices]);

  const filters: InvoiceFilterOption[] = useMemo(() => {
    const counts: Record<InvoiceFilter, number> = {
      all: invoices.length,
      matched: 0,
      pending: 0,
      draft: 0,
      exception: 0,
    };
    for (const invoice of invoices) counts[bucket(invoice.status)] += 1;
    return [
      { value: "all", label: "All", count: counts.all },
      { value: "draft", label: "Draft", count: counts.draft },
      { value: "pending", label: "Sent", count: counts.pending },
      { value: "matched", label: "Paid", count: counts.matched },
    ];
  }, [invoices]);

  const ledger = useMemo(() => {
    // Open receivables: everything not yet PAID, summed per currency without floats.
    const totals = new Map<string, bigint>();
    for (const invoice of invoices) {
      if (bucket(invoice.status) === "matched") continue;
      const currency = (invoice.currency || "—").toUpperCase();
      totals.set(currency, (totals.get(currency) ?? 0n) + parseMoney(invoice.amount));
    }
    const byCurrency = Object.fromEntries(
      [...totals.entries()].map(([currency, total]) => [currency, formatMoney(total)]),
    );
    const currency = dominantCurrency(byCurrency) ?? "USD";
    return {
      receivables: byCurrency[currency] ?? "0",
      currency,
      settled: invoices.filter((i) => bucket(i.status) === "matched").length,
      awaiting: invoices.filter((i) => bucket(i.status) === "pending").length,
      draft: invoices.filter((i) => bucket(i.status) === "draft").length,
      verifiedPercent:
        invoices.length > 0
          ? Math.round(
              (invoices.filter((i) => i.purpose_code_verified === true).length /
                invoices.length) *
                100,
            )
          : 0,
      period: fiscalPeriodOf(invoices.map((i) => i.issue_date)),
    };
  }, [invoices]);

  const handleRowAction = useCallback(
    async (record: InvoiceRecord) => {
      const target = invoices.find((invoice) => invoice.number === record.id);
      if (!target) return;
      const status = bucket(target.status);
      try {
        if (status === "draft") {
          setBusyRef(record.id);
          const sent = await sendInvoice(target.id);
          notify(`Invoice ${sent.number} sent via PayPal (status ${sent.status}).`);
          await load();
        } else if (status === "pending") {
          setBusyRef(record.id);
          const link = await createPayLink(target.id);
          let copied = false;
          if (link.approve_url) {
            try {
              await navigator.clipboard.writeText(link.approve_url);
              copied = true;
            } catch {
              copied = false;
            }
          }
          notify(
            `PayPal order ${link.order_id} created for ${record.id}. ` +
              (copied ? "Approval link copied to the clipboard." : "No approval link was returned."),
          );
          await load();
        } else {
          notify(
            `${record.id} is marked ${record.badge.toLowerCase()}. The recorded payment is shown in the ledger.`,
          );
        }
      } catch (err) {
        notify(errorMessage(err), "error");
      } finally {
        setBusyRef(null);
      }
    },
    [invoices, load, notify],
  );

  const handleCreated = useCallback(
    (invoice: BackendInvoice) => {
      setCreateOpen(false);
      notify(`Invoice ${invoice.number} created with status ${invoice.status}.`);
      void load();
    },
    [load, notify],
  );

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-space-base">
      <header className="flex flex-wrap items-start justify-between gap-space-sm pb-space-xs">
        <div className="min-w-0">
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight text-on-surface md:text-headline-lg">
            Invoices
          </h1>
          <p className="mt-1 max-w-3xl font-body-md text-body-md text-on-surface-variant">
            {description}
          </p>
        </div>
        <button
          className="flex h-10 shrink-0 items-center gap-space-2xs rounded-lg bg-primary px-space-base font-label-md text-label-md font-semibold text-on-primary shadow-sm transition-all hover:opacity-95 active:scale-[0.98]"
          onClick={() => setCreateOpen(true)}
          type="button"
        >
          <MaterialIcon name="add" className="text-[18px]" />
          New Invoice
        </button>
      </header>

      <InvoiceToast message={toastMessage} tone={toastTone} onDismiss={dismissToast} />

      {busyRef && (
        <p className="flex items-center gap-2 rounded-lg bg-surface-container-low p-space-sm font-body-sm text-body-sm text-on-surface-variant">
          <MaterialIcon name="progress_activity" className="animate-spin text-[18px] text-primary" />
          Contacting PayPal for {busyRef}…
        </p>
      )}

      {loading && <LoadingState />}
      {loadError && <ErrorState message={loadError} onRetry={load} />}

      {!loading && !loadError && (
        <>
          <LedgerMetrics
            receivables={ledger.receivables}
            receivablesCurrency={ledger.currency}
            fiscalPeriod={ledger.period}
            invoiceCount={invoices.length}
            purposeVerifiedPercent={ledger.verifiedPercent}
            settledCount={ledger.settled}
            awaitingCount={ledger.awaiting}
            draftCount={ledger.draft}
          />
          <ErpBanner onNotify={notify} />
          {invoices.length === 0 ? (
            <EmptyState onCreate={() => setCreateOpen(true)} />
          ) : (
            <>
              <FilterPills filters={filters} onSelect={setFilter} selected={filter} />
              <InvoiceTable
                filter={filter}
                invoices={records}
                onClearFilters={() => setFilter("all")}
                onIngest={() => setIngestOpen(true)}
                onNotify={notify}
                onRowAction={handleRowAction}
              />
            </>
          )}
        </>
      )}

      <IngestModal
        isOpen={ingestOpen}
        onClose={() => setIngestOpen(false)}
        onNotify={notify}
      />
      <NewInvoiceModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </section>
  );
}

export default InvoicesPage;
