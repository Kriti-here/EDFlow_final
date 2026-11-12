export type EDFPackStatus = 'ready' | 'draft' | 'blocked' | 'exported' | 'void';

/** Lifecycle transitions the pack board can trigger through the backend. */
export type EdfPackAction = 'validate' | 'approve' | 'revoke';

/** Formats served by GET /edf-packs/{id}/export. */
export type EDFPackExportFormat = 'json' | 'csv' | 'pdf';

export type ComplianceCheck = {
  id: string;
  icon: string;
  label: string;
  status: 'verified' | 'pending' | 'error';
  description?: string;
};

export type SignOff = {
  role: string;
  icon: string;
  status: 'signed' | 'verified' | 'pending' | 'active';
};

export type EDFPack = {
  id: string;
  packNumber: string;
  title: string;
  invoiceCount: string;
  invoiceRefs: string[];
  client: string;
  status: EDFPackStatus;
  /** Backend `pack_ready`: no blocking validation check has failed. */
  ready?: boolean;
  value: string;
  valueInr?: string;
  currency: string;
  purposeCodes: string[];
  aiConfidence?: string;
  progress: number;
  progressLabel: string;
  validationProgress: number;
  validationLabel: string;
  complianceChecks: ComplianceCheck[];
  signOffs: SignOff[];
  exceptions?: string[];
  edpmsAck?: string;
  merkleHash?: string;
  lodgedDate?: string;
  bank?: string;
  message?: string;
};

export type PackMetric = {
  label: string;
  value: number | string;
  subtitle: string;
  icon: string;
  status?: 'ready' | 'draft' | 'blocked' | 'exported';
  /** Optional real, derived sub-figure (never a placeholder). */
  caption?: string;
};

export type ActiveCompilation = {
  packId: string;
  packNumber: string;
  client: string;
  description: string;
  overallProgress: number;
  /** Backend `pack_ready` for the draft being assembled. */
  ready?: boolean;
  checklist: ComplianceCheck[];
};

export type ExportFormat = {
  name: string;
  icon: string;
  description: string;
};
