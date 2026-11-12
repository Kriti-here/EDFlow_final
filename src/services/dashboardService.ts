// Dashboard data assembled ONLY from endpoints that already exist:
//   GET /exporter, /invoices, /ledger, /matches,
//   /exceptions + /exceptions/summary,
//   /edf-packs + /edf-packs/summary,
//   /purpose-recommendations/summary, /audit
//
// Read-only aggregation for the dashboard cards. Nothing here invents a value:
// every number is derived from a backend response, and any endpoint that fails
// is simply reported as unavailable rather than faked.

import { fetchJson } from './api';
import { fetchExporter } from './exporterService';
import { fetchExceptions } from './exceptionsService';
import { fetchEDFPacks } from './edfService';
import { formatMoney, parseMoney } from './money';
import { classifyMatch, countBySeverity, normalizeStatusCounts, severityCountsFromAggregate } from './reconciliationMath';
import type { AuditEntry, AuditLogResponse } from './auditService';

// --- exact decimal helpers (no floats for money) -------------------------

/** Sum a list of money strings per currency, exactly. */
function sumByCurrency(
  rows: Array<{ currency: string | null; amount: string | null }>,
): Record<string, string> {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    const currency = (row.currency ?? '—').toUpperCase();
    totals.set(currency, (totals.get(currency) ?? 0n) + parseMoney(row.amount));
  }
  return Object.fromEntries(
    [...totals.entries()].map(([currency, total]) => [currency, formatMoney(total)]),
  );
}

// --- re-exported money helpers (see services/money.ts) -------------------
export { dominantCurrency, formatMoney, parseMoney } from './money';

// --- shapes ---------------------------------------------------------------

interface InvoiceRow {
  id: number;
  number: string;
  client: string;
  client_country: string | null;
  currency: string;
  amount: string;
  status: string;
}

interface LedgerRow {
  id: number;
  invoice: string | null;
  currency: string | null;
  net: string | null;
  gross: string | null;
}

interface MatchRow {
  id: number;
  status: string;
}

interface MatchList {
  /** Filtered total match-record count (not just the length of `matches`). */
  count: number;
  by_status: Record<string, number>;
  matches: MatchRow[];
}

interface PurposeSummary {
  total: number;
  by_status: Record<string, number>;
}

/** A trimmed open exception for the dashboard action queue. */
export interface DashboardExceptionItem {
  id: number;
  invoice: string;
  counterparty: string;
  summary: string;
  severity: string;
  confidenceBp: number | null;
}

/** Everything the dashboard needs, already reduced from backend responses. */
export interface DashboardStats {
  exporter: {
    configured: boolean;
    legal_name: string;
    entity_type: string;
    ie_code: string | null;
    ad_code: string | null;
    ad_bank_name: string | null;
  };
  invoices: {
    total: number;
    draft: number;
    sent: number;
    paid: number;
    totalByCurrency: Record<string, string>;
  };
  ledger: {
    count: number;
    linked: number;
    netByCurrency: Record<string, string>;
  };
  matches: {
    total: number;
    matched: number;
    unmatched: number;
    exception: number;
    rate: number;
  };
  exceptions: {
    total: number;
    open: number;
    acknowledged: number;
    resolved: number;
    dismissed: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    resolvedToday: number;
  };
  edf: { total: number; approved: number; draft: number; blocked: number; exported: number };
  purpose: { total: number; accepted: number; proposed: number; rejected: number };
  /** Up to five open exceptions, newest first, for the action queue. */
  exceptionItems: DashboardExceptionItem[];
  audit: { chainOk: boolean; firstBadRow: number | null; latest: AuditEntry | null };
  /** Endpoints that could not be reached, so the UI can show partial-data state. */
  unavailable: string[];
}

/** A fresh, all-zero stats object, so each fetch starts from a clean slate. */
function emptyStats(): DashboardStats {
  return {
    exporter: {
      configured: false,
      legal_name: 'Exporter profile not set',
      entity_type: 'company',
      ie_code: null,
      ad_code: null,
      ad_bank_name: null,
    },
    invoices: { total: 0, draft: 0, sent: 0, paid: 0, totalByCurrency: {} },
    ledger: { count: 0, linked: 0, netByCurrency: {} },
    matches: { total: 0, matched: 0, unmatched: 0, exception: 0, rate: 0 },
    exceptions: {
      total: 0, open: 0, acknowledged: 0, resolved: 0, dismissed: 0,
      critical: 0, high: 0, medium: 0, low: 0, resolvedToday: 0,
    },
    edf: { total: 0, approved: 0, draft: 0, blocked: 0, exported: 0 },
    purpose: { total: 0, accepted: 0, proposed: 0, rejected: 0 },
    exceptionItems: [],
    audit: { chainOk: true, firstBadRow: null, latest: null },
    unavailable: [],
  };
}

/**
 * Fetch every dashboard source in parallel. A failing endpoint degrades that
 * one card and is listed in `unavailable` — the rest still render.
 */
