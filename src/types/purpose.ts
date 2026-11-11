export type PurposeCode = {
  code: string;
  label: string;
  description: string;
  category: string;
  confidence?: string;
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
  nostroRef: string;
  client: string;
  location: string;
  bank: string;
  amount: string;
  currency: string;
  amountUsd?: string;
  direction: string;
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
};

export type QueueItem = {
  id: string;
  invoiceRef: string;
  client: string;
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
};
