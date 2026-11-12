// Service for the EDF pack workspace. Every value the page renders comes from
// the backend; nothing here is defaulted to a plausible-looking placeholder.
//
// Backend (backend/app/routers/edf.py):
//   POST /edf-packs/generate             {year, month, note?}  → pack (idempotent)
//   GET  /edf-packs                      {count, packs[]}
//   GET  /edf-packs/summary              {count, by_status{}}
//   POST /edf-packs/{id}/validate        → pack
//   POST /edf-packs/{id}/approve         {note?} → pack
//   POST /edf-packs/{id}/revoke          {note?} → pack
//   GET  /edf-packs/{id}/export?format=json|csv|pdf
//
// A pack is a worksheet, never a filing: the export endpoint drops a file in
// the browser and never submits anything to a bank or the RBI.

import { apiUrl, fetchJson, postJson, settleResult } from './api';
import type {
  ActiveCompilation,
  ComplianceCheck,
  EDFPack,
  EDFPackExportFormat,
  EDFPackStatus,
  PackMetric,
} from '../types/edf';

/** One deterministic completeness check emitted by backend/app/services/edf_engine.py. */
export interface BackendValidationItem {
  key: string;
  /** "blocking" | "warning" | "info" */
  level: string;
  ok: boolean;
  message: string;
}

/** Currency-wise totals from the backend engine's `_totals()`. */
export interface BackendEDFTotals {
  line_count: number;
  by_currency: Record<string, string>;
  nrv_by_currency: Record<string, string>;
  total_inr: string;
  total_inr_simulated: boolean;
  unconvertible_currencies: string[];
}

