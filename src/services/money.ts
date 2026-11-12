// Exact decimal money helpers, shared by every service that shows a balance.
//
// Money is never a float: a value is held as a scaled integer (6 decimal places
// of headroom) and only turned into text at the very edge of the UI. This module
// is deliberately dependency-free so the parsing rules can be unit-tested
// without pulling in the API client (which reads import.meta.env).

/** Fixed-point scale: 6 decimal places of headroom. */
export const SCALE = 1_000_000n;

/**
 * A decimal amount, optionally signed, with no grouping separators.
 * Both "1300" and "1300.00" are valid; a lone "-", "+" or "." is not.
 */
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Parse a monetary string into a scaled integer.
 *
 * Accepts plain decimals ("1300.00") and thousands-grouped values ("1,300.00"),
 * because formatMoney() emits the grouped form and callers round-trip it.
 * Absent values (null or blank) mean "no amount" and parse to 0n.
 *
 * A malformed value throws rather than silently becoming a number: inventing a
 * figure for unparseable data would show a misleading balance.
 */
export function parseMoney(value: string | null): bigint {
  if (value == null) return 0n;
  const body = value.trim().replace(/,/g, '');
  if (body === '') return 0n;
  if (!DECIMAL.test(body)) {
    throw new Error(`Unparseable monetary value: ${JSON.stringify(value)}`);
  }
  const negative = body.startsWith('-');
  const digits = body.replace(/^[+-]/, '');
  const [intPart, fracPart = ''] = digits.split('.');
  const frac = (fracPart + '000000').slice(0, 6);
  const scaled = BigInt(intPart || '0') * SCALE + BigInt(frac || '0');
  return negative ? -scaled : scaled;
}

/** Render a scaled integer back to a grouped decimal string for display. */
export function formatMoney(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const intPart = (abs / SCALE).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (abs % SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${intPart}${frac ? `.${frac}` : ''}`;
}

/** Currency with the largest absolute total, for a "headline" figure. */
export function dominantCurrency(totals: Record<string, string>): string | null {
  let best: string | null = null;
  let bestAbs = -1n;
  for (const [currency, total] of Object.entries(totals)) {
    const abs = parseMoney(total);
    const magnitude = abs < 0n ? -abs : abs;
    if (magnitude > bestAbs) {
      bestAbs = magnitude;
      best = currency;
    }
  }
  return best;
}
