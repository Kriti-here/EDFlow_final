// Exporter profile data from the existing backend endpoints:
//   GET /exporter -> profile row (404 until the profile is first saved)
//   PUT /exporter -> upsert the profile and return the saved row
//
// These are the only fields the backend accepts, so no extra keys are sent.

import { ApiError, fetchJson, putJson } from './api';

/** Exporter identity fields accepted by PUT /exporter. */
export interface ExporterInput {
  legal_name: string;
  entity_type: string;
  pan: string | null;
  gstin: string | null;
  lut_number: string | null;
  lut_not_applicable: boolean;
  ad_bank_name: string | null;
  ad_code: string | null;
  ie_code: string | null;
  address: string | null;
  sac_code: string | null;
}

/** Saved exporter profile (input fields plus the server-assigned id/timestamps). */
export type ExporterProfile = ExporterInput & {
  id: number;
  created_at?: string;
  updated_at?: string;
};

/** Read the exporter profile, or null when it has not been set yet (404). */
export async function fetchExporter(): Promise<ExporterProfile | null> {
  try {
    return await fetchJson<ExporterProfile>('/exporter');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Create or update the exporter profile. */
export function saveExporter(body: ExporterInput): Promise<ExporterProfile> {
  return putJson<ExporterProfile>('/exporter', body);
}
