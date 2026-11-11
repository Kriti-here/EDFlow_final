import { useMemo, useState } from "react";
import MaterialIcon from "../landing/MaterialIcon";
import type { InvoiceFilter, InvoiceRecord } from "./types";

type InvoiceTableProps = {
  invoices: InvoiceRecord[];
  filter: InvoiceFilter;
  onIngest: () => void;
  onClearFilters: () => void;
  onNotify: (message: string) => void;
};

function InvoiceTable({
  invoices,
  filter,
  onIngest,
  onClearFilters,
  onNotify,
}: InvoiceTableProps) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const visibleInvoices = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return invoices.filter((invoice) => {
      const matchesStatus = filter === "all" || invoice.status === filter;
      const matchesQuery =
        !normalizedQuery ||
        `${invoice.id} ${invoice.buyer} ${invoice.country} ${invoice.searchText}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [filter, invoices, query]);

  const selectedVisibleIds = visibleInvoices
    .filter((invoice) => selectedIds.includes(invoice.id))
    .map((invoice) => invoice.id);
  const allVisibleSelected =
    visibleInvoices.length > 0 &&
    selectedVisibleIds.length === visibleInvoices.length;

  const toggleInvoice = (invoiceId: string) => {
    setSelectedIds((current) =>
      current.includes(invoiceId)
        ? current.filter((id) => id !== invoiceId)
        : [...current, invoiceId],
    );
  };

  const toggleVisibleInvoices = () => {
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleInvoices.some((invoice) => invoice.id === id))
        : [
            ...new Set([
              ...current,
              ...visibleInvoices.map((invoice) => invoice.id),
            ]),
          ],
    );
  };

  const exportVisibleInvoices = () => {
    if (visibleInvoices.length === 0) {
      onNotify("There are no sample invoices to export.");
      return;
    }

    const csvRows = [
      ["Invoice", "Buyer", "Country", "Amount", "Currency", "Status"],
      ...visibleInvoices.map((invoice) => [
        invoice.id,
        invoice.buyer,
        invoice.country,
        invoice.amount,
        invoice.currency,
        invoice.badge,
      ]),
    ];
    const csv = csvRows
      .map((row) =>
        row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const downloadUrl = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "edflow-sample-invoices.csv";
    link.click();
    URL.revokeObjectURL(downloadUrl);
    onNotify(`Exported ${visibleInvoices.length} simulated invoices to CSV.`);
  };

  return (
    <section aria-label="Invoice ledger" className="flex w-full flex-col gap-space-sm">
      <div className="flex w-full items-center gap-space-xs">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search invoices</span>
          <MaterialIcon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant"
          />
          <input
            className="h-10 w-full rounded-lg bg-surface-container-lowest pl-9 pr-3 font-body-sm text-body-sm text-on-surface shadow-sm placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/20"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Invoice #, buyer, or ref..."
            type="search"
            value={query}
          />
        </label>
        <button
          className="flex h-10 shrink-0 items-center gap-space-2xs rounded-lg bg-primary px-space-base font-label-md text-label-md font-semibold text-on-primary shadow-sm transition-all hover:opacity-95 active:scale-[0.98]"
          onClick={onIngest}
          type="button"
        >
          <MaterialIcon name="add" className="text-[18px]" />
          <span>Ingest</span>
        </button>
      </div>

      <div className="flex items-center justify-between gap-space-sm px-space-2xs pt-space-2xs">
        <div className="flex min-w-0 items-center gap-space-xs">
          <label className="flex cursor-pointer select-none items-center gap-2">
            <input
              checked={allVisibleSelected}
              className="h-4 w-4 rounded accent-primary"
              onChange={toggleVisibleInvoices}
              type="checkbox"
            />
            <span className="whitespace-nowrap font-label-sm text-label-sm text-on-surface-variant">
              Select all
            </span>
          </label>
          {selectedIds.length > 0 && (
            <span className="rounded bg-primary-fixed px-1.5 py-0.5 font-code-sm text-code-sm font-bold text-primary">
              {selectedIds.length} selected
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-space-xs">
          {selectedIds.length > 0 && (
            <button
              className="rounded-lg bg-surface-container-high px-space-sm py-1 font-label-sm text-label-sm text-on-surface transition-colors hover:bg-surface-container-highest"
              onClick={() =>
                onNotify(
                  "Batch settlement is unavailable in this simulated ledger.",
                )
              }
              type="button"
            >
              Batch Settle
            </button>
          )}
          <button
            aria-label="Export visible sample invoices to CSV"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container-lowest text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-on-surface"
            onClick={exportVisibleInvoices}
            title="Export sample ledger to CSV"
            type="button"
          >
            <MaterialIcon name="ios_share" className="text-[18px]" />
          </button>
        </div>
      </div>

      {visibleInvoices.length > 0 ? (
        <ul className="flex w-full flex-col gap-space-md">
          {visibleInvoices.map((invoice) => (
            <li key={invoice.id}>
              <InvoiceCard
                invoice={invoice}
                onAction={() =>
                  onNotify(
                    `${invoice.id} is sample data. This action is not connected.`,
                  )
                }
                onSelect={() => toggleInvoice(invoice.id)}
                selected={selectedIds.includes(invoice.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl bg-surface-container-lowest p-space-xl text-center shadow-sm">
          <div className="mb-space-sm flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
            <MaterialIcon name="search_off" className="text-[28px]" />
          </div>
          <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
            No invoices found
          </h3>
          <p className="mt-1 max-w-xs font-body-sm text-body-sm text-on-surface-variant">
            We couldn&apos;t find matches for these filters. Try another search
            or reset the filter.
          </p>
          <button
            className="mt-space-base rounded-lg bg-primary px-space-base py-space-xs font-label-sm text-label-sm font-semibold text-on-primary"
            onClick={() => {
              setQuery("");
              setSelectedIds([]);
              onClearFilters();
            }}
            type="button"
          >
            Clear All Filters
          </button>
        </div>
      )}
    </section>
  );
}

type InvoiceCardProps = {
  invoice: InvoiceRecord;
  selected: boolean;
  onSelect: () => void;
  onAction: () => void;
};

function InvoiceCard({
  invoice,
  selected,
  onSelect,
  onAction,
}: InvoiceCardProps) {
  const badgeTone = {
    success: "bg-[#ECFDF5] text-[#065F46]",
    warning: "bg-[#FFFBEB] text-[#92400E]",
    info: "bg-secondary-fixed text-on-secondary-fixed",
    neutral: "bg-surface-container-high text-on-surface-variant",
    filed: "bg-primary-fixed text-on-primary-fixed-variant",
  }[invoice.badgeTone];

  const actionTone = {
    primary:
      "bg-primary text-on-primary hover:opacity-95",
    secondary:
      "bg-surface-container-high text-on-surface hover:bg-surface-container-highest",
    link: "text-primary hover:underline",
  }[invoice.actionTone];

  return (
    <article className="relative flex flex-col gap-space-sm overflow-hidden rounded-xl bg-surface-container-lowest p-space-base shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-space-sm">
        <div className="flex min-w-0 items-start gap-space-xs">
          <input
            aria-label={`Select ${invoice.id}`}
            checked={selected}
            className="mt-1 h-4 w-4 shrink-0 rounded accent-primary"
            onChange={onSelect}
            type="checkbox"
          />
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-space-xs">
              <span className="truncate font-headline-sm text-headline-sm font-bold text-on-surface">
                {invoice.id}
              </span>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-space-xs py-0.5 font-label-sm text-label-sm font-semibold ${badgeTone}`}
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                {invoice.badge}
              </span>
            </div>
            <span className="truncate pt-space-2xs font-body-md text-body-md font-medium text-on-surface">
              {invoice.buyer}
            </span>
            <span className="flex items-center gap-1 font-body-sm text-body-sm text-on-surface-variant">
              <MaterialIcon name="public" className="text-[14px]" />
              {invoice.country}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
            {invoice.amount}
          </span>
          <span className="font-code-sm text-code-sm text-on-surface-variant">
            {invoice.currency}
          </span>
        </div>
      </div>

      <InvoiceDetail invoice={invoice} />

      <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-2xs">
        <span
          className={`font-label-sm text-label-sm font-semibold ${
            invoice.status === "exception"
              ? "text-error"
              : invoice.status === "matched"
                ? "text-tertiary-container"
                : "text-on-surface-variant"
          }`}
        >
          {getStatusNote(invoice)}
        </span>
        <button
          className={`flex items-center gap-1 rounded-lg font-label-sm text-label-sm font-bold transition-colors ${
            invoice.actionTone === "link" ? "" : "px-space-sm py-1"
          } ${actionTone}`}
          onClick={onAction}
          type="button"
        >
          {invoice.action}
          {invoice.actionIcon && (
            <MaterialIcon name={invoice.actionIcon} className="text-[14px]" />
          )}
        </button>
      </div>
    </article>
  );
}

