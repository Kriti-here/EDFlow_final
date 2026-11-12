// Tests for the Indian business-day bounds (src/services/businessDay.ts).
//
// Run with Node's built-in test runner and native TypeScript stripping:
//   node --test
//
// The module is deliberately import-free, so Node's ESM resolver can load it
// directly. These cover the IST midnight edges and, crucially, the UTC-date
// transition: between 18:30 and 24:00 UTC the Indian calendar day is already the
// next date, which is exactly the case the old UTC-midnight boundary handled
// wrongly.

import assert from 'node:assert/strict';
import test from 'node:test';

import { istDayBoundsUtc } from '../src/services/businessDay.ts';

/** Build an instant from a UTC ISO string. */
const at = (iso: string): Date => new Date(iso);

test('a mid-day IST moment maps to the same IST calendar day', () => {
  // 10:00 UTC on 12 Nov is 15:30 IST on 12 Nov.
  const { since, until } = istDayBoundsUtc(at('2026-11-12T10:00:00.000Z'));
  assert.equal(since, '2026-11-11T18:30:00.000Z');
  assert.equal(until, '2026-11-12T18:30:00.000Z');
});

test('the UTC-date transition rolls to the next Indian day after 18:30 UTC', () => {
  // 19:00 UTC on 12 Nov is 00:30 IST on 13 Nov, so the Indian day is the 13th
  // even though the UTC date is still the 12th.
  const { since, until } = istDayBoundsUtc(at('2026-11-12T19:00:00.000Z'));
  assert.equal(since, '2026-11-12T18:30:00.000Z');
  assert.equal(until, '2026-11-13T18:30:00.000Z');
});

test('the lower bound is inclusive right at IST midnight', () => {
  // Exactly 00:00 IST on 13 Nov.
  const { since, until } = istDayBoundsUtc(at('2026-11-12T18:30:00.000Z'));
  assert.equal(since, '2026-11-12T18:30:00.000Z');
  assert.equal(until, '2026-11-13T18:30:00.000Z');
});

test('one millisecond before IST midnight still belongs to the previous day', () => {
  // 23:59:59.999 IST on 12 Nov.
  const { since } = istDayBoundsUtc(at('2026-11-12T18:29:59.999Z'));
  assert.equal(since, '2026-11-11T18:30:00.000Z');
});

test('the window is exactly 24 hours and its bounds are ordered', () => {
  const { since, until } = istDayBoundsUtc(at('2026-11-12T03:15:00.000Z'));
  const span = new Date(until).getTime() - new Date(since).getTime();
  assert.equal(span, 24 * 60 * 60 * 1000);
  assert.ok(new Date(since).getTime() < new Date(until).getTime());
});

test('the interval is half-open: since is inside, until is excluded', () => {
  const { since, until } = istDayBoundsUtc(at('2026-11-12T10:00:00.000Z'));
  const lower = new Date(since).getTime();
  const upper = new Date(until).getTime();
  const inDay = (iso: string): boolean => {
    const t = new Date(iso).getTime();
    return t >= lower && t < upper;
  };
  assert.equal(inDay(since), true);
  assert.equal(inDay('2026-11-12T18:29:59.999Z'), true); // still 12 Nov IST
  assert.equal(inDay(until), false); // exactly the next IST midnight
  assert.equal(inDay('2026-11-11T18:29:59.999Z'), false); // just before the day
});

test('a UTC date and the IST date disagree across the offset window', () => {
  // Same UTC date (12 Nov), two different Indian dates.
  const before = istDayBoundsUtc(at('2026-11-12T10:00:00.000Z'));
  const after = istDayBoundsUtc(at('2026-11-12T19:00:00.000Z'));
  assert.notEqual(before.since, after.since);
});
