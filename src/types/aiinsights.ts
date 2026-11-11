// AI Insights Types and Interfaces

export interface DecisionRecord {
  id: string;
  company: string;
  amount: string;
  currency: string;
  status: 'accepted' | 'overridden' | 'escalated';
  description: string;
  modelConfidence?: string;
  timestamp: string;
  hash?: string;
  details?: string;
  auditor?: string;
  proposedCode?: string;
  actualCode?: string;
  caseNumber?: string;
}

export interface MetricCardData {
  id: string;
  label: string;
  value: string;
  subtitle: string;
  icon: string;
  iconColor?: string;
}

export interface HeuristicItem {
  id: string;
  title: string;
  description: string;
  status: string;
  statusColor: string;
  trace?: string;
  counterparty?: string;
}

export interface ConfidenceBar {
  id: string;
  label: string;
  percentage: number;
  color: string;
  description: string;
}

export interface GuardrailItem {
  id: string;
  title: string;
  description: string;
  status: string;
  statusColor: string;
}

export interface ForensicAudit {
  invoiceNumber: string;
  company: string;
  confidence: string;
  aiProposedCode: string;
  bankTag: string;
  bankTagCorrect: boolean;
  codeDescription: string;
  amount: string;
  rationale: string;
  shaHash: string;
  authorityAlignment: string;
  confidenceFactors: { label: string; value: string }[];
}

export interface EngineStatus {
  title: string;
  icon: string;
  uptime: string;
  uptimeColor: string;
  description: string;
}

export interface ReplayCache {
  title: string;
  icon: string;
  status: string;
  description: string;
  merkleSeed: string;
  blockNumber: string;
}

// Status types
export type DecisionStatus = 'all' | 'accepted' | 'overridden' | 'escalated';

// Filter tab
export interface FilterTab {
  id: DecisionStatus;
  label: string;
  count: number;
}
