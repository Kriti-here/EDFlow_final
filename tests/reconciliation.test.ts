// Tests for the pure reconciliation maths (src/services/reconciliationMath.ts).
//
// Run with Node's built-in test runner and native TypeScript stripping:
//   node --test
//
// These cover the integration fixes: the auto-match rate must count only
// `matched` + `matched_with_variance` over the backend's per-status totals (not
// just the fetched page), the dashboard must treat `matched_with_variance` as a
// success, severities stay distinct (low is never merged into medium), only
// settled statuses can be confirmed, and the active exception queue is
// open + acknowledged.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MATCH_STATUSES,
  activeExceptionCount,
  asSeverity,
  autoMatchRate,
  classifyMatch,
  countBySeverity,
  emptyStatusCounts,
  isAutoMatched,
  isConfirmableMatch,
  normalizeStatusCounts,
  severityCountsFromAggregate,
} from '../src/services/reconciliationMath.ts';

// ---- status totals -----------------------------------------------------------

test('emptyStatusCounts starts every known status at zero', () => {
  assert.deepEqual(emptyStatusCounts(), {
    matched: 0,
    matched_with_variance: 0,
    duplicate: 0,
    exception: 0,
    needs_review: 0,
  });
});

test('MATCH_STATUSES keeps all five statuses distinct', () => {
  assert.deepEqual(MATCH_STATUSES, [
    'matched',
    'matched_with_variance',
    'duplicate',
    'exception',
    'needs_review',
  ]);
});

test('normalizeStatusCounts fills missing statuses and ignores unknown keys', () => {
  const counts = normalizeStatusCounts({ matched: 6, duplicate: 2, bogus: 9 });
  assert.deepEqual(counts, {
    matched: 6,
    matched_with_variance: 0,
    duplicate: 2,
    exception: 0,
    needs_review: 0,
  });
});

// ---- auto-match rate ---------------------------------------------------------

test('only matched and matched_with_variance count as auto-matched', () => {
  assert.equal(isAutoMatched('matched'), true);
  assert.equal(isAutoMatched('matched_with_variance'), true);
  for (const status of ['duplicate', 'exception', 'needs_review']) {
    assert.equal(isAutoMatched(status), false);
  }
});

test('autoMatchRate counts only the two auto-matched statuses', () => {
  // 2 auto-matched / 4 total = 50.0%; needs_review must not inflate the rate.
  assert.equal(
    autoMatchRate({ matched: 1, matched_with_variance: 1, needs_review: 1, exception: 1 }),
    '50.0%',
  );
});

test('autoMatchRate is 100% when everything matched (with or without variance)', () => {
  assert.equal(autoMatchRate({ matched: 3, matched_with_variance: 1 }), '100.0%');
});

test('autoMatchRate is 0% for an empty set and for a review-only set', () => {
  assert.equal(autoMatchRate({}), '0%');
  assert.equal(autoMatchRate({ needs_review: 2, duplicate: 1, exception: 1 }), '0.0%');
});

test('autoMatchRate stays correct past the fetched page (uses full totals)', () => {
  // 700 records: 650 settle automatically, 50 need a person -> 92.9%.
  const counts = {
    matched: 600,
    matched_with_variance: 50,
    duplicate: 20,
    exception: 15,
    needs_review: 15,
  };
  assert.equal(autoMatchRate(counts), '92.9%');
});

// ---- confirmation eligibility ------------------------------------------------

test('isConfirmableMatch allows only settled statuses', () => {
  assert.equal(isConfirmableMatch('matched'), true);
  assert.equal(isConfirmableMatch('matched_with_variance'), true);
});

test('isConfirmableMatch rejects duplicate, exception and needs_review', () => {
  assert.equal(isConfirmableMatch('duplicate'), false);
  assert.equal(isConfirmableMatch('exception'), false);
  assert.equal(isConfirmableMatch('needs_review'), false);
  // Unknown statuses are treated as needing review, never confirmable.
  assert.equal(isConfirmableMatch('something-else'), false);
});

test('isConfirmableMatch agrees with isAutoMatched for every known status', () => {
  for (const status of MATCH_STATUSES) {
    assert.equal(isConfirmableMatch(status), isAutoMatched(status));
  }
});

// ---- dashboard match classification -----------------------------------------

test('matched_with_variance classifies as a successful match', () => {
  assert.equal(classifyMatch('matched'), 'matched');
  assert.equal(classifyMatch('matched_with_variance'), 'matched');
});

test('duplicate and exception classify as exceptions', () => {
  assert.equal(classifyMatch('duplicate'), 'exception');
  assert.equal(classifyMatch('exception'), 'exception');
});

test('needs_review classifies as unmatched (pending review)', () => {
  assert.equal(classifyMatch('needs_review'), 'unmatched');
});

// ---- severity ----------------------------------------------------------------

test('asSeverity keeps the four severities distinct and defaults to medium', () => {
  assert.equal(asSeverity('critical'), 'critical');
  assert.equal(asSeverity('high'), 'high');
  assert.equal(asSeverity('medium'), 'medium');
  assert.equal(asSeverity('low'), 'low');
  assert.equal(asSeverity(null), 'medium');
  assert.equal(asSeverity('something-else'), 'medium');
});

test('countBySeverity never folds low into medium', () => {
  const counts = countBySeverity(['low', 'low', 'medium', 'critical', 'high', 'high']);
  assert.deepEqual(counts, { critical: 1, high: 2, medium: 1, low: 2 });
});

test('severityCountsFromAggregate folds a full backend aggregate into buckets', () => {
  const counts = severityCountsFromAggregate({ critical: 4, high: 12, medium: 30, low: 7 });
  assert.deepEqual(counts, { critical: 4, high: 12, medium: 30, low: 7 });
});

test('severityCountsFromAggregate keeps low distinct past the 200-row page', () => {
  // 250 active exceptions: the UI only fetches 200 rows, but the aggregate is complete.
  const counts = severityCountsFromAggregate({ critical: 1, high: 2, medium: 197, low: 50 });
  assert.deepEqual(counts, { critical: 1, high: 2, medium: 197, low: 50 });
});

// ---- active exception queue --------------------------------------------------

test('activeExceptionCount is open + acknowledged', () => {
  assert.equal(activeExceptionCount({ open: 3, acknowledged: 2 }), 5);
});

test('activeExceptionCount tolerates missing or null counts', () => {
  assert.equal(activeExceptionCount({ open: 4 }), 4);
  assert.equal(activeExceptionCount({ acknowledged: null }), 0);
  assert.equal(activeExceptionCount({}), 0);
});
