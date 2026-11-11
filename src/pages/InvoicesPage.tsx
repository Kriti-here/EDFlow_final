import { useEffect, useRef, useState } from "react";
import {
  ErpBanner,
  FilterPills,
  IngestModal,
  InvoiceTable,
  InvoiceToast,
  LedgerMetrics,
} from "../components/invoices";
import type {
  InvoiceFilter,
  InvoiceFilterOption,
  InvoiceRecord,
} from "../components/invoices";
import { getNavItem } from "../config/navigation";

const INVOICE_RECORDS: InvoiceRecord[] = [
  {
    id: "INV-2024-901",
    buyer: "TechGlobal Corp",
    country: "United States",
    amount: "$42,500.00",
    currency: "USD",
    status: "matched",
    badge: "FIRA Matched",
    badgeTone: "success",
    searchText: "p0802 sb-9921 shipping bill consultancy mt103",
    detail: {
      kind: "matched",
      shippingBill: "SB-9921",
      purpose: "P0802 (Consultancy)",
      mt103: 100,
    },
    action: "View Pack",
    actionIcon: "chevron_right",
    actionTone: "link",
  },
  {
    id: "INV-2024-889",
    buyer: "Apex Robotics Inc",
    country: "United States",
    amount: "$50,000.00",
    currency: "USD",
    status: "exception",
    badge: "Variance -$35.00",
    badgeTone: "warning",
    searchText: "variance bank deduction intermediary wire jp morgan mt103",
    detail: {
      kind: "variance",
      title: "Intermediary wire deduction detected",
      description:
        "Inward remit: $49,965.00 via JP Morgan Chase Swift MT103.",
      actionNote: "Requires write-off or claim",
    },
    action: "Review Variance",
    actionIcon: "tune",
    actionTone: "secondary",
  },
  {
    id: "INV-2024-912",
    buyer: "Valence Cloud GmbH",
    country: "Germany (EU)",
    amount: "€38,400.00",
    currency: "EUR",
    status: "exception",
    badge: "Purpose Review",
    badgeTone: "info",
    searchText: "p0802 p0803 eur purpose software consultancy",
    detail: {
      kind: "purpose",
      suggestedCode: "P0803",
      previousCode: "P0802",
      matchPercent: 98,
    },
    action: "Confirm Code",
    actionTone: "primary",
  },
  {
    id: "INV-2024-915",
    buyer: "Omniverse Ltd",
    country: "United Kingdom",
    amount: "£18,200.00",
    currency: "GBP",
    status: "pending",
    badge: "Awaiting Nostro",
    badgeTone: "neutral",
    searchText: "gbp nostro hsbc swift p0802 united kingdom",
    detail: {
      kind: "pending",
      eta: "in 2 days",
      bank: "HSBC UK PLC",
      purpose: "P0802",
    },
    action: "Track Swift Rail",
    actionIcon: "history_toggle_off",
    actionTone: "link",
  },
  {
    id: "INV-2024-874",
    buyer: "Kyoto Digital KK",
    country: "Japan",
    amount: "¥4,800,000",
    currency: "JPY",
    status: "matched",
    badge: "EDF Pack Filed",
    badgeTone: "filed",
    searchText: "edpms jpy pack filed customs edp-8820",
    detail: {
      kind: "filed",
      reference: "EDP-8820",
    },
    action: "Download Pack",
    actionIcon: "download",
    actionTone: "secondary",
  },
];

const FILTERS: InvoiceFilterOption[] = [
  { value: "all", label: "All", count: 42 },
  { value: "matched", label: "Matched", count: 28 },
  { value: "pending", label: "Pending Wire", count: 11 },
  { value: "exception", label: "Exception", count: 3 },
  { value: "draft", label: "Drafts", count: 0 },
];

const { description } = getNavItem("/invoices");

function InvoicesPage() {
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [ingestOpen, setIngestOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
      }
    },
    [],
  );

  const notify = (message: string) => {
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
    setToastMessage(message);
    toastTimer.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimer.current = null;
    }, 4000);
  };

  const dismissToast = () => {
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    setToastMessage(null);
  };

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-space-base">
      <header className="pb-space-xs">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight text-on-surface md:text-headline-lg">
          Invoices
        </h1>
        <p className="mt-1 max-w-3xl font-body-md text-body-md text-on-surface-variant">
          {description}
        </p>
      </header>

      <InvoiceToast message={toastMessage} onDismiss={dismissToast} />
      <LedgerMetrics
        receivables="$1,482,900"
        fiscalPeriod="FY 24-25 Q3"
        invoiceCount={42}
        compliantPercent={93}
        matchedCount={28}
        pendingCount={11}
        attentionCount={3}
      />
      <ErpBanner onNotify={notify} />
      <FilterPills
        filters={FILTERS}
        onSelect={setFilter}
        selected={filter}
      />
      <InvoiceTable
        filter={filter}
        invoices={INVOICE_RECORDS}
        onClearFilters={() => setFilter("all")}
        onIngest={() => setIngestOpen(true)}
        onNotify={notify}
      />
      <IngestModal
        isOpen={ingestOpen}
        onClose={() => setIngestOpen(false)}
        onNotify={notify}
      />
    </section>
  );
}

export default InvoicesPage;
