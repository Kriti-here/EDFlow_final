// Exception service.
// Backend: POST /exceptions/derive                → re-derive the exception set
//          GET  /exceptions                      → {count, exceptions: ExceptionRecord[]}
//          GET  /exceptions/summary               → status/category/severity counts
//          POST /exceptions/{id}/acknowledge      → open → acknowledged
//          POST /exceptions/{id}/resolve          → open/acknowledged → resolved
//          POST /exceptions/{id}/dismiss          → open/acknowledged → dismissed
//
// ExceptionRecord fields (from backend exception_out):
//   id, category, severity, status, source, dedupe_key, match_id,
//   fira_line_id, fira_document_id, invoice_id, payment_id, confidence_bp,
//   summary, details, engine_version, is_synthetic,
//   acknowledged_at/by/note, resolved_at/by/note, dismissed_at/by/note,
//   last_seen_at, created_at, updated_at

import type { ExceptionItem, ExceptionKpi, ResolvedException } from '../types/exceptions';
import { fetchJson, postJson, settleResult } from './api';
import { istDayBoundsUtc } from './businessDay';
import { formatMoney, parseMoney } from './money';
import {
  activeExceptionCount,
  asSeverity,
  countBySeverity,
  severityCountsFromAggregate,
} from './reconciliationMath';

/** Lifecycle statuses owned by the backend. */
export type ExceptionStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

