// Service to fetch FIRA-to-invoice matching results from backend API

export type MatchStatus = 'matched' | 'unmatched' | 'partial' | 'exception';

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

export async function fetchMatchingResults(): Promise<MatchingResultsResponse> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '';
  const response = await fetch(`${base}/api/matching/results`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch matching results: ${response.status} ${text}`);
  }
  return response.json() as Promise<MatchingResultsResponse>;
}
