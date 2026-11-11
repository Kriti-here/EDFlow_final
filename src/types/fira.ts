// FIRA Document types
export type FiraStatus = 'fully-linked' | 'tolerated-discrepancy' | 'pending-purpose' | 'unlinked';

export type FiraStatusBadgeProps = {
  status: FiraStatus;
  label: string;
};

export type FiraDocument = {
  // Existing UI fields
  id: string;
  ref: string;
  bank: string;
  swiftRef: string;
  remittanceValue: string;
  currency: string;
  remitter: string;
  purposeCode: string;
  linkedInvoice?: string;
  invoiceAmount?: string;
  status: FiraStatus;
  discrepancy?: string;
  aiSuggestion?: string;
  timestamp: string;
  hash: string;
  bankStamp: string;
  // Additional backend fields (optional)
  fira_reference?: string;
  bank_name?: string;
  ad_code?: string;
  verification_status?: string;
  issues?: string[];
  created_at?: string;
  // Allow extra unknown fields
  [key: string]: any;
};

export type FiraMetricsProps = {
  label: string;
  value: string;
  icon: string;
  subtitle: string;
  delta?: string;
  progress?: number;
};

export type BankNode = {
  name: string;
  status: 'active' | 'inactive';
};

export type BankNodeProps = BankNode;

export type FilterTab = {
  label: string;
  count: number;
  active?: boolean;
  variant?: 'default' | 'error' | 'primary';
};