/** Raw exception record from the backend. */
export interface BackendException {
  id: number;
  category: string | null;
  severity: string | null;
  status: string;
  source: string | null;
  dedupe_key: string | null;
  match_id: number | null;
  fira_line_id: number | null;
  fira_document_id: number | null;
  invoice_id: number | null;
  payment_id: number | null;
  confidence_bp: number | null;
  summary: string | null;
  details: Record<string, unknown>;
  engine_version: string | null;
  is_synthetic: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  acknowledged_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  dismissed_note: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BackendExceptionListResponse {
  count: number;
  exceptions: BackendException[];
}

/** Backend /exceptions/summary response. */
export interface BackendExceptionSummary {
  total: number;
  open: number;
  acknowledged: number;
  resolved: number;
  dismissed: number;
  /** Rows resolved on the current Indian business day (all-time `resolved` is separate). */
  resolved_today?: number;
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  /** Severity counts over the ACTIVE queue (open + acknowledged), complete. */
  active_by_severity?: Record<string, number>;
  /** Category counts over the ACTIVE queue (open + acknowledged), complete. */
  active_by_category?: Record<string, number>;
}

/** Readable failure message per endpoint group that could not be loaded. */
export interface ExceptionsLoadErrors {
  /** GET /exceptions for the active queue (open + acknowledged). */
  queue: string | null;
  /** GET /exceptions/summary (the KPI strip and category counts). */
  summary: string | null;
  /** GET /exceptions for the resolved-today window. */
  resolved: string | null;
}

/** Everything Exceptions Hub needs, already adapted for the UI. */
export interface ExceptionsResponse {
  kpis: ExceptionKpi[];
  /** Open and acknowledged exceptions, newest first. */
  items: ExceptionItem[];
  /** The same open/acknowledged rows in backend shape, for other pages. */
  records: BackendException[];
  /** Status/severity/category counts straight from GET /exceptions/summary. */
  summary: BackendExceptionSummary | null;
  resolvedToday: ResolvedException[];
  /** Accurate count of exceptions resolved today (Indian business day). */
  resolvedTodayCount: number;
  totalResolved: number;
  openCount: number;
  /** Category counts over the active queue, from the complete backend aggregate. */
  categoryCounts: Record<string, number>;
  /** Which section failed; the matching data above is then empty or degraded. */
  errors: ExceptionsLoadErrors;
}

/** Minimal invoice shape used to label an exception's invoice side. */
interface InvoiceLookup {
  id: number;
  number: string;
  client: string;
  client_country: string | null;
  currency: string;
  amount: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  unmatched: 'Unmatched',
  ambiguous: 'Ambiguous',
  duplicate: 'Duplicate',
  fx_variance: 'FX Variance',
  missing_reference: 'Missing Reference',
  missing_fira: 'Missing FIRA',
  missing_payment: 'Missing Payment',
  orphan_payment: 'Orphan Payment',
};

/** Readable label for a backend exception category. */
export function categoryLabel(category: string | null): string {
  if (!category) return 'Unclassified';
  return CATEGORY_LABEL[category] ?? category.replace(/_/g, ' ');
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

/** "12 Nov 2026" from an ISO datetime. */
function humanDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * The timestamp the queue row displays and sorts by: when the condition was last
 * seen, falling back to when the row was created. Unknown or missing values sort
 * last rather than jumping to the top.
 */
function queueTime(record: BackendException): number {
  const value = record.last_seen_at ?? record.created_at;
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Category counts over a row list, used only when the backend aggregate is absent. */
function countByCategory(records: BackendException[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const key = record.category ?? 'unclassified';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Map one backend record onto the row component's presentation shape. */
function adaptItem(record: BackendException, invoices: Map<number, InvoiceLookup>): ExceptionItem {
  const invoice = record.invoice_id !== null ? invoices.get(record.invoice_id) : undefined;
  const detailInvoiceNumber =
    typeof record.details.invoice_number === 'string' ? record.details.invoice_number : null;
  const reference =
    invoice?.number ??
    detailInvoiceNumber ??
    (record.payment_id !== null ? `Payment #${record.payment_id}` : '—');
  const category = record.category ?? 'unmatched';
  const label = categoryLabel(record.category);
  const confidence =
    record.confidence_bp !== null ? `${(record.confidence_bp / 100).toFixed(1)}% confidence` : null;
  const currency = invoice?.currency ?? '';
  const amount = invoice ? formatMoney(parseMoney(invoice.amount)) : '';
  const acknowledged = record.status === 'acknowledged';

  return {
    id: String(record.id),
    code: `EXC-${record.id}`,
    invoiceRef: reference,
    title: record.summary ?? `${label} exception`,
    client: invoice?.client ?? '',
    country: invoice?.client_country ?? '',
    currency,
    amount: amount ? `${currency} ${amount}`.trim() : '',
    severity: asSeverity(record.severity),
    categories: [category],
    timestamp: humanDate(record.last_seen_at ?? record.created_at),
    statusLabel: STATUS_LABEL[record.status] ?? record.status,
    description: record.summary ?? '',
    problemDetails: {
      icon: 'warning',
      title: label,
      description: [record.summary, confidence, `source: ${record.source ?? 'unknown'}`]
        .filter(Boolean)
        .join(' · '),
    },
    actions: {
      primary: acknowledged
        ? { label: 'Resolve', icon: 'done_all', onClick: 'resolve' }
        : { label: 'Acknowledge', icon: 'visibility', onClick: 'acknowledge' },
      secondary: acknowledged
        ? { label: 'Dismiss', icon: 'block', onClick: 'dismiss' }
        : { label: 'Resolve', icon: 'done_all', onClick: 'resolve' },
    },
  };
}

/** Build the KPI strip from the summary counts (all real, no estimates). */
function buildKpis(list: BackendException[], summary: BackendExceptionSummary): ExceptionKpi[] {
  // Severity buckets come from the backend's ACTIVE-queue aggregate (open +
  // acknowledged), so they stay correct past the 200-row page the UI fetches;
  // the fetched rows are only a fallback. Low is reported on its own and is
  // never folded into medium.
  const bySeverity = summary.active_by_severity
    ? severityCountsFromAggregate(summary.active_by_severity)
    : countBySeverity(list.map((item) => item.severity));
  return [
    {
      label: 'Open Exceptions',
      value: activeExceptionCount(summary),
      subtitle: 'awaiting action',
      icon: 'rule_folder',
      variant: 'low',
    },
    {
      label: 'Critical',
      value: bySeverity.critical,
      subtitle: 'highest priority',
      icon: 'warning',
      variant: 'critical',
    },
    {
      label: 'High',
      value: bySeverity.high,
      subtitle: 'needs review',
      icon: 'priority_high',
      variant: 'high',
    },
    {
      label: 'Medium',
      value: bySeverity.medium,
      subtitle: 'in queue',
      icon: 'help',
      variant: 'medium',
    },
    {
      label: 'Low',
      value: bySeverity.low,
      subtitle: 'monitor',
      icon: 'info',
      variant: 'low',
    },
    {
      label: 'Resolved',
      value: summary.resolved ?? 0,
      subtitle: `${summary.dismissed ?? 0} dismissed`,
      icon: 'verified',
      variant: 'low',
    },
  ];
}

/**
 * Load the open/acknowledged exception queue, the resolved history and the
 * summary counts. Invoice numbers, buyers and amounts come from GET /invoices;
 * when that call fails the exceptions are still listed with generic labels.
 *
 * Each group settles independently (`Promise.allSettled`) so one failing request
 * no longer blanks the page: the failures are reported through `errors` and the
 * sections that loaded are still returned.
 */
export async function fetchExceptions(): Promise<ExceptionsResponse> {
  // The Indian business day, as the UTC interval [IST midnight, next IST
  // midnight). These are exactly the bounds the backend uses for `resolved_today`.
  const { since, until } = istDayBoundsUtc();
  const [openResult, ackResult, resolvedResult, summaryResult, invoiceResult] =
    await Promise.allSettled([
      fetchJson<BackendExceptionListResponse>('/exceptions', {
        query: { status: 'open', limit: 200 },
      }),
      fetchJson<BackendExceptionListResponse>('/exceptions', {
        query: { status: 'acknowledged', limit: 200 },
      }),
      // Date-filtered by the backend so "Resolved Today" never depends on the
      // newest N rows by id; the bounds are the same Indian day the summary uses.
      fetchJson<BackendExceptionListResponse>('/exceptions', {
        query: { status: 'resolved', resolved_since: since, resolved_until: until, limit: 200 },
      }),
      fetchJson<BackendExceptionSummary>('/exceptions/summary'),
      fetchJson<InvoiceLookup[]>('/invoices'),
    ]);

  const open = settleResult(openResult);
  const acknowledged = settleResult(ackResult);
  const resolved = settleResult(resolvedResult);
  const summary = settleResult(summaryResult);
  // Invoice labels are cosmetic, so this failure is deliberately not surfaced.
  const invoices = settleResult(invoiceResult).data ?? [];

  const lookups = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  // Merge the two active buckets and order by the timestamp each row shows,
  // newest first — not "all open, then all acknowledged". If one bucket failed
  // the other is still shown, with the queue flagged as incomplete.
  const records = [...(open.data?.exceptions ?? []), ...(acknowledged.data?.exceptions ?? [])].sort(
    (a, b) => queueTime(b) - queueTime(a),
  );
  const summaryData = summary.data;
  // Category counts come from the backend's ACTIVE-queue aggregate so they stay
  // accurate past the 200-row page; the fetched rows are only a fallback.
  const categoryCounts = summaryData?.active_by_category
    ? { ...summaryData.active_by_category }
    : countByCategory(records);

  const resolvedRows = resolved.data?.exceptions ?? [];
  // Every row here was resolved within today's Indian business day (backend filter).
  const resolvedToday = resolvedRows.map<ResolvedException>((record) => {
    const invoice = record.invoice_id !== null ? lookups.get(record.invoice_id) : undefined;
    const amount = invoice ? formatMoney(parseMoney(invoice.amount)) : '';
    return {
      id: String(record.id),
      invoiceRef: invoice?.number ?? `EXC-${record.id}`,
      amount: amount ? `${invoice?.currency ?? ''} ${amount}`.trim() : categoryLabel(record.category),
      description: record.resolution_note ?? record.summary ?? 'Resolved',
      resolutionType: record.resolved_by === 'system' ? 'auto' : 'manual',
      timestamp: humanDate(record.resolved_at),
    };
  });

  return {
    kpis: summaryData ? buildKpis(records, summaryData) : [],
    items: records.map((record) => adaptItem(record, lookups)),
    records,
    summary: summaryData,
    resolvedToday,
    // Authoritative backend count; falls back to the date-filtered list length.
    resolvedTodayCount: summaryData?.resolved_today ?? resolvedRows.length,
    totalResolved: summaryData?.resolved ?? 0,
    openCount: summaryData ? activeExceptionCount(summaryData) : 0,
    categoryCounts,
    errors: {
      queue: open.error ?? acknowledged.error,
      summary: summary.error,
      resolved: resolved.error,
    },
  };
}

/** Recompute the exception set from the current matches and ledger. */
export function deriveExceptions(): Promise<Record<string, unknown>> {
  return postJson<Record<string, unknown>>('/exceptions/derive');
}

/** Lifecycle transition shared by acknowledge/resolve/dismiss. */
async function lifecycle(path: string, note?: string): Promise<BackendException> {
  return postJson<BackendException>(path, { note: note ?? null });
}

/** Acknowledge an exception (marks it seen without resolving it). */
export function acknowledgeException(id: number, note?: string): Promise<BackendException> {
  return lifecycle(`/exceptions/${id}/acknowledge`, note);
}

/** Resolve an exception. */
export function resolveException(id: number, note?: string): Promise<BackendException> {
  return lifecycle(`/exceptions/${id}/resolve`, note);
}

/** Dismiss an exception as noise. */
export function dismissException(id: number, note?: string): Promise<BackendException> {
  return lifecycle(`/exceptions/${id}/dismiss`, note);
}
