// Purpose-code adviser service.
// Backend: POST /purpose-adviser/run                    → derive/refresh proposals
//          GET  /purpose-recommendations                → {count, recommendations: []}
//          GET  /purpose-recommendations/summary        → {total, by_status, by_band}
//          POST /purpose-recommendations/{id}/accept    → commits Invoice.purpose_code
//          POST /purpose-recommendations/{id}/reject
//          GET  /rules                                  → the loaded rules catalogue
//
// Recommendation fields (from backend recommendation_out):
//   id, invoice_id, code, rank, confidence_bp, confidence_band, source, status,
//   score, matched_keywords, rationale, code_description, code_category,
//   code_verified, engine_version, is_synthetic, accepted_at/by, rejected_at/by,
//   decision_note, last_seen_at, created_at, updated_at

import { fetchJson, postJson, settleResult } from './api';
import { formatMoney, parseMoney } from './dashboardService';
import type { Metric, PurposeCase, PurposeCode, PurposeCodeReference, QueueItem } from '../types/purpose';

/** Raw recommendation record from the backend. */
export interface BackendRecommendation {
  id: number;
  invoice_id: number;
  code: string;
  rank: number;
  confidence_bp: number | null;
  confidence_band: string | null;
  source: string | null;
  status: string;
  score: Record<string, unknown>;
  matched_keywords: string[];
  rationale: string | null;
  code_description: string;
  code_category: string;
  code_verified: boolean;
  engine_version: string | null;
  is_synthetic: boolean;
  accepted_at: string | null;
  accepted_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  decision_note: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BackendRecommendationListResponse {
  count: number;
  recommendations: BackendRecommendation[];
}

/** Backend /purpose-recommendations/summary response. */
export interface BackendPurposeSummary {
  total: number;
  by_status: Record<string, number>;
  by_band: Record<string, number>;
}

/** One purpose code exactly as it is stored in rules/india_export.yaml. */
export interface RulesPurposeCode {
  code: string;
  description: string | null;
  category: string | null;
  verified: boolean;
  source: string | null;
  last_verified: string | null;
}

/** The subset of GET /rules this page needs. */
export interface RulesSummary {
  source: string;
  version: string | null;
  last_updated: string | null;
  verification_status: string | null;
  verified: boolean;
  last_verified: string | null;
  config_path?: string;
  purpose_codes: RulesPurposeCode[];
}

/** Catalogue strip below the queue. */
export interface PurposeReferencesResponse {
  references: PurposeCodeReference[];
  /** Rules version from the YAML, e.g. "1.0.0". */
  version: string;
  /** Where the rules were loaded from (shown as the source stamp). */
  sourcePath: string;
  /** YYYY-MM-DD the rules file was last updated. */
  lastUpdated: string;
  /** False while any rules entry is still marked unverified. */
  verified: boolean;
}

/** UI-ready response consumed by PurposeAdvisor. */
export interface PurposeQueueResponse {
  metrics: Metric[];
  primaryCase: PurposeCase | null;
  queueItems: QueueItem[];
  /** How many proposals are waiting for a human decision. */
  pendingCount: number;
  engineVersion: string | null;
  /** Readable failure message per endpoint that could not be loaded. */
  errors: {
    /** GET /purpose-recommendations (the queue itself). */
    recommendations: string | null;
    /** GET /purpose-recommendations/summary (the metric cards). */
    summary: string | null;
  };
}

/** Minimal invoice shape used to label the queue rows. */
interface InvoiceLookup {
  id: number;
  number: string;
  client: string;
  client_country: string | null;
  currency: string;
  amount: string;
  purpose_code: string | null;
}

/** Accept/reject response: the recommendation plus the invoice's new code. */
export interface RecommendationDecision extends BackendRecommendation {
  invoice_purpose_code: string | null;
  invoice_purpose_code_source: string | null;
}

const PILL_COLORS = ['primary', 'secondary', 'tertiary', 'on-surface'];

/** Convert confidence_bp (0–10000) to a percentage string. */
function bpToPercent(bp: number | null): string {
  if (bp === null) return '—';
  return `${(bp / 100).toFixed(1)}%`;
}

/** "12 Nov 2026" from an ISO timestamp. */
function humanDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Pill label for a purpose code: the leading clause of the RBI description.
 * Descriptions can run to a full sentence, which would blow up the pill row.
 */
function shortLabel(description: string | null, code: string): string {
  if (!description) return code;
  const head = description.split(/[(;]/, 1)[0].replace(/\.$/, '').trim();
  if (head.length <= 42) return head;
  return `${head.slice(0, 41).trimEnd()}…`;
}

/** Status used by the queue rows; escalations stay visible. */
function queueStatus(status: string): QueueItem['status'] {
  if (status === 'proposed') return 'pending';
  if (status === 'accepted') return 'approved';
  return 'escalated';
}

/** The purpose code block every row/card renders. */
function purposeCode(rec: BackendRecommendation): PurposeCode {
  return {
    code: rec.code,
    label: rec.code_description || rec.code,
    description: rec.rationale ?? '',
    category: rec.code_category,
    confidence: bpToPercent(rec.confidence_bp),
    verified: rec.code_verified,
    source: rec.source ?? undefined,
  };
}

/** Build the summary metric cards from the summary counts and the loaded rows. */
function buildMetrics(summary: BackendPurposeSummary, recs: BackendRecommendation[]): Metric[] {
  const pending = summary.by_status?.proposed ?? recs.filter((r) => r.status === 'proposed').length;
  const highConf = recs.filter((r) => r.status === 'proposed' && (r.confidence_bp ?? 0) >= 9500).length;
  const divergent = recs.filter(
    (r) => r.status === 'proposed' && ((r.confidence_band ?? '') === 'low' || (r.confidence_bp ?? 0) < 7000),
  ).length;
  return [
    { label: 'Pending Review', value: pending, subtitle: 'proposals', icon: 'pending_actions' },
    { label: 'High Conf (>95%)', value: highConf, subtitle: 'ready to accept', icon: 'auto_awesome', variant: 'tertiary' },
    { label: 'Low Confidence', value: divergent, subtitle: 'check manually', icon: 'gavel', variant: 'error' },
    { label: 'Accepted', value: summary.by_status?.accepted ?? 0, subtitle: 'committed to invoices', icon: 'done_all', variant: 'primary' },
  ];
}

/**
 * Build the "Priority Investigation" card from the highest-confidence proposal.
 * Alternatives and evidence come from the same recommendation set, so nothing
 * on the card is invented.
 */
function buildPrimaryCase(
  recs: BackendRecommendation[],
  invoices: Map<number, InvoiceLookup>,
): PurposeCase | null {
  const proposed = recs.filter((rec) => rec.status === 'proposed');
  if (proposed.length === 0) return null;
  const top = [...proposed].sort((a, b) => (b.confidence_bp ?? 0) - (a.confidence_bp ?? 0))[0];
  const invoice = invoices.get(top.invoice_id);
  const alternatives = proposed
    .filter((rec) => rec.invoice_id === top.invoice_id && rec.id !== top.id)
    .sort((a, b) => (b.confidence_bp ?? 0) - (a.confidence_bp ?? 0));

  return {
    id: String(top.id),
    invoiceRef: invoice?.number ?? `INV-${top.invoice_id}`,
    client: invoice?.client ?? `Invoice ${top.invoice_id}`,
    location: invoice?.client_country ?? '',
    amount: invoice ? `${invoice.currency} ${formatMoney(parseMoney(invoice.amount))}`.trim() : '',
    currency: invoice?.currency ?? '',
    direction: '',
    recommendedCode: purposeCode(top),
    regulatoryReference: top.code_verified ? 'rules/india_export.yaml (verified)' : 'rules/india_export.yaml (unverified)',
    alternativeCodes: alternatives.map(purposeCode),
    // Each matched keyword is a real input the adviser scored, so it is shown as
    // evidence rather than a fabricated provenance trail.
    evidence: (top.matched_keywords ?? []).map((keyword, index) => ({
      id: `keyword-${index}`,
      icon: 'label',
      title: `Keyword match #${index + 1}`,
      description: keyword,
      status: 'match' as const,
    })),
    aiConfidence: bpToPercent(top.confidence_bp),
    aiEngine: top.engine_version ?? 'n/a',
    aiSuggestion: top.rationale ?? 'No rationale recorded for this proposal.',
    aiBand: top.confidence_band ?? undefined,
    aiStatus: top.status,
  };
}

/**
 * Load the proposed purpose codes, the summary counts and the invoice labels.
 * GET /invoices is tolerated: without it rows fall back to "Invoice #id". Each
 * other endpoint reports its own failure through `errors` so one bad request
 * cannot hide the parts of the queue that loaded.
 */
export async function fetchPurposeQueue(): Promise<PurposeQueueResponse> {
  const [listResult, summaryResult, invoiceResult] = await Promise.allSettled([
    fetchJson<BackendRecommendationListResponse>('/purpose-recommendations', {
      query: { limit: 500 },
    }),
    fetchJson<BackendPurposeSummary>('/purpose-recommendations/summary'),
    fetchJson<InvoiceLookup[]>('/invoices'),
  ]);

  const list = settleResult(listResult);
  const summary = settleResult(summaryResult);
  // Invoice labels are cosmetic: a failure costs readable clients, not rows.
  const invoices = settleResult(invoiceResult).data ?? [];

  const lookups = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const recommendations = list.data?.recommendations ?? [];
  const proposed = recommendations
    .filter((rec) => rec.status === 'proposed')
    .sort((a, b) => (b.confidence_bp ?? 0) - (a.confidence_bp ?? 0));

  const queueItems: QueueItem[] = proposed.map((rec) => {
    const invoice = lookups.get(rec.invoice_id);
    return {
      id: String(rec.id),
      invoiceRef: invoice?.number ?? `INV-${rec.invoice_id}`,
      client: invoice?.client ?? `Invoice ${rec.invoice_id}`,
      location: invoice?.client_country ?? '',
      bankTag: `Adviser: ${rec.source ?? 'rules'} · rank ${rec.rank}`,
      amount: invoice ? formatMoney(parseMoney(invoice.amount)) : '',
      currency: invoice?.currency ?? '',
      aiFit: bpToPercent(rec.confidence_bp),
      recommendedCode: purposeCode(rec),
      status: queueStatus(rec.status),
    };
  });

  return {
    metrics: summary.data ? buildMetrics(summary.data, recommendations) : [],
    primaryCase: buildPrimaryCase(recommendations, lookups),
    queueItems,
    pendingCount: summary.data?.by_status?.proposed ?? queueItems.length,
    engineVersion: proposed[0]?.engine_version ?? null,
    errors: { recommendations: list.error, summary: summary.error },
  };
}

/** The purpose-code catalogue and rules metadata from GET /rules. */
export async function fetchPurposeReferences(): Promise<PurposeReferencesResponse> {
  const rules = await fetchJson<RulesSummary>('/rules');
  const codes = rules.purpose_codes ?? [];
  return {
    references: codes.map((entry, index) => ({
      code: entry.code,
      label: shortLabel(entry.description, entry.code),
      description: entry.description ?? '',
      color: PILL_COLORS[index % PILL_COLORS.length],
      verified: entry.verified,
      source: entry.source ?? undefined,
      lastVerified: entry.last_verified ?? undefined,
    })),
    version: rules.version ?? rules.last_updated ?? 'n/a',
    sourcePath: rules.config_path ?? rules.source,
    lastUpdated: humanDate(rules.last_updated),
    verified: Boolean(rules.verified),
  };
}

/** Derive or refresh the code proposals for every invoice (or just one). */
export function runPurposeAdviser(invoiceId?: number): Promise<Record<string, unknown>> {
  return postJson<Record<string, unknown>>(
    '/purpose-adviser/run',
    {},
    invoiceId === undefined ? {} : { query: { invoice_id: invoiceId } },
  );
}

/** Accept a proposal; this is what commits the code onto the invoice. */
export function acceptRecommendation(id: number, note?: string): Promise<RecommendationDecision> {
  return postJson<RecommendationDecision>(`/purpose-recommendations/${id}/accept`, {
    note: note ?? null,
  });
}

/** Reject a proposal (the code is never written to the invoice). */
export function rejectRecommendation(id: number, note?: string): Promise<RecommendationDecision> {
  return postJson<RecommendationDecision>(`/purpose-recommendations/${id}/reject`, {
    note: note ?? null,
  });
}
