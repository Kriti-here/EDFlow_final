// Rules service. GET /rules returns the loaded regulation config from
// rules/india_export.yaml — including every purpose code with its verification
// flag — so the UI never has to hardcode a regulation.

import { fetchJson } from './api';

/** One purpose code entry as the rules file defines it. */
export interface PurposeCodeRule {
  code: string;
  description: string | null;
  category: string | null;
  verified: boolean;
  source: string | null;
  last_verified: string | null;
}

/** Trimmed shape of the `/rules` summary used by the UI. */
export interface RulesSummary {
  source: string;
  version: string | null;
  last_updated: string | null;
  verification_status: string | null;
  verified: boolean;
  last_verified: string | null;
  purpose_codes: PurposeCodeRule[];
}

export function fetchRules(): Promise<RulesSummary> {
  return fetchJson<RulesSummary>('/rules');
}
