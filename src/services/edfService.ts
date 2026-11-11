// Service to fetch EDF packs from backend API
// Backend: GET /edf-packs         → {count: number, packs: EDFPackRecord[]}
//          GET /edf-packs/summary → summary counts by status
//
// EDFPack fields (from backend pack_out):
//   id, period{year,month,start,end}, status, line_count, engine_version,
//   is_synthetic, pack_ready, validation, totals, exporter,
//   approved_snapshot_hash, approved_at, approved_by,
//   exported_at, exported_by, note, created_at, updated_at

import type { EDFPack, PackMetric, ActiveCompilation } from '../types/edf';
import { apiUrl } from './api';

/** Raw EDF pack record from backend (list form, snapshot omitted) */
export interface BackendEDFPack {
  id: number;
  period: { year: number; month: number; start: string | null; end: string | null };
  status: string;
  line_count: number | null;
  engine_version: string | null;
  is_synthetic: boolean;
  pack_ready: boolean;
  validation: Record<string, unknown> | null;
  totals: Record<string, unknown> | null;
  exporter: Record<string, unknown> | null;
  approved_snapshot_hash: string | null;
  approved_at: string | null;
  approved_by: string | null;
  exported_at: string | null;
  exported_by: string | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BackendEDFPackListResponse {
  count: number;
  packs: BackendEDFPack[];
}

/** Backend /edf-packs/summary response */
export interface BackendEDFSummary {
  total: number;
  by_status: Record<string, number>;
}

/** UI-ready response consumed by EDFPacks page */
export interface EDFPacksResponse {
  metrics: PackMetric[];
  activeCompilation: ActiveCompilation | null;
  packs: EDFPack[];
}

/** Map backend status string to UI EDFPackStatus */
function toPackStatus(status: string): 'ready' | 'draft' | 'blocked' | 'exported' {
  switch (status) {
    case 'approved': return 'ready';
    case 'exported': return 'exported';
    case 'blocked':  return 'blocked';
    default:         return 'draft';
  }
}

/** Format year+month as a readable label */
function periodLabel(p: BackendEDFPack['period']): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[p.month - 1] ?? p.month} ${p.year}`;
}

/** Adapt a BackendEDFPack to the UI EDFPack shape */
function toUIPack(r: BackendEDFPack): EDFPack {
  const uiStatus = toPackStatus(r.status);
  const progress =
    r.validation && typeof r.validation['progress'] === 'number'
      ? r.validation['progress'] as number
      : uiStatus === 'ready' || uiStatus === 'exported' ? 100 : 50;

  return {
    id: String(r.id),
    packNumber: `#EDF-${r.id}`,
    title: periodLabel(r.period),
    invoiceCount: r.line_count !== null ? `${r.line_count} lines` : 'Draft',
    invoiceRefs: [],
    client: (r.exporter as any)?.legal_name ?? '—',
    status: uiStatus,
    value: (r.totals as any)?.total_inr ?? '—',
    currency: 'INR',
    purposeCodes: [],
    progress,
    progressLabel: `${progress}%`,
    validationProgress: progress,
    validationLabel: `${progress}%`,
    complianceChecks: [],
    signOffs: [],
    edpmsAck: r.approved_snapshot_hash ?? undefined,
    lodgedDate: r.exported_at ?? undefined,
  };
}

/** Build summary metric cards from summary counts */
function buildMetrics(summary: BackendEDFSummary): PackMetric[] {
  const by = summary.by_status ?? {};
  return [
    { label: 'Ready to Export', value: by['approved'] ?? 0,  subtitle: 'Packs', icon: 'rule_folder',  status: 'ready' },
    { label: 'Drafting',        value: by['draft'] ?? 0,     subtitle: 'Pack',  icon: 'pending',      status: 'draft' },
    { label: 'Blocked',         value: by['blocked'] ?? 0,   subtitle: 'Alert', icon: 'warning',      status: 'blocked' },
    { label: 'Filed & Sealed',  value: by['exported'] ?? 0,  subtitle: 'Merkle ✓', icon: 'verified_user', status: 'exported' },
  ];
}

/**
 * Fetch EDF packs from backend.
 * Calls GET /edf-packs and GET /edf-packs/summary in parallel.
 */
export async function fetchEDFPacks(): Promise<EDFPacksResponse> {
  const [listRes, summaryRes] = await Promise.all([
    fetch(apiUrl('/edf-packs', { limit: 200 })),
    fetch(apiUrl('/edf-packs/summary')),
  ]);

  if (!listRes.ok) {
    const text = await listRes.text();
    throw new Error(`Failed to fetch EDF packs: ${listRes.status} ${text}`);
  }
  if (!summaryRes.ok) {
    const text = await summaryRes.text();
    throw new Error(`Failed to fetch EDF summary: ${summaryRes.status} ${text}`);
  }

  const listData: BackendEDFPackListResponse = await listRes.json();
  const summary: BackendEDFSummary = await summaryRes.json();

  const metrics = buildMetrics(summary);
  const packs = listData.packs.map(toUIPack);

  // Find the most recent draft pack as the "active compilation"
  const activePack = listData.packs.find((p) => p.status === 'draft') ?? null;
  const activeCompilation: ActiveCompilation | null = activePack
    ? {
        packId: String(activePack.id),
        packNumber: `EDF-${activePack.id}`,
        client: (activePack.exporter as any)?.legal_name ?? '—',
        description: `${periodLabel(activePack.period)} draft`,
        overallProgress: 50,
        checklist: [],
      }
    : null;

  return { metrics, activeCompilation, packs };
}