/** Raw EDF pack record from backend `pack_out()` (snapshot omitted in list form). */
export interface BackendEDFPack {
  id: number;
  period: { year: number; month: number; start: string | null; end: string | null };
  status: string;
  line_count: number | null;
  engine_version: string | null;
  is_synthetic: boolean;
  pack_ready: boolean;
  validation: BackendValidationItem[] | null;
  totals: BackendEDFTotals | null;
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

/** Backend /edf-packs/summary response. */
export interface BackendEDFSummary {
  count: number;
  by_status: Record<string, number>;
}

export type { EDFPackExportFormat };

/** UI-ready response consumed by the EDFPacks page. */
export interface EDFPacksResponse {
  metrics: PackMetric[];
  activeCompilation: ActiveCompilation | null;
  packs: EDFPack[];
  /** Newest pack in the ledger, whatever its status (null when there are none). */
  latest: EDFPack | null;
  /** Lifetime pack count straight from GET /edf-packs/summary. */
  totalPacks: number;
  /** Engine version stamped on the newest pack, for the header strip. */
  engineVersion: string | null;
  /** Readable failure message per endpoint that could not be loaded. */
  errors: {
    /** GET /edf-packs (the pack board). */
    packs: string | null;
    /** GET /edf-packs/summary (the lifetime count). */
    summary: string | null;
  };
}

// ---- formatting helpers ------------------------------------------------------

const INR_FORMAT = new Intl.NumberFormat('en-IN');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format year+month as a readable label. */
function periodLabel(period: BackendEDFPack['period']): string {
  return `${MONTHS[period.month - 1] ?? period.month} ${period.year}`;
}

/** Parse the integer part of a backend money string (total_inr is quantised to 1). */
function parseInteger(value: string | null | undefined): bigint {
  if (typeof value !== 'string') return 0n;
  const match = value.trim().match(/^-?\d+/);
  return match ? BigInt(match[0]) : 0n;
}

/** Sum `totals.total_inr` across packs exactly (bigint, never a float). */
function sumInr(rows: BackendEDFPack[]): string {
  let total = 0n;
  for (const row of rows) total += parseInteger(row.totals?.total_inr);
  return `₹${INR_FORMAT.format(total)}`;
}

/** Exporter legal name, falling back to the Section 1 name+address line. */
function exporterName(exporter: Record<string, unknown> | null): string {
  const legal = exporter?.['legal_name'];
  if (typeof legal === 'string' && legal.trim()) return legal;
  const joined = exporter?.['exporters_name_address'];
  if (typeof joined === 'string' && joined.trim()) return joined.split(',')[0].trim();
  return '—';
}

// ---- backend → UI mapping ----------------------------------------------------

/**
 * Map the backend lifecycle onto the four board columns.
 *
 * `approved` is what the board calls "ready" (frozen and downloadable), a
 * draft that fails a blocking check reads as "blocked", and a revoked pack
 * stays visible as `void` rather than masquerading as a draft.
 */
function toPackStatus(status: string, ready: boolean): EDFPackStatus {
  switch (status) {
    case 'approved':
      return 'ready';
    case 'exported':
      return 'exported';
    case 'void':
      return 'void';
    case 'blocked':
      return 'blocked';
    default:
      return ready ? 'draft' : 'blocked';
  }
}

/** Adapt a BackendEDFPack to the UI EDFPack shape. */
function toUIPack(r: BackendEDFPack): EDFPack {
  const validation = Array.isArray(r.validation) ? r.validation : [];
  const failedBlocking = validation.filter((item) => item.level === 'blocking' && !item.ok);
  const passed = validation.filter((item) => item.ok).length;
  const progress = validation.length > 0 ? Math.round((passed / validation.length) * 100) : 0;

  const checks: ComplianceCheck[] = validation.map((item, index) => ({
    id: item.key || String(index),
    icon: item.ok ? 'check_circle' : item.level === 'blocking' ? 'error' : 'warning',
    label: item.message,
    status: item.ok ? 'verified' : item.level === 'blocking' ? 'error' : 'pending',
  }));

  return {
    id: String(r.id),
    packNumber: `#EDF-${r.period.year}-${String(r.period.month).padStart(2, '0')}`,
    title: periodLabel(r.period),
    invoiceCount: r.line_count !== null ? `${r.line_count} invoice lines` : 'Not generated',
    invoiceRefs: [],
    client: exporterName(r.exporter),
    status: toPackStatus(r.status, r.pack_ready),
    ready: r.pack_ready,
    value: r.totals ? `₹${INR_FORMAT.format(parseInteger(r.totals.total_inr))}` : '—',
    currency: 'INR',
    purposeCodes: [],
    progress,
    progressLabel: `${progress}%`,
    validationProgress: progress,
    validationLabel: validation.length
      ? `${passed}/${validation.length} checks passed`
      : 'Not validated yet',
    complianceChecks: checks,
    signOffs: [],
    exceptions: failedBlocking.map((item) => item.message),
    // The stored hash is the SHA-256 of the approved snapshot, not an EDPMS ack.
    merkleHash: r.approved_snapshot_hash ?? undefined,
    lodgedDate: r.exported_at ?? undefined,
  };
}

/** Build the four board metric cards from real pack rows. */
function buildMetrics(uiPacks: EDFPack[], rows: BackendEDFPack[]): PackMetric[] {
  const bucket = (status: EDFPackStatus) => {
    const ids = new Set(uiPacks.filter((pack) => pack.status === status).map((pack) => pack.id));
    const subset = rows.filter((row) => ids.has(String(row.id)));
    return { count: subset.length, value: sumInr(subset) };
  };

  const ready = bucket('ready');
  const draft = bucket('draft');
  const blocked = bucket('blocked');
  const exported = bucket('exported');

  return [
    { label: 'Ready to Export', value: ready.count, subtitle: 'Packs', icon: 'rule_folder', status: 'ready', caption: `${ready.value} declared` },
    { label: 'Drafting', value: draft.count, subtitle: 'Pack', icon: 'pending', status: 'draft', caption: `${draft.value} declared` },
    { label: 'Blocked', value: blocked.count, subtitle: 'Alert', icon: 'warning', status: 'blocked', caption: `${blocked.value} held back` },
    { label: 'Filed & Sealed', value: exported.count, subtitle: 'Merkle ✓', icon: 'verified_user', status: 'exported', caption: `${exported.value} lodged` },
  ];
}

/** The newest draft, presented as the pack currently being assembled. */
function buildActiveCompilation(activeRow: BackendEDFPack): ActiveCompilation {
  const ui = toUIPack(activeRow);
  return {
    packId: ui.id,
    packNumber: ui.packNumber,
    client: ui.client,
    description: ui.invoiceCount,
    overallProgress: ui.progress,
    ready: ui.ready,
    checklist: ui.complianceChecks,
  };
}

// ---- reads -------------------------------------------------------------------

/**
 * Fetch the pack board and its summary.
 * Calls GET /edf-packs and GET /edf-packs/summary in parallel. A failure in
 * either leaves the other usable: a missing summary only costs the lifetime
 * count (the fetched rows are the fallback), a missing board is reported as a
 * board error so the page can show it inside the table slot alone.
 */
export async function fetchEDFPacks(): Promise<EDFPacksResponse> {
  const [listResult, summaryResult] = await Promise.allSettled([
    fetchJson<BackendEDFPackListResponse>('/edf-packs', { query: { limit: 200 } }),
    fetchJson<BackendEDFSummary>('/edf-packs/summary'),
  ]);

  const list = settleResult(listResult);
  const summary = settleResult(summaryResult);

  const rows = list.data?.packs ?? [];
  const packs = rows.map(toUIPack);
  const activeRow = rows.find((row) => row.status === 'draft') ?? null;

  return {
    metrics: buildMetrics(packs, rows),
    activeCompilation: activeRow ? buildActiveCompilation(activeRow) : null,
    packs,
    latest: packs[0] ?? null,
    totalPacks: summary.data?.count ?? rows.length,
    engineVersion: rows[0]?.engine_version ?? null,
    errors: {
      packs: list.error,
      summary: summary.error,
    },
  };
}

// ---- lifecycle actions -------------------------------------------------------

/** Add or refresh the draft worksheet for a calendar month (idempotent). */
export function generateEDFPack(
  year: number,
  month: number,
  note?: string,
): Promise<BackendEDFPack> {
  return postJson<BackendEDFPack>('/edf-packs/generate', { year, month, note });
}

/** Re-run the completeness checklist against the current ledger state. */
export function validateEDFPack(packId: number): Promise<BackendEDFPack> {
  return postJson<BackendEDFPack>(`/edf-packs/${packId}/validate`);
}

/** Freeze a ready draft and store the SHA-256 of its snapshot. */
export function approveEDFPack(packId: number, note?: string): Promise<BackendEDFPack> {
  return postJson<BackendEDFPack>(`/edf-packs/${packId}/approve`, note ? { note } : {});
}

/** Void an approved or exported pack so its month can be regenerated. */
export function revokeEDFPack(packId: number, note?: string): Promise<BackendEDFPack> {
  return postJson<BackendEDFPack>(`/edf-packs/${packId}/revoke`, note ? { note } : {});
}

/** Absolute download URL for an approved pack's worksheet. */
export function edfPackExportUrl(packId: number, format: EDFPackExportFormat): string {
  return apiUrl(`/edf-packs/${packId}/export`, { format });
}

/**
 * Download an approved pack. The browser follows the backend's
 * `Content-Disposition` header, so the file lands in the user's downloads.
 */
export function downloadEDFPack(packId: number, format: EDFPackExportFormat): void {
  const link = document.createElement('a');
  link.href = edfPackExportUrl(packId, format);
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
