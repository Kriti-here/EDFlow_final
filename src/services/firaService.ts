// Service for FIRA documents.
// Backend: GET  /fira/documents            → {count, documents: FiraDocumentRecord[]}
//          GET  /fira/documents/{id}       → one document including its extracted lines
//          POST /fira/documents            (multipart field "file") → the stored document

import { fetchJson, postForm } from './api';

/** One extracted statement line. Money is decimal text, never a JSON float. */
export interface FiraLineRecord {
  id: number;
  line_no: number | null;
  utr: string | null;
  value_date: string | null;
  remitter_name: string | null;
  remitter_country: string | null;
  currency: string | null;
  gross_amount: string | null;
  bank_charges: string | null;
  net_amount_inr: string | null;
  purpose_code: string | null;
  invoice_reference: string | null;
  confidence_bp: number | null;
  /** verified | needs_review | failed */
  verification_status: string;
  issues: string[];
}

/** An uploaded FIRA statement. `lines` is only present on the detail endpoint. */
export interface FiraDocumentRecord {
  id: number;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  sha256: string;
  page_count: number | null;
  fira_reference: string | null;
  bank_name: string | null;
  ad_code: string | null;
  statement_period_start: string | null;
  statement_period_end: string | null;
  generated_on: string | null;
  source: string | null;
  is_synthetic: boolean;
  confidence_bp: number | null;
  /** verified | needs_review | failed */
  verification_status: string;
  line_count: number | null;
  issues: string[];
  created_at: string | null;
  lines?: FiraLineRecord[];
}

export interface ListFiraResponse {
  count: number;
  documents: FiraDocumentRecord[];
}

/** Fetch the most recent FIRA documents (lines excluded by the API). */
export async function fetchFiraDocuments(): Promise<FiraDocumentRecord[]> {
  const data = await fetchJson<ListFiraResponse>('/fira/documents');
  return data.documents;
}

/** Fetch one FIRA document together with its extracted lines. */
export function fetchFiraDocument(id: number): Promise<FiraDocumentRecord> {
  return fetchJson<FiraDocumentRecord>(`/fira/documents/${id}`);
}

/**
 * Upload a FIRA PDF. The backend extracts, verifies and stores it, and is
 * idempotent by content hash (a duplicate returns 409).
 */
export async function uploadFiraDocument(file: File): Promise<FiraDocumentRecord> {
  const form = new FormData();
  form.append('file', file);
  return postForm<FiraDocumentRecord>('/fira/documents', form);
}
