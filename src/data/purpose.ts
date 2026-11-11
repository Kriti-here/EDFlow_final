import type { 
  PurposeCase, 
  QueueItem, 
  Metric,
  PurposeCodeReference
} from '../types/purpose';

export const metrics: Metric[] = [
  {
    label: 'Pending Review',
    value: 5,
    subtitle: 'invoices',
    icon: 'pending_actions',
  },
  {
    label: 'High Conf (>95%)',
    value: 4,
    subtitle: 'Auto-ready',
    icon: 'auto_awesome',
    variant: 'tertiary',
  },
  {
    label: 'CA Sign-off',
    value: 1,
    subtitle: 'Divergent',
    icon: 'gavel',
    variant: 'error',
  },
  {
    label: 'Approved Today',
    value: 18,
    subtitle: '₹8.42 Cr eq.',
    icon: 'done_all',
    variant: 'primary',
  },
];

export const primaryCase: PurposeCase = {
  id: 'inv-2024-912',
  invoiceRef: 'INV-2024-912',
  nostroRef: 'DB-8849201',
  client: 'Valence Cloud GmbH',
  location: 'Munich, Germany',
  bank: 'Deutsche Bank AG',
  amount: '€38,400.00',
  currency: 'EUR',
  amountUsd: '≈ $41,520 USD',
  direction: 'DE → IN',
  aiConfidence: '98.6%',
  aiEngine: 'B8 Engine',
  aiSuggestion: 'Master Services Agreement §4.2 specifies custom backend architecture delivery and dedicated sprint milestones, qualifying under RBI Trade Purpose Code P0802 rather than pure hosting (P0803). Reduces FEMA reclassification audit penalty risk to 0%.',
  discrepancy: {
    icon: 'notification_important',
    title: 'Bank Inward Advice Divergence',
    description: 'Bank assigned P0803 (Data Hosting) diverges from MSA contract deliverables. AI forensic analysis identifies dedicated microservices & IP transfer.',
  },
  recommendedCode: {
    code: 'P0802',
    label: 'Software Consultancy & Custom Dev',
    description: 'Covers design and development of computer systems & software.',
    category: 'software',
    confidence: '98.6%',
  },
  alternativeCodes: [
    {
      code: 'P0803',
      label: 'Data Hosting & Infra',
      description: 'Covers cloud computing, server collocation & hosting.',
      category: 'hosting',
      confidence: '64.2%',
    },
    {
      code: 'P0801',
      label: 'Hardware & Sys Integration',
      description: 'Zero tangible goods in airway bill',
      category: 'hardware',
      confidence: '21.0%',
    },
  ],
  evidence: [
    {
      id: 'evidence-1',
      icon: 'receipt',
      title: 'Invoice Line Item #1',
      description: '"Custom API & Microservices Cloud Engine Architecture ($38,400.00)"',
      status: 'match',
      matchPercentage: '100%',
    },
    {
      id: 'evidence-2',
      icon: 'account_balance',
      title: 'FIRA Inward String',
      description: 'HSBC/DB Nostro: "SOFTWARE PLATFORM DELIVERABLES Q3 - PROJ REF VAL-2024"',
      status: 'verified',
    },
    {
      id: 'evidence-3',
      icon: 'history_edu',
      title: 'Historical Clearance',
      description: 'Valence Cloud GmbH was successfully lodged under P0802 with 0 EDPMS audit flags since Oct 2023.',
      status: 'verified',
    },
  ],
};

export const queueItems: QueueItem[] = [
  {
    id: 'queue-1',
    invoiceRef: 'INV-2024-918',
    client: 'Apex Robotics Inc.',
    location: 'San Jose, USA',
    bankTag: 'Bank Wire Unspecified',
    amount: '$49,965.00',
    currency: 'USD',
    aiFit: '99.4%',
    recommendedCode: {
      code: 'P0802',
      label: 'Software Consultancy Services',
      description: 'Contract matches AI autonomous stack',
      category: 'software',
    },
    status: 'pending',
  },
  {
    id: 'queue-2',
    invoiceRef: 'INV-2024-904',
    client: 'Kyoto Digital KK',
    location: 'Kyoto, Japan',
    bankTag: 'Tagged: P0807',
    amount: '¥4,800,000',
    currency: 'JPY',
    amountUsd: '~$31,200',
    aiFit: '96.1%',
    recommendedCode: {
      code: 'P1007',
      label: 'Digital Content & Creative Services',
      description: 'Replaces generic technical tag P0807',
      category: 'creative',
    },
    status: 'pending',
  },
  {
    id: 'queue-3',
    invoiceRef: 'INV-2024-870',
    client: 'Seoul BioTech Corp',
    location: 'Seoul, South Korea',
    bankTag: 'Inflow Tag: P1006',
    amount: '$14,200.00',
    currency: 'USD',
    aiFit: '94.8%',
    recommendedCode: {
      code: 'P1006',
      label: 'Biotech & Clinical Trial R&D Services',
      description: 'Lab testing agreement validated',
      category: 'biotech',
    },
    status: 'pending',
  },
];

export const purposeCodeReferences: PurposeCodeReference[] = [
  {
    code: 'P0802',
    label: 'Software Dev',
    description: 'Covers design and development of computer systems & software.',
    color: 'primary',
  },
  {
    code: 'P0803',
    label: 'Hosting & Cloud',
    description: 'Covers cloud computing, server collocation & hosting.',
    color: 'secondary',
  },
  {
    code: 'P1007',
    label: 'Creative & Media',
    description: 'Covers interactive digital media, design, video asset production.',
    color: 'tertiary',
  },
  {
    code: 'P1006',
    label: 'Biotech R&D',
    description: 'Covers pharmacological laboratory testing, clinical phases 1-3.',
    color: 'on-surface',
  },
];

export const regulatoryInfo = {
  version: 'v24.1',
  title: 'RBI Purpose Code Index',
  subtitle: 'Master Direction (Inward Services updated 2024)',
  nodeId: 'BLR-DGFT-092-B',
  syncTime: '42s ago',
};
