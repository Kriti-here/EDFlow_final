// Audit log data from the existing backend endpoint:
//   GET /audit?limit=N -> { chain_ok, first_bad_row, entries: [...] }
//
// Read-only: the audit log is append-only on the server and is never edited here.

import { fetchJson } from './api';

/** One hash-chained audit row as returned by GET /audit. */
export interface AuditEntry {
  id: number;
  /** ISO-8601 UTC timestamp of the action. */
  ts: string;
  /** Who performed the action ("user", "system", "paypal", ...). */
  actor: string;
  /** Machine action key, e.g. "invoice.created". */
  action: string;
  /** Entity type the action touched, e.g. "invoice". */
  entity: string;
  entity_id: number | null;
  /** First 12 characters of the row hash (the server truncates it). */
  hash: string;
}

export interface AuditLogResponse {
  /** True when the hash chain verifies end to end. */
  chain_ok: boolean;
  /** Id of the first row that breaks the chain, or null when intact. */
  first_bad_row: number | null;
  entries: AuditEntry[];
}

/** Fetch the most recent audit rows, newest first. */
export function fetchAuditLog(limit = 100): Promise<AuditLogResponse> {
  return fetchJson<AuditLogResponse>('/audit', { query: { limit } });
}