export async function fetchDashboardStats(): Promise<DashboardStats> {
  const [exporter, invoices, ledger, matches, exceptions, edf, purpose, audit, health] =
    await Promise.allSettled([
      fetchExporter(),
      fetchJson<InvoiceRow[]>('/invoices'),
      fetchJson<LedgerRow[]>('/ledger'),
      fetchJson<MatchList>('/matches', { query: { limit: 500 } }),
      fetchExceptions(),
      fetchEDFPacks(),
      fetchJson<PurposeSummary>('/purpose-recommendations/summary'),
      fetchJson<AuditLogResponse>('/audit', { query: { limit: 1 } }),
      fetchJson<{ status: string }>('/healthz'),
    ]);

  const stats = emptyStats();
  const unavailable = (name: string) => stats.unavailable.push(name);

  // Reachability probe: the result is not displayed, only used to flag the API down.
  if (health.status === 'rejected') unavailable('health');

  if (exporter.status === 'fulfilled' && exporter.value) {
    const e = exporter.value;
    stats.exporter = {
      configured: true,
      legal_name: e.legal_name || 'Exporter profile',
      entity_type: e.entity_type || 'company',
      ie_code: e.ie_code,
      ad_code: e.ad_code,
      ad_bank_name: e.ad_bank_name,
    };
  } else if (exporter.status === 'rejected') {
    unavailable('exporter');
  }

  if (invoices.status === 'fulfilled') {
    const rows = invoices.value;
    stats.invoices.total = rows.length;
    for (const row of rows) {
      const status = (row.status || '').toUpperCase();
      if (status === 'PAID') stats.invoices.paid += 1;
      else if (status === 'SENT') stats.invoices.sent += 1;
      else stats.invoices.draft += 1;
    }
    stats.invoices.totalByCurrency = sumByCurrency(
      rows.map((r) => ({ currency: r.currency, amount: r.amount })),
    );
  } else {
    unavailable('invoices');
  }

  if (ledger.status === 'fulfilled') {
    const rows = ledger.value;
    stats.ledger.count = rows.length;
    stats.ledger.linked = rows.filter((r) => r.invoice != null).length;
    stats.ledger.netByCurrency = sumByCurrency(
      rows.map((r) => ({ currency: r.currency, amount: r.net })),
    );
  } else {
    unavailable('ledger');
  }

  if (matches.status === 'fulfilled') {
    const body = matches.value;
    stats.matches.total = body.count;
    // `by_status` spans every stored record, so the buckets stay accurate past
    // the returned page; the page itself is only a fallback.
    if (body.by_status) {
      const counts = normalizeStatusCounts(body.by_status);
      stats.matches.matched = counts.matched + counts.matched_with_variance;
      stats.matches.exception = counts.exception + counts.duplicate;
      stats.matches.unmatched = counts.needs_review;
    } else {
      for (const row of body.matches) stats.matches[classifyMatch(row.status)] += 1;
    }
    stats.matches.rate =
      stats.matches.total > 0
        ? Math.round((stats.matches.matched / stats.matches.total) * 1000) / 10
        : 0;
  } else {
    unavailable('matches');
  }

  if (exceptions.status === 'fulfilled') {
    const { records: rows, summary: counts } = exceptions.value;
    // The summary aggregate is optional now: when GET /exceptions/summary fails
    // it arrives null while the queue rows still load. Keep the queue (below)
    // and flag only the KPI counts as unavailable.
    if (counts) {
      // Count severity over the ACTIVE queue (open + acknowledged) using the
      // backend's complete aggregate, so the dashboard agrees with the exception
      // queue it describes. The summary's `by_severity` spans every historical
      // record and the fetched rows are capped, so neither is used here.
      const bySeverity = counts.active_by_severity
        ? severityCountsFromAggregate(counts.active_by_severity)
        : countBySeverity(rows.map((row) => row.severity));
      stats.exceptions = {
        total: counts.total ?? 0,
        open: counts.open ?? 0,
        acknowledged: counts.acknowledged ?? 0,
        resolved: counts.resolved ?? 0,
        dismissed: counts.dismissed ?? 0,
        critical: bySeverity.critical,
        high: bySeverity.high,
        medium: bySeverity.medium,
        low: bySeverity.low,
        resolvedToday: exceptions.value.resolvedTodayCount,
      };
    } else {
      unavailable('exceptions/summary');
    }

    const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    stats.exceptionItems = [...rows]
      .sort(
        (a, b) =>
          (SEVERITY_RANK[a.severity ?? ''] ?? 9) - (SEVERITY_RANK[b.severity ?? ''] ?? 9) ||
          b.id - a.id,
      )
      .slice(0, 5)
      .map((row) => ({
        id: row.id,
        invoice: row.invoice_id != null ? `INV-${row.invoice_id}` : `EXC-${row.id}`,
        counterparty: row.source ?? row.category ?? '—',
        summary: row.summary ?? 'Reconciliation exception',
        severity: row.severity ?? 'low',
        confidenceBp: row.confidence_bp,
      }));
  } else {
    unavailable('exceptions');
  }

  if (edf.status === 'fulfilled') {
    const metric = (status: string) =>
      Number(edf.value.metrics.find((m) => m.status === status)?.value ?? 0);
    stats.edf = {
      total: edf.value.packs.length,
      approved: metric('ready'),
      draft: metric('draft'),
      blocked: metric('blocked'),
      exported: metric('exported'),
    };
  } else {
    unavailable('edf');
  }

  if (purpose.status === 'fulfilled') {
    const by = purpose.value.by_status ?? {};
    stats.purpose = {
      total: purpose.value.total,
      accepted: by['accepted'] ?? 0,
      proposed: by['proposed'] ?? 0,
      rejected: by['rejected'] ?? 0,
    };
  } else {
    unavailable('purpose');
  }

  if (audit.status === 'fulfilled') {
    stats.audit = {
      chainOk: audit.value.chain_ok,
      firstBadRow: audit.value.first_bad_row,
      latest: audit.value.entries[0] ?? null,
    };
  } else {
    unavailable('audit');
  }

  stats.unavailable = [...new Set(stats.unavailable)];
  return stats;
}
