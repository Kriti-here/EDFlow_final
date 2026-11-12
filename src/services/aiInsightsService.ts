// AI Insights dashboard data, assembled only from endpoints that already exist:
//   GET /ai/proposals                     -> AI proposal metrics
//   GET /purpose-recommendations/summary  -> purpose recommendation metrics
//   GET /matches                          -> match confidence metrics
//   GET /exceptions + /exceptions/summary -> exception trends
//
// Read-only: this module never runs a task, decides a proposal or writes a row,
// and it adds no new backend endpoints.

import { fetchJson, settleResult } from './api';

const TREND_DAYS = 7;
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface AiProposalMetrics {
  total: number;
  proposed: number;
  accepted: number;
  rejected: number;
  /** Share of proposals served from the record/replay cache, in percent. */
  cacheHitRate: number;
  /** Mean confidence across proposals, in percent (basis points / 100). */
  avgConfidencePct: number;
  byBand: Record<string, number>;
  byTask: Record<string, number>;
}

export interface PurposeMetrics {
  total: number;
  proposed: number;
  accepted: number;
  rejected: number;
  superseded: number;
  /** Accepted / total, in percent. */
  acceptanceRate: number;
  byBand: Record<string, number>;
}

export interface MatchConfidenceMetrics {
  total: number;
  confirmed: number;
  avgConfidencePct: number;
  /** Counts keyed by the engine's confidence band (high/medium/low). */
  bands: Record<string, number>;
  byStatus: Record<string, number>;
}

export interface ExceptionTrendPoint {
  /** Short day label, e.g. "6 Nov". */
  label: string;
  opened: number;
  resolved: number;
}

export interface ExceptionTrendMetrics {
  total: number;
  open: number;
  acknowledged: number;
  resolved: number;
  dismissed: number;
  bySeverity: Record<string, number>;
  trend: ExceptionTrendPoint[];
  openedLast7: number;
  resolvedLast7: number;
}

/** The four independent dashboard sections. */
export type AiInsightsSection = 'proposals' | 'purpose' | 'matches' | 'exceptions';

export interface AIInsightsData {
  /** Null when GET /ai/proposals failed; see `errors.proposals`. */
  proposals: AiProposalMetrics | null;
  /** Null when GET /purpose-recommendations/summary failed. */
  purpose: PurposeMetrics | null;
  /** Null when GET /matches failed. */
  matches: MatchConfidenceMetrics | null;
  /** Null when either the exception list or its summary failed. */
  exceptions: ExceptionTrendMetrics | null;
  /** Readable failure message per section that could not be loaded. */
  errors: Partial<Record<AiInsightsSection, string>>;
}

// --- raw backend payloads (only the fields this dashboard reads) ---

interface RawProposal {
  task: string;
  status: string;
  cache_hit: boolean;
  confidence_bp: number | null;
  confidence_band: string | null;
}

interface RawProposalList {
  count: number;
  proposals: RawProposal[];
}

interface RawMatch {
  status: string;
  confidence_bp: number | null;
  confidence_band: string | null;
  confirmed_at: string | null;
}

interface RawMatchList {
  count: number;
  matches: RawMatch[];
}

interface RawException {
  created_at: string | null;
  resolved_at: string | null;
}

interface RawExceptionList {
  count: number;
  exceptions: RawException[];
}

interface RawPurposeSummary {
  total: number;
  proposed?: number;
  accepted?: number;
  rejected?: number;
  superseded?: number;
  by_band?: Record<string, number>;
}

interface RawExceptionSummary {
  total: number;
  open?: number;
  acknowledged?: number;
  resolved?: number;
  dismissed?: number;
  by_severity?: Record<string, number>;
}

// --- small helpers ---

