export type ExceptionSeverity = 'critical' | 'high' | 'medium' | 'low';

export type ExceptionCategory = 
  | 'all'
  | 'critical'
  | 'purpose'
  | 'variance'
  | 'missing-fira'
  | 'unmatched'
  | 'medium'
  | 'high';

export type ExceptionStatus = 'open' | 'resolved' | 'pending';

// KPI Metrics for the top banner
export interface ExceptionKpi {
  label: string;
  value: string | number;
  icon?: string;
  subtitle?: string;
  variant?: ExceptionSeverity;
}

// Filter pill configuration
export interface FilterPill {
  label: string;
  count: number;
  category: ExceptionCategory;
  active: boolean;
}

// Individual exception record
export interface ExceptionItem {
  id: string;
  code: string;
  invoiceRef: string;
  title: string;
  client: string;
  country: string;
  currency: string;
  amount: string;
  amountUsd?: string;
  severity: ExceptionSeverity;
  categories: ExceptionCategory[];
  timestamp: string;
  deadline?: string;
  description: string;
  aiRecommendation?: {
    engine: string;
    confidence: string;
    suggestion: string;
  };
  problemDetails?: {
    icon: string;
    title: string;
    description: string;
  };
  complianceInfo?: {
    icon: string;
    title: string;
    description: string;
  };
  actions: {
    primary: {
      label: string;
      icon: string;
      onClick: string;
    };
    secondary?: {
      label: string;
      icon?: string;
      onClick: string;
    };
  };
  bankInfo?: string;
  shippingBill?: string;
}

// Resolved exception for the "Resolved Today" section
export interface ResolvedException {
  id: string;
  invoiceRef: string;
  amount: string;
  description: string;
  resolutionType: 'auto' | 'manual';
  timestamp: string;
}

// Section header configuration
export interface ExceptionSection {
  id: string;
  title: string;
  severity: ExceptionSeverity;
  count: number;
  subtitle: string;
}

// Toast notification
export interface ToastNotification {
  message: string;
  visible: boolean;
}
