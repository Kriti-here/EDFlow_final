// Service to fetch match records from backend API
// Backend: GET /matches → {count: number, matches: MatchRecord[]}
//
// MatchRecord fields (from backend match_out):
//   id, fira_line_id, invoice_id, payment_id, match_type, status,
//   confidence_bp, confidence_band, candidates, score, rationale,
//   duplicate_of_line_id, split_group, split_part, split_parts_total,
//   fx_expected_rate, fx_actual_rate, fx_variance_bp, engine_version,
//   is_synthetic, confirmed_at, confirmed_by, created_at, updated_at

import { apiUrl } from './api';

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
  count: number;
  matches: BackendMatchRecord[];
}

export type MatchStatus = 'matched' | 'unmatched' | 'partial' | 'exception';

/** UI-friendly match pair adapted from BackendMatchRecord */
export interface MatchPair {
  id: string;
  invoiceRef: string;
  firaRef: string;
  client: string;
  currency: string;
  invoiceAmount: string;
  receivedAmount: string;
  status: MatchStatus;
  confidence: string;
  matchedAt: string;
  purposeCode?: string;
  variance?: string;
  bank?: string;
  note?: string;
}

export interface MatchSummary {
  totalInvoices: number;
  matched: number;
  unmatched: number;
  exceptions: number;
  autoMatchRate: string;
}

export interface MatchingResultsResponse {
  summary: MatchSummary;
  pairs: MatchPair[];
}

/** Map backend status values to UI MatchStatus */
function toMatchStatus(status: string | null): MatchStatus {
  switch (status) {
    case 'matched':
    case 'confirmed':
      return 'matched';
    case 'partial':
    case 'split':
      return 'partial';
    case 'exception':
    case 'duplicate':
      return 'exception';
    default:
      return 'unmatched';
  }
}

/** Derive a confidence percentage string from confidence_bp (basis points, 0–10000) */
function bpToPercent(bp: number | null): string {
  if (bp === null) return '—';
  return `${(bp / 100).toFixed(1)}%`;
}

/** Adapt raw backend records to the UI response shape */
function adaptMatches(raw: BackendMatchListResponse): MatchingResultsResponse {
  const pairs: MatchPair[] = raw.matches.map((r) => {
    const uiStatus = toMatchStatus(r.status);
    return {
      id: String(r.id),
      invoiceRef: r.invoice_id !== null ? `INV-${r.invoice_id}` : '—',
      firaRef: r.fira_line_id !== null ? `FIRA-LINE-${r.fira_line_id}` : '—',
      client: '—',
      currency: '—',
      invoiceAmount: '—',
      receivedAmount: '—',
      status: uiStatus,
      confidence: bpToPercent(r.confidence_bp),
      matchedAt: r.confirmed_at ?? r.created_at ?? '—',
      variance:
        r.fx_variance_bp !== null ? `${(r.fx_variance_bp / 100).toFixed(2)} bp` : undefined,
      note: r.rationale ?? undefined,
    };
  });

  const matched = pairs.filter((p) => p.status === 'matched').length;
  const unmatched = pairs.filter((p) => p.status === 'unmatched').length;
  const exceptions = pairs.filter((p) => p.status === 'exception').length;
  const total = raw.count;
  const autoMatchRate =
    total > 0 ? `${((matched / total) * 100).toFixed(1)}%` : '0%';

  return {
    summary: {
      totalInvoices: total,
      matched,
      unmatched,
      exceptions,
      autoMatchRate,
    },
    pairs,
  };
}

/** Fetch all match records from GET /matches and adapt to UI shape. */
export async function fetchMatchingResults(): Promise<MatchingResultsResponse> {
  const response = await fetch(apiUrl('/matches'));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch matching results: ${response.status} ${text}`);
  }
  const raw: BackendMatchListResponse = await response.json();
  return adaptMatches(raw);
}
