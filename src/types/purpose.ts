export type PurposeCode = {
  code: string;
  label: string;
  description: string;
  category: string;
  confidence?: string;
  /** `verified` flag from rules/india_export.yaml; false is shown as unverified. */
  verified?: boolean;
  /** Where the code definition came from (rules section or recommendation source). */
  source?: string;
};

export type Recommendation = {
  code: string;
  label: string;
  confidence: string;
  description: string;
  regulatoryReference?: string;
};

export type EvidenceItem = {
  id: string;
  icon: string;
  title: string;
  description: string;
  status: 'verified' | 'match' | 'pending';
  matchPercentage?: string;
};

export type PurposeCase = {
  id: string;
  invoiceRef: string;
  /** Nostro reference; empty when the ledger has none for this invoice. */
  nostroRef?: string;
  client: string;
  location: string;
  /** Bank name; omitted when the record carries no bank. */
  bank?: string;
  amount: string;
  currency: string;
  amountUsd?: string;
  /** "DE → IN"; omitted when the direction is unknown. */
  direction?: string;
  recommendedCode: PurposeCode;
  alternativeCodes: PurposeCode[];
  evidence: EvidenceItem[];
  discrepancy?: {
    icon: string;
    title: string;
    description: string;
  };
  aiConfidence: string;
  aiEngine: string;
  aiSuggestion: string;
  /** Confidence band from the backend (high | medium | low). */
  aiBand?: string;
  /** Recommendation lifecycle status (proposed | accepted | rejected). */
  aiStatus?: string;
  /** Source of the regulation behind the code, e.g. rules/india_export.yaml. */
  regulatoryReference?: string;
};

export type QueueItem = {
  id: string;
  invoiceRef: string;
  client: string;
  /** Buyer country; empty when the invoice has none recorded. */
  location: string;
  bankTag: string;
  amount: string;
  currency: string;
  amountUsd?: string;
  recommendedCode: PurposeCode;
  aiFit: string;
  status: 'pending' | 'approved' | 'escalated';
};

export type Metric = {
  label: string;
  value: number | string;
  subtitle: string;
  icon: string;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'error';
};

export type PurposeCodeReference = {
  code: string;
  label: string;
  description: string;
  color: string;
  /** `verified` flag from rules/india_export.yaml. */
  verified?: boolean;
  source?: string;
  lastVerified?: string;
};
