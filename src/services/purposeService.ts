// Service to fetch purpose recommendations from backend API
// Backend: GET /purpose-recommendations → {count: number, recommendations: Recommendation[]}
//          GET /purpose-recommendations/summary → summary counts
//
// Recommendation fields (from backend recommendation_out):
//   id, invoice_id, code, rank, confidence_bp, confidence_band, source,
//   status, score, matched_keywords, rationale, code_description,
//   code_category, code_verified, engine_version, is_synthetic,
//   accepted_at, accepted_by, rejected_at, rejected_by,
//   decision_note, last_seen_at, created_at, updated_at

import type { QueueItem, Metric } from '../types/purpose';
import { apiUrl } from './api';

/** Raw recommendation record from backend */
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

/** Backend /purpose-recommendations/summary response */
export interface BackendPurposeSummary {
  total: number;
  by_status: Record<string, number>;
  by_band: Record<string, number>;
}

/** UI-ready response consumed by PurposeAdvisor */
export interface PurposeQueueResponse {
  metrics: Metric[];
  primaryCase: null;        // complex PurposeCase not derivable from list endpoint alone
  queueItems: QueueItem[];
}

/** Convert confidence_bp (0–10000) to a percentage string */
function bpToPercent(bp: number | null): string {
  if (bp === null) return '—';
  return `${(bp / 100).toFixed(1)}%`;
}

/** Adapt a proposed backend recommendation to a UI QueueItem */
function toQueueItem(r: BackendRecommendation): QueueItem {
  return {
    id: String(r.id),
    invoiceRef: `INV-${r.invoice_id}`,
    client: `Invoice ${r.invoice_id}`,
    location: '—',
    bankTag: r.source ?? '—',
    amount: '—',
    currency: '—',
    aiFit: bpToPercent(r.confidence_bp),
    recommendedCode: {
      code: r.code,
      label: r.code_description || r.code,
      description: r.rationale ?? '',
      category: r.code_category,
      confidence: bpToPercent(r.confidence_bp),
    },
    status: r.status === 'proposed' ? 'pending' : r.status === 'accepted' ? 'approved' : 'escalated',
  };
}

/** Build summary metric cards from summary counts */
function buildMetrics(summary: BackendPurposeSummary, recs: BackendRecommendation[]): Metric[] {
  const pending = recs.filter((r) => r.status === 'proposed').length;
  const highConf = recs.filter(
    (r) => r.confidence_bp !== null && r.confidence_bp >= 9500,
  ).length;
  const divergent = recs.filter(
    (r) => r.confidence_band === 'low' || (r.confidence_bp !== null && r.confidence_bp < 7000),
  ).length;
  const approved = summary.by_status?.['accepted'] ?? 0;
  return [
    { label: 'Pending Review',  value: pending,   subtitle: 'invoices',    icon: 'pending_actions' },
    { label: 'High Conf (>95%)', value: highConf, subtitle: 'Auto-ready',  icon: 'auto_awesome',  variant: 'tertiary' },
    { label: 'CA Sign-off',      value: divergent, subtitle: 'Divergent',  icon: 'gavel',         variant: 'error' },
    { label: 'Approved Today',   value: approved,  subtitle: 'this session', icon: 'done_all',    variant: 'primary' },
  ];
}

/**
 * Fetch proposed purpose recommendations from backend.
 * Calls GET /purpose-recommendations (status=proposed) and GET /purpose-recommendations/summary.
 */
export async function fetchPurposeQueue(): Promise<PurposeQueueResponse> {
  const [listRes, summaryRes] = await Promise.all([
    fetch(apiUrl('/purpose-recommendations', { status: 'proposed', limit: 200 })),
    fetch(apiUrl('/purpose-recommendations/summary')),
  ]);

  if (!listRes.ok) {
    const text = await listRes.text();
    throw new Error(`Failed to fetch purpose recommendations: ${listRes.status} ${text}`);
  }
  if (!summaryRes.ok) {
    const text = await summaryRes.text();
    throw new Error(`Failed to fetch purpose summary: ${summaryRes.status} ${text}`);
  }

  const listData: BackendRecommendationListResponse = await listRes.json();
  const summary: BackendPurposeSummary = await summaryRes.json();

  const metrics = buildMetrics(summary, listData.recommendations);
  const queueItems = listData.recommendations.map(toQueueItem);

  return {
    metrics,
    primaryCase: null,
    queueItems,
  };
}