/** Count occurrences, mapping null/undefined keys to "unknown". */
function countBy(values: (string | null | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) {
    const key = value ?? 'unknown';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** part / whole as a percentage rounded to one decimal (0 when whole is 0). */
function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/** Mean of the non-null basis points, converted to a percentage. */
function averageConfidencePct(values: (number | null)[]): number {
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (nums.length === 0) return 0;
  const meanBp = nums.reduce((sum, v) => sum + v, 0) / nums.length;
  return Math.round((meanBp / 100) * 10) / 10;
}

/** UTC day key (YYYY-MM-DD) for an ISO timestamp, or null when unparseable. */
function dayKey(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Opened vs resolved counts for the last TREND_DAYS days (oldest first). */
function buildTrend(rows: RawException[]): ExceptionTrendPoint[] {
  const today = new Date();
  const buckets = new Map<string, ExceptionTrendPoint>();
  const days: string[] = [];

  for (let i = TREND_DAYS - 1; i >= 0; i -= 1) {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i),
    );
    const key = date.toISOString().slice(0, 10);
    days.push(key);
    buckets.set(key, {
      label: `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`,
      opened: 0,
      resolved: 0,
    });
  }

  for (const row of rows) {
    const opened = dayKey(row.created_at);
    if (opened && buckets.has(opened)) buckets.get(opened)!.opened += 1;
    const resolved = dayKey(row.resolved_at);
    if (resolved && buckets.has(resolved)) buckets.get(resolved)!.resolved += 1;
  }

  return days.map((key) => buckets.get(key)!);
}

// --- adapters ---

function adaptProposals(raw: RawProposalList): AiProposalMetrics {
  const rows = raw.proposals;
  const byStatus = countBy(rows.map((r) => r.status));
  const cacheHits = rows.filter((r) => r.cache_hit).length;
  return {
    total: rows.length,
    proposed: byStatus.proposed ?? 0,
    accepted: byStatus.accepted ?? 0,
    rejected: byStatus.rejected ?? 0,
    cacheHitRate: percent(cacheHits, rows.length),
    avgConfidencePct: averageConfidencePct(rows.map((r) => r.confidence_bp)),
    byBand: countBy(rows.map((r) => r.confidence_band)),
    byTask: countBy(rows.map((r) => r.task)),
  };
}

function adaptPurpose(raw: RawPurposeSummary): PurposeMetrics {
  const total = raw.total;
  const accepted = raw.accepted ?? 0;
  return {
    total,
    proposed: raw.proposed ?? 0,
    accepted,
    rejected: raw.rejected ?? 0,
    superseded: raw.superseded ?? 0,
    acceptanceRate: percent(accepted, total),
    byBand: raw.by_band ?? {},
  };
}

function adaptMatches(raw: RawMatchList): MatchConfidenceMetrics {
  const rows = raw.matches;
  return {
    total: rows.length,
    confirmed: rows.filter((r) => r.confirmed_at !== null).length,
    avgConfidencePct: averageConfidencePct(rows.map((r) => r.confidence_bp)),
    bands: countBy(rows.map((r) => r.confidence_band)),
    byStatus: countBy(rows.map((r) => r.status)),
  };
}

function adaptExceptions(
  raw: RawExceptionList,
  summary: RawExceptionSummary,
): ExceptionTrendMetrics {
  const trend = buildTrend(raw.exceptions);
  return {
    total: summary.total,
    open: summary.open ?? 0,
    acknowledged: summary.acknowledged ?? 0,
    resolved: summary.resolved ?? 0,
    dismissed: summary.dismissed ?? 0,
    bySeverity: summary.by_severity ?? {},
    trend,
    openedLast7: trend.reduce((sum, p) => sum + p.opened, 0),
    resolvedLast7: trend.reduce((sum, p) => sum + p.resolved, 0),
  };
}

/**
 * Load every metric the AI Insights dashboard shows in one parallel round trip.
 *
 * Uses `Promise.allSettled` so one failing endpoint leaves the other three
 * sections intact: a failed section is reported through `errors` and its data is
 * null, while the page renders the sections that succeeded.
 */
export async function fetchAIInsights(): Promise<AIInsightsData> {
  const [proposalResult, purposeResult, matchResult, exceptionResult, summaryResult] =
    await Promise.allSettled([
      fetchJson<RawProposalList>('/ai/proposals', { query: { limit: 500 } }),
      fetchJson<RawPurposeSummary>('/purpose-recommendations/summary'),
      fetchJson<RawMatchList>('/matches', { query: { limit: 500 } }),
      fetchJson<RawExceptionList>('/exceptions', { query: { limit: 500 } }),
      fetchJson<RawExceptionSummary>('/exceptions/summary'),
    ]);

  const proposals = settleResult(proposalResult);
  const purpose = settleResult(purposeResult);
  const matches = settleResult(matchResult);
  const exceptions = settleResult(exceptionResult);
  const exceptionSummary = settleResult(summaryResult);

  // The trend section needs both requests, so either failure marks it failed.
  const exceptionsError = exceptions.error ?? exceptionSummary.error;
  const exceptionsData =
    exceptions.data && exceptionSummary.data
      ? adaptExceptions(exceptions.data, exceptionSummary.data)
      : null;

  const errors: Partial<Record<AiInsightsSection, string>> = {};
  if (proposals.error) errors.proposals = proposals.error;
  if (purpose.error) errors.purpose = purpose.error;
  if (matches.error) errors.matches = matches.error;
  if (exceptionsError) errors.exceptions = exceptionsError;

  return {
    proposals: proposals.data ? adaptProposals(proposals.data) : null,
    purpose: purpose.data ? adaptPurpose(purpose.data) : null,
    matches: matches.data ? adaptMatches(matches.data) : null,
    exceptions: exceptionsData,
    errors,
  };
}
