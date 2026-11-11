import type { FiraDocument, FilterTab, FiraMetricsProps, BankNode } from '../types/fira';

export type { FiraDocument, FilterTab, FiraMetricsProps, BankNode } from '../types/fira';

export const firaMetrics: FiraMetricsProps[] = [
  {
    label: 'IMPORTED FIRAs',
    value: '46',
    icon: 'receipt_long',
    subtitle: 'AD Cat-I Verified',
    delta: '+4 today',
  },
  {
    label: 'TOTAL INWARD',
    value: '$1.26M',
    icon: 'payments',
    subtitle: 'Cross-border USD/EUR',
  },
  {
    label: 'PAIRED',
    value: '43',
    icon: 'check_circle',
    subtitle: '/ 46',
    progress: 93.4,
  },
  {
    label: 'UNLINKED ORPHANS',
    value: '3',
    icon: 'priority_high',
    subtitle: 'Requires Action',
  },
];

export const bankNodes: BankNode[] = [
  { name: 'JPMorgan Nostro', status: 'active' },
  { name: 'Citi AD Cat-I', status: 'active' },
  { name: 'HSBC Trade', status: 'active' },
];

export const filterTabs: FilterTab[] = [
  { label: 'All', count: 46, active: true, variant: 'primary' },
  { label: 'Auto-Paired', count: 43, active: false },
  { label: 'Unlinked', count: 3, active: false, variant: 'error' },
  { label: 'e-Signed', count: 41, active: false },
  { label: 'Discrepancies', count: 1, active: false },
];

export const firaDocuments: FiraDocument[] = [
  {
    id: '1',
    ref: 'FIRA-2024-0042',
    bank: 'JPMorgan Chase Nostro',
    swiftRef: 'MT103-US88912',
    remittanceValue: '$42,500.00',
    currency: 'USD',
    remitter: 'TechGlobal Corp',
    purposeCode: 'P0802',
    linkedInvoice: 'INV-2024-901',
    invoiceAmount: '$42,500.00',
    status: 'fully-linked',
    timestamp: 'Arrived 1h ago',
    hash: 'SHA256: 9e0b...44a7f2',
    bankStamp: 'Bank DSC Verified',
  },
  {
    id: '2',
    ref: 'FIRA-2024-0041',
    bank: 'Citibank NA',
    swiftRef: 'CITI-99210',
    remittanceValue: '$49,965.00',
    currency: 'USD',
    remitter: 'Apex Robotics Inc.',
    purposeCode: 'P0103',
    linkedInvoice: 'INV-2024-889',
    invoiceAmount: '$50,000.00',
    status: 'tolerated-discrepancy',
    discrepancy: 'Intermediary Wire Fee',
    timestamp: 'Arrived 2h ago',
    hash: 'SHA256: 8f3a...b8c2d1',
    bankStamp: 'Variance Cleared',
  },
  {
    id: '3',
    ref: 'FIRA-2024-0040',
    bank: 'HSBC London',
    swiftRef: 'HSBC-UK441',
    remittanceValue: '€38,400.00',
    currency: 'EUR',
    remitter: 'Valence Cloud GmbH',
    purposeCode: 'P0803',
    status: 'pending-purpose',
    aiSuggestion: 'P0803 (Data Hosting)',
    timestamp: 'Arrived 2h ago',
    hash: 'SHA256: 7c2e...f5a9b3',
    bankStamp: 'HSBC Bank Stamp Attached',
  },
  {
    id: '4',
    ref: 'FIRA-2024-0039',
    bank: 'Deutsche Bank',
    swiftRef: 'DB-98442',
    remittanceValue: '$12,800.00',
    currency: 'USD',
    remitter: 'Unresolved Beneficiary Tag',
    purposeCode: 'Unassigned',
    status: 'unlinked',
    timestamp: 'Arrived 3h ago',
    hash: 'SHA256: 6b1d...e4c8f0',
    bankStamp: 'Pending Counterparty Reconciliation',
  },
];

export const syncStatus = {
  message: 'Automated EDPMS synchronization running',
  rate: '93.4% Auto-settlement rate',
};

export const bankIngestionStatus = {
  title: 'Direct Bank API Ingestion',
  status: 'Polling Live',
};