function InvoiceDetail({ invoice }: { invoice: InvoiceRecord }) {
  switch (invoice.detail.kind) {
    case "matched":
      return (
        <div className="flex flex-col gap-space-xs rounded-lg bg-surface-container-low p-space-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-space-sm gap-y-1 font-code-sm text-code-sm text-on-surface-variant">
            <span>
              Shipping Bill:{" "}
              <strong className="text-on-surface">
                #{invoice.detail.shippingBill}
              </strong>
            </span>
            <span>
              Purpose:{" "}
              <strong className="text-on-surface">
                {invoice.detail.purpose}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-space-xs pt-space-2xs">
            <div
              aria-label={`${invoice.detail.mt103}% MT103 reconciliation`}
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest"
              role="img"
            >
              <div
                className="h-full rounded-full bg-tertiary-container transition-all duration-500"
                style={{ width: `${invoice.detail.mt103}%` }}
              />
            </div>
            <span className="whitespace-nowrap font-label-sm text-label-sm font-bold text-tertiary-container">
              {invoice.detail.mt103}% MT103
            </span>
          </div>
        </div>
      );
    case "variance":
      return (
        <div className="flex items-start gap-space-sm rounded-lg bg-surface-container-low p-space-sm">
          <MaterialIcon
            name="report_problem"
            className="mt-0.5 shrink-0 text-[18px] text-error"
          />
          <div className="flex flex-col font-body-sm text-body-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">
              {invoice.detail.title}
            </span>
            <span className="font-label-sm text-label-sm">
              {invoice.detail.description}
            </span>
          </div>
        </div>
      );
    case "purpose":
      return (
        <div className="flex flex-wrap items-center justify-between gap-space-sm rounded-lg bg-surface-container p-space-sm">
          <div className="flex items-center gap-space-xs">
            <MaterialIcon
              name="psychology_alt"
              className="text-[18px] text-primary"
            />
            <span className="font-body-sm text-body-sm text-on-surface">
              Sample suggestion:{" "}
              <strong className="font-bold text-primary">
                {invoice.detail.suggestedCode}
              </strong>{" "}
              over{" "}
              <span className="text-on-surface-variant line-through">
                {invoice.detail.previousCode}
              </span>
            </span>
          </div>
          <span className="rounded bg-surface-container-lowest px-2 py-0.5 font-label-sm text-label-sm font-bold text-primary">
            {invoice.detail.matchPercent}% Match
          </span>
        </div>
      );
    case "pending":
      return (
        <div className="flex flex-wrap items-center justify-between gap-space-xs rounded-lg bg-surface-container-low p-space-sm font-body-sm text-body-sm text-on-surface-variant">
          <div className="flex items-center gap-space-xs">
            <MaterialIcon name="schedule" className="text-[16px]" />
            <span>
              Expected settlement:{" "}
              <strong className="text-on-surface">{invoice.detail.eta}</strong>
            </span>
          </div>
          <span className="font-code-sm text-code-sm font-medium">
            {invoice.detail.bank}
          </span>
        </div>
      );
    case "filed":
      return (
        <div className="flex items-center justify-between gap-space-sm rounded-lg bg-surface-container-low p-space-sm font-code-sm text-code-sm text-on-surface-variant">
          <span>EDPMS Reference:</span>
          <strong className="text-on-surface">#{invoice.detail.reference}</strong>
        </div>
      );
  }
}

function getStatusNote(invoice: InvoiceRecord) {
  switch (invoice.detail.kind) {
    case "matched":
      return "Dual-reconciled & Locked";
    case "variance":
      return invoice.detail.actionNote;
    case "purpose":
      return "EDPMS review required";
    case "pending":
      return `${invoice.detail.purpose} Assigned`;
    case "filed":
      return "Customs Node Confirmed";
  }
}

export default InvoiceTable;
