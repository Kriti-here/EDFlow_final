// Pure, dependency-free maths shared by the matching, exception and dashboard
// services.
//
// Kept completely free of imports on purpose: the other services import each
// other without file extensions, which Node's ESM resolver rejects, so this is
// the one module the `node --test` suite can load directly. Everything here is
// a deterministic function over primitive inputs — no network, no state.

/** Statuses the matching engine can persist, in display order. */
export type MatchStatus =
  | 'matched'
  | 'matched_with_variance'
  | 'duplicate'
  | 'exception'
  | 'needs_review';

export const MATCH_STATUSES: MatchStatus[] = [
  'matched',
  'matched_with_variance',
  'duplicate',
  'exception',
  'needs_review',
];

/** Zeroed per-status counters. */
export function emptyStatusCounts(): Record<MatchStatus, number> {
  return { matched: 0, matched_with_variance: 0, duplicate: 0, exception: 0, needs_review: 0 };
}

/**
 * Normalise a backend `by_status` map into exactly the five known statuses.
 *
 * The backend aggregate spans every stored record, so these counts stay accurate
 * even when the returned list is one capped page. Unknown keys are ignored and
 * every known status is always present.
 */
export function normalizeStatusCounts(raw: Record<string, number>): Record<MatchStatus, number> {
  const counts = emptyStatusCounts();
  for (const status of MATCH_STATUSES) counts[status] = raw[status] ?? 0;
  return counts;
}

/**
 * Backend statuses that count as an automatic match. Only these two come out of
 * the engine without needing a human: `duplicate`, `exception` and
 * `needs_review` all still require review.
 */
export function isAutoMatched(status: string): boolean {
  return status === 'matched' || status === 'matched_with_variance';
}

/**
 * A match can be confirmed only when the engine produced a settled decision
 * (`matched` / `matched_with_variance`). `duplicate`, `exception` and
 * `needs_review` are unresolved decisions that are worked through the exception
 * queue, so the Matching Center must not offer a confirmation for them.
 */
export function isConfirmableMatch(status: string): boolean {
  return isAutoMatched(status);
}

/**
 * Auto-match percentage over per-status totals, formatted to one decimal
 * ("40.0%"). Taking counts rather than a row list keeps the rate correct when
 * the record set is larger than a single page.
 */
export function autoMatchRate(counts: Partial<Record<MatchStatus, number>>): string {
  const total = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);
  if (total === 0) return '0%';
  const matched = (counts.matched ?? 0) + (counts.matched_with_variance ?? 0);
  return `${((matched / total) * 100).toFixed(1)}%`;
}

/** Dashboard counter bucket for a backend match status. */
export type MatchBucket = 'matched' | 'unmatched' | 'exception';

/**
 * Bucket a match status for the dashboard counters. `matched_with_variance` is a
 * successful automatic match (consistent with Matching Center); only
 * `exception` and `duplicate` are failures, everything else is pending review.
 */
export function classifyMatch(status: string): MatchBucket {
  if (isAutoMatched(status)) return 'matched';
  if (status === 'exception' || status === 'duplicate') return 'exception';
  return 'unmatched';
}

/** The four severity buckets the exception UI shows. */
export type Severity = 'critical' | 'high' | 'medium' | 'low';

/** Normalise an unknown severity string into one of the four buckets. */
export function asSeverity(value: string | null): Severity {
  return value === 'critical' || value === 'high' || value === 'low' ? value : 'medium';
}

/** Count records per severity, keeping the four buckets distinct (never merged). */
export function countBySeverity(values: Array<string | null>): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const value of values) counts[asSeverity(value)] += 1;
  return counts;
}

/**
 * Fold a backend `{severity: count}` aggregate into the four distinct buckets.
 * Unlike `countBySeverity` this aggregates a summary that already spans every
 * record, so it stays correct past the page the UI fetches.
 */
export function severityCountsFromAggregate(
  aggregate: Record<string, number>,
): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const [severity, value] of Object.entries(aggregate)) {
    counts[asSeverity(severity)] += value ?? 0;
  }
  return counts;
}

/** Size of the active exception queue: open + acknowledged. */
export function activeExceptionCount(summary: {
  open?: number | null;
  acknowledged?: number | null;
}): number {
  return (summary.open ?? 0) + (summary.acknowledged ?? 0);
}
