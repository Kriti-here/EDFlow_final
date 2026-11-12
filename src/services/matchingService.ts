// Matching service.
// Backend: POST /matches/run              → run the deterministic matcher globally
//          GET  /matches                  → {count, by_status, matches: MatchRecord[]}
//          GET  /matches/{id}              → one match record
//          POST /matches/{id}/confirm      → idempotent human confirmation
//
// Backend match statuses (match_service): matched | matched_with_variance |
// duplicate | exception | needs_review.

import { fetchJson, postJson, settleResult } from './api';
import { formatMoney, parseMoney } from './money';
import {
  MATCH_STATUSES,
  autoMatchRate,
  isConfirmableMatch,
  normalizeStatusCounts,
  type MatchStatus,
} from './reconciliationMath';

export type { MatchStatus } from './reconciliationMath';

/** Records fetched per page. The backend caps a single response at 500. */
export const MATCH_PAGE_SIZE = 200;

/** Raw match record as returned by GET /matches */
export interface BackendMatchRecord {
  id: number;
  fira_line_id: number | null;
  invoice_id: number | null;
  payment_id: number | null;
  match_type: string | null;
  status: string;
  confidence_bp: number | null;
  confidence_band: string | null;
  candidates: unknown[];
  score: Record<string, unknown>;
  rationale: string | null;
  duplicate_of_line_id: number | null;
  split_group: string | null;
  split_part: number | null;
  split_parts_total: number | null;
  fx_expected_rate: string | null;
  fx_actual_rate: string | null;
  fx_variance_bp: number | null;
  engine_version: string | null;
  is_synthetic: boolean;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BackendMatchListResponse {
  /** Filtered total match-record count (not just the length of `matches`). */
  count: number;
  /** Per-status counts across every stored record, for accurate filter badges. */
  by_status: Record<string, number>;
  matches: BackendMatchRecord[];
}

/** Summary returned by POST /matches/run. */
export interface MatchRunSummary {
  engine_version: string;
  lines: number;
  matched: number;
  matched_with_variance: number;
  duplicates: number;
  exceptions: number;
  needs_review: number;
  by_status: Record<string, number>;
  by_match_type: Record<string, number>;
}

/** UI-friendly match pair adapted from BackendMatchRecord. */
export interface MatchPair {
  id: number;
  firaRef: string;
  invoiceRef: string;
  client: string;
  currency: string;
  invoiceAmount: string;
  status: MatchStatus;
  statusRaw: string;
  confidence: string;
  matchType: string | null;
  variance?: string;
  note?: string;
  engineVersion: string | null;
  isSynthetic: boolean;
  /** Whether the UI may offer the confirm action for this status. */
  confirmable: boolean;
  confirmed: boolean;
  confirmedBy: string | null;
  createdAt: string | null;
}

export interface MatchSummary {
  /** Total match records in the backend (survives the page cap). */
  total: number;
  matched: number;
  unmatched: number;
  exceptions: number;
  autoMatchRate: string;
}

export interface MatchingResultsResponse {
  summary: MatchSummary;
  /** Accurate per-status totals for the whole dataset, not just this page. */
  statusCounts: Record<MatchStatus, number>;
  pairs: MatchPair[];
  /** Readable failure message per endpoint that could not be loaded. */
  errors: {
    /** GET /matches (the match records themselves). */
    matches: string | null;
  };
}

/** Optional pagination window for `fetchMatchingResults`. */
export interface MatchingFetchOptions {
  offset?: number;
  limit?: number;
}

/** Minimal invoice shape needed to label a match's invoice side. */
interface InvoiceLookup {
  id: number;
  number: string;
  client: string;
  currency: string;
  amount: string;
}

function toMatchStatus(status: string): MatchStatus {
  return (MATCH_STATUSES as string[]).includes(status) ? (status as MatchStatus) : 'needs_review';
}

/** Confidence in basis points (0–10000) rendered as a percentage. */
function bpToPercent(bp: number | null): string {
  if (bp === null) return '—';
  return `${(bp / 100).toFixed(1)}%`;
}

/** "12 Nov 2026" from an ISO datetime. */
function humanDateTime(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Adapt one raw match record, using the invoice lookup for readable labels. */
function adaptPair(record: BackendMatchRecord, invoices: Map<number, InvoiceLookup>): MatchPair {
  const invoice = record.invoice_id !== null ? invoices.get(record.invoice_id) : undefined;
  const variance =
    record.fx_variance_bp !== null && record.fx_variance_bp !== 0
      ? `FX variance ${(record.fx_variance_bp / 100).toFixed(2)}%`
      : undefined;
  return {
    id: record.id,
    firaRef: record.fira_line_id !== null ? `FIRA line #${record.fira_line_id}` : '—',
    invoiceRef: invoice ? invoice.number : record.invoice_id !== null ? `Invoice #${record.invoice_id}` : 'Unmatched',
    client: invoice?.client ?? '—',
    currency: invoice?.currency ?? '—',
    invoiceAmount: invoice ? formatMoney(parseMoney(invoice.amount)) : '—',
    status: toMatchStatus(record.status),
    statusRaw: record.status,
    confidence: bpToPercent(record.confidence_bp),
    matchType: record.match_type,
    variance,
    note: record.rationale ?? undefined,
    engineVersion: record.engine_version,
    isSynthetic: record.is_synthetic,
    confirmable: isConfirmableMatch(record.status),
    confirmed: record.confirmed_at !== null,
    confirmedBy: record.confirmed_by,
    createdAt: record.confirmed_at ?? record.created_at,
  };
}

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  matched: 'Matched',
  matched_with_variance: 'Variance',
  duplicate: 'Duplicate',
  exception: 'Exception',
  needs_review: 'Needs Review',
};

/**
 * Fetch one page of match records from GET /matches and adapt them for the UI.
 *
 * `count` is the backend's filtered total and `by_status` spans every stored
 * record, so the summary and the filter badges stay accurate even though
 * `matches` is capped at one page (500 max, 200 here). Invoice numbers, clients
 * and amounts are resolved from GET /invoices; if that call fails the matches are
 * still shown with generic invoice labels, and a `/matches` failure is reported
 * through `errors.matches` instead of throwing so the page keeps its shell.
 */
export async function fetchMatchingResults(
  options: MatchingFetchOptions = {},
): Promise<MatchingResultsResponse> {
  const offset = Math.max(options.offset ?? 0, 0);
  const limit = options.limit ?? MATCH_PAGE_SIZE;
  const [matchResult, invoiceResult] = await Promise.allSettled([
    fetchJson<BackendMatchListResponse>('/matches', { query: { limit, offset } }),
    fetchJson<InvoiceLookup[]>('/invoices'),
  ]);

  const matches = settleResult(matchResult);
  // Invoice labels are cosmetic: drop the lookup silently and keep the pairs.
  const invoices = settleResult(invoiceResult).data ?? [];

  const lookups = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const raw = matches.data;
  const pairs = (raw?.matches ?? []).map((record) => adaptPair(record, lookups));
  const statusCounts = normalizeStatusCounts(raw?.by_status ?? {});

  // Auto-matched means the engine resolved the line without human review: only
  // `matched` and `matched_with_variance`. `duplicate`, `exception` and
  // `needs_review` all still need a person, so they must not inflate the rate.
  return {
    summary: {
      total: raw?.count ?? 0,
      matched: statusCounts.matched + statusCounts.matched_with_variance,
      unmatched: statusCounts.needs_review,
      exceptions: statusCounts.exception + statusCounts.duplicate,
      autoMatchRate: autoMatchRate(statusCounts),
    },
    statusCounts,
    pairs,
    errors: { matches: matches.error },
  };
}

/** Run the deterministic matcher over every stored FIRA document. */
export function runMatches(): Promise<MatchRunSummary> {
  return postJson<MatchRunSummary>('/matches/run');
}

/** Confirm one match by id (idempotent). */
export function confirmMatch(matchId: number): Promise<BackendMatchRecord> {
  return postJson<BackendMatchRecord>(`/matches/${matchId}/confirm`);
}

export { humanDateTime };
