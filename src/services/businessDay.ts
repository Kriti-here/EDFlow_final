// Indian business-day boundaries, shared by the exception service and its tests.
//
// "Today" for exception reporting is the Indian business calendar day
// (Asia/Kolkata), not the UTC day: the exporter and its CA work to IST, so a row
// resolved after 05:30 UTC belongs to the next Indian day.
//
// Asia/Kolkata is a fixed +05:30 offset with no daylight saving, so a constant
// offset is exact and keeps this module free of any timezone-database
// dependency. Stored timestamps stay in UTC; this module only converts the IST
// day edges into UTC instants for the backend query, matching the boundaries the
// backend uses for `resolved_today`.

/** India Standard Time is UTC+05:30 all year (no daylight saving). */
const IST_OFFSET_MINUTES = 5 * 60 + 30;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface DayBounds {
  /** Inclusive lower bound (IST midnight) as a UTC ISO instant. */
  since: string;
  /** Exclusive upper bound (the next IST midnight) as a UTC ISO instant. */
  until: string;
}

/**
 * The current Indian business day as the UTC interval `[since, until)`.
 * `since` is today's IST midnight and `until` is tomorrow's IST midnight.
 */
export function istDayBoundsUtc(now: Date = new Date()): DayBounds {
  // Shifting the instant by the offset makes the UTC accessors read IST wall time.
  const istWallClock = new Date(now.getTime() + IST_OFFSET_MINUTES * MINUTE_MS);
  const istMidnightMs = Date.UTC(
    istWallClock.getUTCFullYear(),
    istWallClock.getUTCMonth(),
    istWallClock.getUTCDate(),
  );
  const sinceMs = istMidnightMs - IST_OFFSET_MINUTES * MINUTE_MS;
  return {
    since: new Date(sinceMs).toISOString(),
    until: new Date(sinceMs + DAY_MS).toISOString(),
  };
}
