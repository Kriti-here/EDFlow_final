// Service to fetch exceptions from backend API
// Backend: GET /exceptions          → {count: number, exceptions: ExceptionRecord[]}
//          GET /exceptions/summary  → summary counts by status/category/severity
//
// ExceptionRecord fields (from backend exception_out):
//   id, category, severity, status, source, dedupe_key, match_id,
//   fira_line_id, fira_document_id, invoice_id, payment_id, confidence_bp,
//   summary, details, engine_version, is_synthetic,
//   acknowledged_at, acknowledged_by, acknowledged_note,
//   resolved_at, resolved_by, resolution_note,
//   dismissed_at, dismissed_by, dismissed_note,
//   last_seen_at, created_at, updated_at

import type { ExceptionKpi } from '../types/exceptions';

/** Raw exception record from backend */
export interface BackendException {
  id: number;
  category: string | null;
  severity: string | null;
  status: string;
  source: string | null;
  dedupe_key: string | null;
  match_id: number | null;
  fira_line_id: number | null;
  fira_document_id: number | null;
  invoice_id: number | null;
  payment_id: number | null;
  confidence_bp: number | null;
  summary: string | null;
  details: Record<string, unknown>;
  engine_version: string | null;
  is_synthetic: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  acknowledged_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  dismissed_note: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BackendExceptionListResponse {
  count: number;
  exceptions: BackendException[];
}

/** Backend /exceptions/summary response */
export interface BackendExceptionSummary {
  total: number;
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  resolved_today: number;
}

/** UI-ready response consumed by ExceptionsHub */
export interface ExceptionsResponse {
  kpis: ExceptionKpi[];
  exceptions: BackendException[];
  resolvedToday: BackendException[];
  totalResolved: number;
}

/** Build KPI metrics from summary counts */
function buildKpis(list: BackendException[], summary: BackendExceptionSummary): ExceptionKpi[] {
  const open = list.filter((e) => e.status === 'open' || e.status === 'acknowledged').length;
  const critical = list.filter((e) => e.severity === 'critical').length;
  const high = list.filter((e) => e.severity === 'high').length;
  const medium = list.filter((e) => e.severity === 'medium').length;
  return [
    { label: 'Open Exceptions', value: open,              subtitle: 'total backlog',  icon: 'rule_folder', variant: 'low' },
    { label: 'Critical',        value: critical,           subtitle: '3d EDPMS',       icon: 'warning',     variant: 'critical' },
    { label: 'High',            value: high,               subtitle: 'discrepant',     icon: 'priority_high', variant: 'high' },
    { label: 'Medium',          value: medium,             subtitle: 'inquiry',        icon: 'help',        variant: 'medium' },
    { label: 'Resolved Today',  value: summary.resolved_today ?? 0, subtitle: 'today', icon: 'verified',    variant: 'low' },
  ];
}

/**
 * Fetch open exceptions and summary from backend.
 * Calls GET /exceptions (open only) and GET /exceptions/summary in parallel.
 */
export async function fetchExceptions(): Promise<ExceptionsResponse> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '';

  const [listRes, summaryRes] = await Promise.all([
    fetch(`${base}/exceptions?status=open&limit=200`),
    fetch(`${base}/exceptions/summary`),
  ]);

  if (!listRes.ok) {
    const text = await listRes.text();
    throw new Error(`Failed to fetch exceptions: ${listRes.status} ${text}`);
  }
  if (!summaryRes.ok) {
    const text = await summaryRes.text();
    throw new Error(`Failed to fetch exceptions summary: ${summaryRes.status} ${text}`);
  }

  const listData: BackendExceptionListResponse = await listRes.json();
  const summary: BackendExceptionSummary = await summaryRes.json();

  const kpis = buildKpis(listData.exceptions, summary);

  return {
    kpis,
    exceptions: listData.exceptions,
    resolvedToday: [],
    totalResolved: summary.resolved_today ?? 0,
  };
}
