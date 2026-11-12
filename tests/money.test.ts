// Regression tests for the exact-decimal money helpers (src/services/money.ts).
//
// Run with Node's built-in test runner and native TypeScript stripping:
//   node --test
//
// The headline case reproduces the dashboard crash: formatMoney() emitted the
// grouped string "1,300", and parseMoney() re-read it, throwing
// "Cannot convert 1,300 to a BigInt".

import assert from 'node:assert/strict';
import test from 'node:test';

import { SCALE, dominantCurrency, formatMoney, parseMoney } from '../src/services/money.ts';

test('parseMoney reads a comma-grouped value ("1,300")', () => {
  assert.equal(parseMoney('1,300'), 1300n * SCALE);
});

test('parseMoney keeps exact precision for grouped decimals', () => {
  assert.equal(parseMoney('1,234,567.89'), 1234567n * SCALE + 890000n);
});

test('a plain decimal and its grouped form parse equal', () => {
  assert.equal(parseMoney('1300.00'), parseMoney('1,300'));
});

test('parseMoney preserves sign with grouping commas', () => {
  assert.equal(parseMoney('-1,300.50'), -(1300n * SCALE + 500000n));
});

test('parseMoney maps absent values to zero', () => {
  assert.equal(parseMoney(null), 0n);
  assert.equal(parseMoney(''), 0n);
  assert.equal(parseMoney('   '), 0n);
});

test('parseMoney throws on malformed input instead of inventing an amount', () => {
  for (const bad of ['abc', '1.2.3', '1,2,3.4.5', '1 300', '$1,300', '--5']) {
    assert.throws(() => parseMoney(bad), /Unparseable monetary value/);
  }
});

test('decimal arithmetic stays exact (no float drift)', () => {
  assert.equal(parseMoney('0.1') + parseMoney('0.2'), parseMoney('0.3'));
});

test('formatMoney groups thousands', () => {
  assert.equal(formatMoney(1300n * SCALE), '1,300');
});

test('formatMoney output round-trips back through parseMoney exactly', () => {
  const scaled = parseMoney('1234567.891234');
  assert.equal(parseMoney(formatMoney(scaled)), scaled);
});

test('dominantCurrency reads grouped totals without crashing (crash regression)', () => {
  const totals = { USD: formatMoney(1300n * SCALE), EUR: formatMoney(40n * SCALE) };
  assert.equal(dominantCurrency(totals), 'USD');
});
